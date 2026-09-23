import { describe, expect, it } from "vitest";

import { addedLines, parsePatch, removedLines } from "../src/diff.js";

describe("parsePatch", () => {
  it("tracks old and new line numbers across hunks", () => {
    const patch = [
      "@@ -1,3 +1,3 @@",
      " keep",
      "-old",
      "+new",
      " keep2",
      "@@ -20,2 +20,3 @@ function x() {",
      " a",
      "+b",
      "+c\r",
      "\\ No newline at end of file",
    ].join("\n");
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(2);
    expect(addedLines(hunks)).toEqual([
      { kind: "add", line: 2, text: "new" },
      { kind: "add", line: 21, text: "b" },
      { kind: "add", line: 22, text: "c" },
    ]);
    expect(removedLines(hunks)).toEqual([{ kind: "remove", line: 2, text: "old" }]);
  });

  it("returns nothing for an empty patch", () => {
    expect(parsePatch("")).toEqual([]);
  });
});
