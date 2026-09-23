import { describe, expect, it } from "vitest";

import { redact, runTests, tailLines } from "../src/run-tests.js";

const node = JSON.stringify(process.execPath);

describe("runTests", () => {
  it("reports a passing command with its output tail", async () => {
    const run = await runTests(`${node} -e "console.log('one'); console.log('two')"`, {
      cwd: process.cwd(),
      timeoutMs: 20_000,
      tailLines: 1,
    });
    expect(run.passed).toBe(true);
    expect(run.exitCode).toBe(0);
    expect(run.tail).toBe("two");
  });

  it("reports failures and captures stderr", async () => {
    const run = await runTests(`${node} -e "console.error('boom'); process.exit(3)"`, {
      cwd: process.cwd(),
      timeoutMs: 20_000,
      tailLines: 5,
    });
    expect(run.passed).toBe(false);
    expect(run.exitCode).toBe(3);
    expect(run.tail).toContain("boom");
  });

  it("kills commands that run past the timeout", async () => {
    const run = await runTests(`${node} -e "setTimeout(() => {}, 60000)"`, {
      cwd: process.cwd(),
      timeoutMs: 300,
      tailLines: 5,
    });
    expect(run.timedOut).toBe(true);
    expect(run.passed).toBe(false);
  });
});

describe("tailLines and redact", () => {
  it("strips ANSI codes and keeps the last lines", () => {
    expect(tailLines("a\n\u001b[31mb\u001b[0m\r\nc\n", 2)).toBe("b\nc");
    expect(tailLines("a\nb", 0)).toBe("");
  });

  it("redacts obvious credentials", () => {
    const token = "ghp_" + "abcdefghij".repeat(4);
    expect(redact(`Authorization: Bearer abc.def and ${token} and API_KEY=zzz`)).toBe(
      "Authorization: Bearer [REDACTED] and [REDACTED] and API_KEY=[REDACTED]",
    );
    expect(redact("postgres://app:hunter2@db/app")).toBe("postgres://app:[REDACTED]@db/app");
  });
});
