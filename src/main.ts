/** Action orchestration: read the PR, compute findings, run tests, post the sticky comment. */

import * as core from "@actions/core";
import * as github from "@actions/github";

import { MARKER, renderComment } from "./comment.js";
import type { ChangedFile } from "./diff.js";
import { type Finding, analyzeFiles, uncheckedTasks, verdictFor } from "./findings.js";
import { InputError, readInputs } from "./inputs.js";
import { runTests, type TestRun } from "./run-tests.js";

type Octokit = ReturnType<typeof github.getOctokit>;

async function upsertComment(octokit: Octokit, pullNumber: number, body: string): Promise<void> {
  const { owner, repo } = github.context.repo;
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });
  const existing = comments.find((c) => c.user?.type === "Bot" && c.body?.includes(MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    core.info(`Updated comment ${String(existing.id)}`);
  } else {
    const created = await octokit.rest.issues.createComment({ owner, repo, issue_number: pullNumber, body });
    core.info(`Created comment ${String(created.data.id)}`);
  }
}

function isPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error.status === 403 || error.status === 404);
}

export async function run(): Promise<void> {
  try {
    const inputs = readInputs((name) => core.getInput(name));
    const pull = github.context.payload.pull_request;
    if (!pull) {
      core.setFailed(`did-it-finish runs on pull_request events, not '${github.context.eventName}'`);
      return;
    }
    const token = core.getInput("github-token", { required: true });
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const pullNumber = pull.number;

    const [files, fresh] = await Promise.all([
      octokit.paginate(octokit.rest.pulls.listFiles, { owner, repo, pull_number: pullNumber, per_page: 100 }),
      octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
    ]);
    const changed: ChangedFile[] = files.map((f) => ({
      filename: f.filename,
      status: f.status,
      ...(f.previous_filename ? { previousFilename: f.previous_filename } : {}),
      ...(f.patch !== undefined ? { patch: f.patch } : {}),
    }));
    const missingPatches = changed.filter((f) => f.patch === undefined && f.status !== "removed");
    if (missingPatches.length > 0) {
      core.info(`GitHub sent no patch for ${String(missingPatches.length)} file(s) (binary or too large); skipped them`);
    }

    const findings: Finding[] = [...analyzeFiles(changed), ...uncheckedTasks(fresh.data.body)];
    let tests: TestRun | undefined;
    if (inputs.testCommand) {
      core.startGroup(`Running ${inputs.testCommand}`);
      tests = await runTests(inputs.testCommand, {
        cwd: process.env.GITHUB_WORKSPACE ?? process.cwd(),
        timeoutMs: inputs.timeoutMs,
        tailLines: inputs.tailLines,
      });
      core.endGroup();
      if (!tests.passed) {
        findings.unshift({
          type: "tests-failed",
          message: tests.timedOut ? "test command timed out" : `test command exited with ${String(tests.exitCode)}`,
        });
      }
    }

    const verdict = verdictFor(findings);
    const body = renderComment(verdict, findings, tests, {
      repository: `${owner}/${repo}`,
      headSha: fresh.data.head.sha,
      serverUrl: github.context.serverUrl,
    });
    core.setOutput("verdict", verdict);
    core.setOutput("finding-count", findings.length);
    core.setOutput("findings", JSON.stringify(findings));
    await core.summary.addRaw(body).write();

    if (inputs.comment) {
      try {
        await upsertComment(octokit, pullNumber, body);
      } catch (error) {
        if (!isPermissionError(error)) {
          throw error;
        }
        core.warning(
          "Could not post the PR comment: the token cannot write to this pull request (common for forks). " +
            "The result is in the job summary.",
        );
      }
    }

    const failing = findings.filter((f) => inputs.failOn.includes(f.type));
    core.info(`Verdict: ${verdict} (${String(findings.length)} finding(s))`);
    if (failing.length > 0) {
      const types = [...new Set(failing.map((f) => f.type))].join(", ");
      core.setFailed(`Verdict: ${verdict}. Failing because of: ${types}`);
    }
  } catch (error) {
    if (error instanceof InputError) {
      core.setFailed(error.message);
      return;
    }
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
