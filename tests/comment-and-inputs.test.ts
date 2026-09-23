import { describe, expect, it } from "vitest";

import { MARKER, renderComment } from "../src/comment.js";
import type { Finding } from "../src/findings.js";
import { InputError, parseFailOn, readInputs } from "../src/inputs.js";

const context = { repository: "acme/shop", headSha: "0123456789abcdef", serverUrl: "https://github.com" };

describe("renderComment", () => {
  it("starts with the marker and links findings to the head commit", () => {
    const findings: Finding[] = [
      { type: "stubs-added", file: "src/my file.py", line: 7, message: "stub: `pass`" },
      { type: "todos-added", file: "src/a.ts", line: 3, message: "`// TODO`" },
      { type: "unchecked-tasks", message: "unchecked task: docs" },
    ];
    const body = renderComment("Not done", findings, undefined, context);
    expect(body.startsWith(`${MARKER}\n## did-it-finish: Not done`)).toBe(true);
    expect(body).toContain("| Stubs added | 1 | yes |");
    expect(body).toContain("| New TODO or FIXME | 1 | no |");
    expect(body).toContain(
      "- [`src/my file.py:7`](https://github.com/acme/shop/blob/0123456789abcdef/src/my%20file.py#L7) stub: `pass`",
    );
    expect(body).toContain("- unchecked task: docs");
    expect(body).toContain("Checked commit 0123456.");
  });

  it("includes the test result and output", () => {
    const tests = {
      command: "npm test",
      passed: false,
      exitCode: 1,
      timedOut: false,
      durationMs: 4200,
      tail: "FAIL src/a.test.ts\n```nested```",
    };
    const body = renderComment("Not done", [{ type: "tests-failed", message: "exit 1" }], tests, context);
    expect(body).toContain("`npm test` failed (exit code 1) in 4.2s.");
    expect(body).toContain("~~~text\nFAIL src/a.test.ts");
    expect(body).not.toContain("### Tests failed");
  });

  it("says Done plainly when there is nothing", () => {
    expect(renderComment("Done", [], undefined, context)).toContain("No signs of unfinished work.");
  });
});

describe("inputs", () => {
  const reader = (values: Record<string, string>) => (name: string) => values[name] ?? "";

  it("uses defaults", () => {
    expect(readInputs(reader({}))).toEqual({
      testCommand: "",
      failOn: ["tests-failed"],
      timeoutMs: 30 * 60_000,
      tailLines: 40,
      comment: true,
    });
  });

  it("parses fail-on lists, any, and none", () => {
    expect(parseFailOn("stubs-added, tests-deleted\nunchecked-tasks")).toEqual([
      "stubs-added",
      "tests-deleted",
      "unchecked-tasks",
    ]);
    expect(parseFailOn("any")).toHaveLength(7);
    expect(parseFailOn("none")).toEqual([]);
    expect(() => parseFailOn("stubs")).toThrow(InputError);
  });

  it("rejects bad numbers and booleans", () => {
    expect(() => readInputs(reader({ "test-timeout-minutes": "0" }))).toThrow(/positive integer/);
    expect(() => readInputs(reader({ "test-output-lines": "-1" }))).toThrow(/non-negative/);
    expect(() => readInputs(reader({ comment: "yes" }))).toThrow(/true or false/);
    expect(readInputs(reader({ "test-output-lines": "0", comment: "false" })).comment).toBe(false);
  });
});
