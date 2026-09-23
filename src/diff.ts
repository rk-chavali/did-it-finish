/** Parse the unified-diff `patch` GitHub returns for each changed file. */

export type FileStatus =
  | "added"
  | "removed"
  | "modified"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged";

export interface ChangedFile {
  filename: string;
  status: FileStatus;
  previousFilename?: string;
  /** Missing when GitHub omits it (binary or very large files). */
  patch?: string;
}

export interface PatchLine {
  kind: "add" | "remove" | "context";
  /** New-file line number for add and context lines, old-file line number for removed lines. */
  line: number;
  text: string;
}

export interface Hunk {
  lines: PatchLine[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parsePatch(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | undefined;
  let oldLine = 0;
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      current = { lines: [] };
      hunks.push(current);
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      continue;
    }
    if (!current || raw.startsWith("\\")) {
      continue; // preamble, or "\ No newline at end of file"
    }
    const marker = raw[0];
    const text = raw.slice(1).replace(/\r$/, "");
    if (marker === "+") {
      current.lines.push({ kind: "add", line: newLine++, text });
    } else if (marker === "-") {
      current.lines.push({ kind: "remove", line: oldLine++, text });
    } else {
      current.lines.push({ kind: "context", line: newLine++, text });
      oldLine++;
    }
  }
  return hunks;
}

export function addedLines(hunks: Hunk[]): PatchLine[] {
  return hunks.flatMap((hunk) => hunk.lines.filter((line) => line.kind === "add"));
}

export function removedLines(hunks: Hunk[]): PatchLine[] {
  return hunks.flatMap((hunk) => hunk.lines.filter((line) => line.kind === "remove"));
}
