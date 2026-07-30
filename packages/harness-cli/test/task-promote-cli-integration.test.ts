import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  addHcpBacklog,
  addHcpTask,
  createHcpSession,
  readSessionById,
  updateHcpTask
} from "../src/state/session-state.ts";

const cliPath = join(import.meta.dirname, "..", "src", "cli.ts");

test("task promote CLI preserves success and prints live dynamic status when post-promotion GitHub lookups fail", () => {
  const root = mkdtempSync(join(tmpdir(), "hcp-task-promote-cli-"));
  const repo = join(root, "repo");
  const origin = join(root, "origin.git");
  mkdirSync(repo);
  git(root, ["init", "--bare", origin]);
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Harness Test"]);
  git(repo, ["remote", "add", "origin", origin]);
  writeFileSync(join(repo, "fixture.txt"), "base\n", "utf8");
  git(repo, ["add", "fixture.txt"]);
  git(repo, ["commit", "-m", "base"]);
  git(repo, ["push", "origin", "HEAD:main", "HEAD:stg"]);
  writeFileSync(join(repo, "fixture.txt"), "base\ntarget\n", "utf8");
  git(repo, ["add", "fixture.txt"]);
  git(repo, ["commit", "-m", "target"]);
  const targetCommit = git(repo, ["rev-parse", "HEAD"]);
  git(repo, ["push", "origin", "HEAD:dev"]);
  git(repo, ["fetch", "origin"]);

  const fakeGitHub = join(root, "fake-github.cjs");
  writeFileSync(fakeGitHub, [
    "const args = process.argv.slice(2);",
    `const targetCommit = ${JSON.stringify(targetCommit)};`,
    "if (args[0] === 'pr' && args[1] === 'view') {",
    "  console.log(JSON.stringify({ state: 'MERGED', baseRefName: 'dev', mergeCommit: { oid: targetCommit } }));",
    "} else {",
    "  console.error('simulated post-promotion GitHub lookup failure');",
    "  process.exitCode = 9;",
    "}"
  ].join("\n"), "utf8");

  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "CLI promotion review" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "CLI promotion", issueNumber: 169 });
  updateHcpTask(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    expectedStatus: "active",
    status: "closed",
    pullRequestNumber: 171,
    closeEvidence: {
      source: "task_close",
      outcome: "passed",
      completionSummary: "implemented",
      verificationResult: "tests passed",
      outOfScope: "none",
      remainingWork: "none"
    }
  });
  addHcpBacklog(repo, {
    sessionId: session.sessionId,
    backlogId: "BLG-CLI-001",
    title: "CLI next work",
    note: "build the next CLI candidate"
  });

  const result = spawnSync(process.execPath, [
    "--experimental-strip-types", cliPath,
    "task", "promote", "--execute",
    "--session-id", session.sessionId,
    "--task-id", task.taskId,
    "--target-commit", targetCommit,
    "--verification", "tests passed"
  ], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", JKADH_TEST_GH_SCRIPT: fakeGitHub }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(readSessionById(repo, session.sessionId).tasks[0]?.status, "promoted");
  const promotedIndex = result.stdout.indexOf("promoted task:");
  const reviewIndex = result.stdout.indexOf("## Session Work Status Review");
  assert.ok(promotedIndex >= 0 && reviewIndex > promotedIndex);
  assert.match(result.stdout, /related Issues \(unavailable\): #169=UNKNOWN/);
  assert.match(result.stdout, /open PRs \(unavailable\): none/);
  assert.match(result.stdout, /branch alignment: aligned/);
  assert.match(result.stdout, /```text\r?\n#태스크시작\{/);
  assert.match(result.stdout, new RegExp(`sessionId: ${session.sessionId}`));
  assert.match(result.stdout, /작업지시: BLG-CLI-001 CLI next work/);
});

test("task promote report suppresses its next prompt when the required scope review is unavailable", () => {
  const root = mkdtempSync(join(tmpdir(), "hcp-task-promote-review-unavailable-"));
  const repo = join(root, "repo");
  const origin = join(root, "origin.git");
  mkdirSync(repo);
  git(root, ["init", "--bare", origin]);
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Harness Test"]);
  git(repo, ["remote", "add", "origin", origin]);
  writeFileSync(join(repo, "fixture.txt"), "base\n", "utf8");
  git(repo, ["add", "fixture.txt"]);
  git(repo, ["commit", "-m", "base"]);
  const targetCommit = git(repo, ["rev-parse", "HEAD"]);
  git(repo, ["push", "origin", "HEAD:main", "HEAD:stg"]);
  git(repo, ["fetch", "origin"]);

  const result = spawnSync(process.execPath, [
    "--experimental-strip-types", cliPath,
    "task", "promote",
    "--session-id", "missing_session",
    "--task-id", "missing_task",
    "--target-commit", targetCommit,
    "--target-branches", "stg,main",
    "--verification", "tests passed"
  ], { cwd: repo, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Harness Scope Review/);
  assert.match(result.stdout, /status: unavailable/);
  assert.match(result.stdout, /required Harness scope review unavailable/);
  assert.match(result.stdout, /Next prompt suppressed/);
  assert.doesNotMatch(result.stdout, /```text\r?\n#태스크승급/);
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
