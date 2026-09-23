/** Run the configured test command and keep a redacted tail of its output. */

import { spawn, spawnSync } from "node:child_process";

export interface TestRun {
  command: string;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Last lines of combined stdout and stderr, with ANSI codes and obvious secrets removed. */
  tail: string;
}

const ESCAPE = String.fromCharCode(27);
const ANSI = new RegExp(String.raw`${ESCAPE}\[[0-9;?]*[ -/]*[@-~]`, "g");
const SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/(authorization:\s*(?:bearer|basic|token)?\s*)\S+/gi, "$1[REDACTED]"],
  [/\b((?:api[_-]?key|token|secret|password|passwd)[\w-]*\s*[=:]\s*)\S+/gi, "$1[REDACTED]"],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/g, "[REDACTED]"],
  [/(:\/\/[^/\s:@]+:)[^/\s@]+@/g, "$1[REDACTED]@"],
];
const MAX_BUFFER = 2_000_000;

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

export function tailLines(output: string, lines: number): string {
  if (lines <= 0) {
    return "";
  }
  const all = output.replace(ANSI, "").replace(/\r\n?/g, "\n").trimEnd().split("\n");
  return redact(all.slice(-lines).join("\n"));
}

function killTree(pid: number | undefined, windows: boolean): void {
  if (pid === undefined) {
    return;
  }
  try {
    if (windows) {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // The process already exited between the timeout firing and the kill.
  }
}

export function runTests(command: string, options: { cwd: string; timeoutMs: number; tailLines: number }): Promise<TestRun> {
  const started = Date.now();
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const windows = process.platform === "win32";
    // On POSIX the command gets its own process group so a timeout can kill the whole tree.
    const child = spawn(command, { cwd: options.cwd, shell: true, env: process.env, detached: !windows });
    const collect = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (output.length > MAX_BUFFER) {
        output = output.slice(-MAX_BUFFER);
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid, windows);
      finish(null, `\nKilled after ${String(options.timeoutMs / 1000)}s timeout.`);
    }, options.timeoutMs);
    const finish = (exitCode: number | null, extra = ""): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        passed: exitCode === 0 && !timedOut,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
        tail: tailLines(output + extra, options.tailLines),
      });
    };
    child.on("error", (error) => {
      finish(null, `\n${error.message}`);
    });
    child.on("close", (code) => {
      finish(code);
    });
  });
}
