import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

test("loop analysis report alias reaches loop command without writes", () => {
  const output = execFileSync(process.execPath, ["--experimental-strip-types", join(process.cwd(), "src", "cli.ts"), "tag", "#루프분석.보고", "--session-id", "test-session", "--task-id", "test-task", "--title", "test", "--objective", "test", "--completion", "pass", "--expected-results", "completed_no_change", "--error-cases", "verification_failed", "--allowed-paths", "packages/harness-cli/**", "--verification", "git diff --check"], { cwd: process.cwd(), encoding: "utf8" });
  assert.match(output, /Loop analysis report/);
  assert.match(output, /write actions: loop creation blocked/);
});
