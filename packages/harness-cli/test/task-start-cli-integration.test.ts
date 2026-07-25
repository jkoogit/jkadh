import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createHcpSession, readSessionById } from "../src/state/session-state.ts";

const cliPath = join(import.meta.dirname, "..", "src", "cli.ts");

test("task start from a package subdirectory registers HCP state at git top-level", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-task-start-root-"));
  const packageDir = join(repo, "packages", "service");
  mkdirSync(packageDir, { recursive: true });
  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Harness Test"], { cwd: repo });
  execFileSync("git", ["commit", "--allow-empty", "-m", "baseline"], { cwd: repo, stdio: "ignore" });
  const session = createHcpSession(repo, { sessionNumber: "19", sessionName: "019_subdir" });

  execFileSync(process.execPath, [
    "--experimental-strip-types", cliPath, "task", "start",
    "--session-id", session.sessionId,
    "--task-name", "subdir task",
    "--issue", "127",
    "--scope", "subdir root resolution",
    "--out-of-scope", "remote writes",
    "--completion", "task stored at root",
    "--verification", "integration test",
    "--source-backlog", "codex_blg_018_001",
    "--execute",
    "--branch", "task_codex/127-subdir-root",
    "--start-point", "HEAD"
  ], { cwd: packageDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  const stored = readSessionById(repo, session.sessionId);
  assert.equal(stored.tasks[0].branchName, "task_codex/127-subdir-root");
  assert.equal(stored.tasks[0].scope, "subdir root resolution");
  assert.deepEqual(stored.tasks[0].sourceBacklogIds, ["codex_blg_018_001"]);
  assert.equal(stored.lifecyclePolicyEvidence?.[0].stage, "task_start");
});
