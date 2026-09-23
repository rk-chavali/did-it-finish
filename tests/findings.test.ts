import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ChangedFile } from "../src/diff.js";
import { type Finding, analyzeFiles, uncheckedTasks, verdictFor } from "../src/findings.js";

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)), "utf8");

const modified = (filename: string, patchName: string): ChangedFile => ({
  filename,
  status: "modified",
  patch: fixture(patchName),
});

const summarize = (findings: Finding[]): [string, string | undefined, number | undefined][] =>
  findings.map((f) => [f.type, f.file, f.line]);

describe("tests-deleted", () => {
  it("flags removed test files only", () => {
    const findings = analyzeFiles([
      { filename: "src/cart.test.ts", status: "removed" },
      { filename: "tests/test_orders.py", status: "removed" },
      { filename: "src/legacy.ts", status: "removed" },
    ]);
    expect(summarize(findings)).toEqual([
      ["tests-deleted", "src/cart.test.ts", undefined],
      ["tests-deleted", "tests/test_orders.py", undefined],
    ]);
  });
});

describe("assertions-removed", () => {
  it("reports a net drop in assertions in a test file", () => {
    const findings = analyzeFiles([modified("src/checkout.spec.ts", "assertions-removed.patch")]);
    expect(findings).toEqual([
      {
        type: "assertions-removed",
        file: "src/checkout.spec.ts",
        line: 12,
        message: "2 fewer assertion(s): 3 removed, 1 added",
      },
    ]);
  });

  it("ignores rewritten assertions with the same count", () => {
    expect(analyzeFiles([modified("tests/test_orders.py", "assertions-python.patch")])).toEqual([]);
  });

  it("ignores assertion-like code outside test files", () => {
    expect(analyzeFiles([modified("src/checkout.ts", "assertions-removed.patch")])).toEqual([]);
  });
});

describe("tests-skipped", () => {
  it("finds JavaScript skips", () => {
    const findings = analyzeFiles([modified("src/render.test.tsx", "tests-skipped.patch")]);
    expect(summarize(findings)).toEqual([
      ["tests-skipped", "src/render.test.tsx", 3],
      ["tests-skipped", "src/render.test.tsx", 7],
    ]);
    expect(findings[0]?.message).toBe('test skipped: `it.skip("renders the header", () => {`');
  });

  it("finds pytest skips", () => {
    const findings = analyzeFiles([modified("tests/test_sync.py", "tests-skipped-python.patch")]);
    expect(summarize(findings)).toEqual([["tests-skipped", "tests/test_sync.py", 4]]);
  });
});

describe("todos-added", () => {
  it("finds TODO and FIXME as whole words", () => {
    const findings = analyzeFiles([modified("src/refund.ts", "todos.patch")]);
    expect(summarize(findings)).toEqual([
      ["todos-added", "src/refund.ts", 21],
      ["todos-added", "src/refund.ts", 22],
    ]);
  });
});

describe("stubs-added", () => {
  it("finds not-implemented throws but not other errors", () => {
    const findings = analyzeFiles([modified("src/invoice.ts", "stubs-typescript.patch")]);
    expect(summarize(findings)).toEqual([["stubs-added", "src/invoice.ts", 2]]);
  });

  it("finds pass-only Python functions and NotImplementedError", () => {
    const findings = analyzeFiles([modified("src/exporter.py", "stubs-python.patch")]);
    expect(summarize(findings)).toEqual([
      ["stubs-added", "src/exporter.py", 22],
      ["stubs-added", "src/exporter.py", 2],
      ["stubs-added", "src/exporter.py", 6],
      ["stubs-added", "src/exporter.py", 9],
    ]);
  });

  it("does not treat stubs in test files as unfinished work", () => {
    expect(analyzeFiles([modified("tests/test_exporter.py", "stubs-python.patch")])).toEqual([]);
  });

  it("skips files without a patch", () => {
    expect(analyzeFiles([{ filename: "big.py", status: "modified" }])).toEqual([]);
  });
});

describe("unchecked-tasks", () => {
  it("lists unchecked items and ignores checked items and template comments", () => {
    const body = [
      "## Checklist",
      "- [x] Tests added",
      "- [ ] Update the docs",
      "* [ ] Migrate old records",
      "<!--",
      "- [ ] template example",
      "-->",
      "- [ ]",
    ].join("\r\n");
    expect(uncheckedTasks(body).map((f) => f.message)).toEqual([
      "unchecked task: Update the docs",
      "unchecked task: Migrate old records",
    ]);
    expect(uncheckedTasks(null)).toEqual([]);
  });
});

describe("verdict", () => {
  it("is Done, Probably done, or Not done", () => {
    expect(verdictFor([])).toBe("Done");
    expect(verdictFor(analyzeFiles([modified("src/sum.ts", "clean.patch")]))).toBe("Done");
    expect(verdictFor([{ type: "todos-added", message: "x" }])).toBe("Probably done");
    expect(verdictFor([{ type: "todos-added", message: "x" }, { type: "stubs-added", message: "y" }])).toBe(
      "Not done",
    );
    expect(verdictFor([{ type: "tests-failed", message: "x" }])).toBe("Not done");
  });
});
