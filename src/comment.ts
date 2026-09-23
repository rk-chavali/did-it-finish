/** Render the sticky PR comment. */

import { BLOCKING, FINDING_TYPES, type Finding, type FindingType, type Verdict } from "./findings.js";
import type { TestRun } from "./run-tests.js";

export const MARKER = "<!-- did-it-finish -->";
const MAX_ITEMS_PER_TYPE = 15;

const TITLES: Record<FindingType, string> = {
  "tests-failed": "Tests failed",
  "tests-deleted": "Test files deleted",
  "stubs-added": "Stubs added",
  "unchecked-tasks": "Unchecked tasks in the PR description",
  "assertions-removed": "Assertions removed",
  "tests-skipped": "Tests newly skipped",
  "todos-added": "New TODO or FIXME",
};

const VERDICT_TEXT: Record<Verdict, string> = {
  Done: "No signs of unfinished work.",
  "Probably done": "Nothing blocking, but some changes are worth a second look.",
  "Not done": "This pull request has signs of unfinished work.",
};

export interface CommentContext {
  repository: string;
  headSha: string;
  serverUrl: string;
}

function link(finding: Finding, context: CommentContext): string {
  if (!finding.file) {
    return "";
  }
  const anchor = finding.line ? `#L${String(finding.line)}` : "";
  const label = finding.line ? `${finding.file}:${String(finding.line)}` : finding.file;
  const path = finding.file.split("/").map(encodeURIComponent).join("/");
  return `[\`${label}\`](${context.serverUrl}/${context.repository}/blob/${context.headSha}/${path}${anchor}) `;
}

export function renderComment(
  verdict: Verdict,
  findings: readonly Finding[],
  tests: TestRun | undefined,
  context: CommentContext,
): string {
  const out = [MARKER, `## did-it-finish: ${verdict}`, "", VERDICT_TEXT[verdict], ""];
  if (findings.length > 0) {
    out.push("| Check | Count | Blocks \"done\" |", "|---|---|---|");
    for (const type of FINDING_TYPES) {
      const count = findings.filter((f) => f.type === type).length;
      if (count > 0) {
        out.push(`| ${TITLES[type]} | ${String(count)} | ${BLOCKING.has(type) ? "yes" : "no"} |`);
      }
    }
    out.push("");
    for (const type of FINDING_TYPES) {
      const items = findings.filter((f) => f.type === type && type !== "tests-failed");
      if (items.length === 0) {
        continue;
      }
      out.push(`### ${TITLES[type]}`, "");
      for (const item of items.slice(0, MAX_ITEMS_PER_TYPE)) {
        out.push(`- ${link(item, context)}${item.message}`);
      }
      if (items.length > MAX_ITEMS_PER_TYPE) {
        out.push(`- ...and ${String(items.length - MAX_ITEMS_PER_TYPE)} more`);
      }
      out.push("");
    }
  }
  if (tests) {
    const seconds = (tests.durationMs / 1000).toFixed(1);
    const status = tests.passed
      ? "passed"
      : tests.timedOut
        ? "timed out"
        : `failed (exit code ${String(tests.exitCode)})`;
    out.push("### Tests", "", `\`${tests.command}\` ${status} in ${seconds}s.`, "");
    if (tests.tail) {
      const fence = tests.tail.includes("```") ? "~~~" : "```";
      out.push("<details><summary>Output (last lines)</summary>", "", `${fence}text`, tests.tail, fence, "", "</details>", "");
    }
  }
  out.push(`<sub>Checked commit ${context.headSha.slice(0, 7)}.</sub>`);
  return out.join("\n");
}
