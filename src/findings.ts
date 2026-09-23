/** Turn a pull request's changed files and body into findings and a verdict. */

import { type ChangedFile, type Hunk, type PatchLine, addedLines, parsePatch, removedLines } from "./diff.js";
import {
  PYTHON_ABSTRACT_DECORATOR,
  PYTHON_DEF,
  PYTHON_ONE_LINE_STUB,
  countAssertions,
  isSkip,
  isTestFile,
  isTodo,
  stubStatement,
} from "./patterns.js";

export const FINDING_TYPES = [
  "tests-failed",
  "tests-deleted",
  "stubs-added",
  "unchecked-tasks",
  "assertions-removed",
  "tests-skipped",
  "todos-added",
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

/** Findings that mean the work is unfinished. The rest only lower confidence. */
export const BLOCKING: ReadonlySet<FindingType> = new Set([
  "tests-failed",
  "tests-deleted",
  "stubs-added",
  "unchecked-tasks",
]);

export type Verdict = "Done" | "Probably done" | "Not done";

export interface Finding {
  type: FindingType;
  message: string;
  file?: string;
  line?: number;
}

export function verdictFor(findings: readonly Finding[]): Verdict {
  if (findings.some((f) => BLOCKING.has(f.type))) {
    return "Not done";
  }
  return findings.length > 0 ? "Probably done" : "Done";
}

export function analyzeFiles(files: readonly ChangedFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const testFile = isTestFile(file.filename);
    if (file.status === "removed") {
      if (testFile) {
        findings.push({ type: "tests-deleted", file: file.filename, message: "test file deleted" });
      }
      continue;
    }
    if (file.patch === undefined) {
      continue;
    }
    const hunks = parsePatch(file.patch);
    const added = addedLines(hunks);
    if (testFile) {
      findings.push(...assertionChanges(file.filename, added, removedLines(hunks)));
      for (const line of added) {
        if (isSkip(line.text)) {
          findings.push({
            type: "tests-skipped",
            file: file.filename,
            line: line.line,
            message: `test skipped: \`${clip(line.text.trim())}\``,
          });
        }
      }
    } else {
      findings.push(...stubs(file.filename, hunks, added));
    }
    for (const line of added) {
      if (isTodo(line.text)) {
        findings.push({
          type: "todos-added",
          file: file.filename,
          line: line.line,
          message: `\`${clip(line.text.trim())}\``,
        });
      }
    }
  }
  return findings;
}

function assertionChanges(file: string, added: PatchLine[], removed: PatchLine[]): Finding[] {
  const gained = added.reduce((sum, line) => sum + countAssertions(line.text), 0);
  const lost = removed.reduce((sum, line) => sum + countAssertions(line.text), 0);
  if (gained >= lost) {
    return [];
  }
  const first = removed.find((line) => countAssertions(line.text) > 0);
  return [
    {
      type: "assertions-removed",
      file,
      message: `${String(lost - gained)} fewer assertion(s): ${String(lost)} removed, ${String(gained)} added`,
      ...(first ? { line: first.line } : {}),
    },
  ];
}

function stubs(file: string, hunks: Hunk[], added: PatchLine[]): Finding[] {
  const found: Finding[] = [];
  for (const line of added) {
    if (stubStatement(line.text)) {
      found.push({ type: "stubs-added", file, line: line.line, message: `stub: \`${clip(line.text.trim())}\`` });
    }
  }
  if (file.endsWith(".py")) {
    for (const hunk of hunks) {
      found.push(...pythonPassOnlyFunctions(file, hunk));
    }
  }
  return found;
}

const indentOf = (text: string): number => text.length - text.trimStart().length;
const isBlankOrComment = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.startsWith("#");
};

/** New `def` whose whole body is `pass` or `...`, found in the new-file view of a hunk. */
function pythonPassOnlyFunctions(file: string, hunk: Hunk): Finding[] {
  const view = hunk.lines.filter((line) => line.kind !== "remove");
  const found: Finding[] = [];
  view.forEach((defLine, index) => {
    if (defLine.kind !== "add" || !PYTHON_DEF.test(defLine.text)) {
      return;
    }
    const decorators = view.slice(Math.max(0, index - 3), index);
    if (decorators.some((line) => PYTHON_ABSTRACT_DECORATOR.test(line.text))) {
      return;
    }
    const report = (): void => {
      found.push({
        type: "stubs-added",
        file,
        line: defLine.line,
        message: `function body is only \`pass\` or \`...\`: \`${clip(defLine.text.trim())}\``,
      });
    };
    if (PYTHON_ONE_LINE_STUB.test(defLine.text)) {
      report();
      return;
    }
    const signatureEnd = view.findIndex(
      (line, i) => i >= index && i < index + 10 && line.text.replace(/#.*$/, "").trimEnd().endsWith(":"),
    );
    if (signatureEnd === -1) {
      return;
    }
    let cursor = signatureEnd + 1;
    const skipBlank = (): void => {
      while (cursor < view.length && isBlankOrComment(view[cursor]?.text ?? "")) {
        cursor++;
      }
    };
    skipBlank();
    const docstring = view[cursor]?.text.trim() ?? "";
    const quote = docstring.startsWith('"""') ? '"""' : docstring.startsWith("'''") ? "'''" : null;
    if (quote) {
      if (docstring.length >= 6 && docstring.endsWith(quote)) {
        cursor++;
      } else {
        cursor++;
        while (cursor < view.length && !(view[cursor]?.text.includes(quote) ?? false)) {
          cursor++;
        }
        cursor++;
      }
      skipBlank();
    }
    const body = view[cursor];
    const defIndent = indentOf(defLine.text);
    if (!body || body.kind !== "add" || !["pass", "..."].includes(body.text.trim())) {
      return;
    }
    if (indentOf(body.text) <= defIndent) {
      return;
    }
    cursor++;
    skipBlank();
    const next = view[cursor];
    if (next === undefined || indentOf(next.text) <= defIndent) {
      report();
    }
  });
  return found;
}

const TASK = /^\s*[-*+]\s+\[ \]\s+(.+)$/;

export function uncheckedTasks(body: string | null | undefined): Finding[] {
  if (!body) {
    return [];
  }
  const withoutComments = body.replace(/<!--[\s\S]*?-->/g, "");
  const found: Finding[] = [];
  for (const line of withoutComments.split(/\r?\n/)) {
    const match = TASK.exec(line);
    if (match?.[1]) {
      found.push({ type: "unchecked-tasks", message: `unchecked task: ${clip(match[1].trim())}` });
    }
  }
  return found;
}

function clip(text: string, limit = 120): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 3)}...`;
}
