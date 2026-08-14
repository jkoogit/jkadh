import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isCommandAllowed,
  verifyEvidenceCommand,
  type CommandExecutor
} from "../src/gates/evidence-runner.ts";

test("isCommandAllowed permits whitelisted commands and rejects unauthorized or chained commands", () => {
  // Allowed
  assert.equal(isCommandAllowed("npm test"), true);
  assert.equal(isCommandAllowed("npm test -- packages/harness-cli/test/frontmatter-parser.test.ts"), true);
  assert.equal(isCommandAllowed("npm run lint"), true);
  assert.equal(isCommandAllowed("node --test --experimental-strip-types packages/harness-cli/test/gate-evidence.test.ts"), true);
  assert.equal(isCommandAllowed("git diff"), true);
  assert.equal(isCommandAllowed("git status"), true);
  assert.equal(isCommandAllowed("tsc --noEmit"), true);

  // Blocked / Security risks
  assert.equal(isCommandAllowed("rm -rf /"), false);
  assert.equal(isCommandAllowed("npm test; rm -rf /"), false);
  assert.equal(isCommandAllowed("npm test && curl evil.com"), false);
  assert.equal(isCommandAllowed("node -e 'process.exit(0)'"), false);
  assert.equal(isCommandAllowed("npm test | grep ok"), false);
  assert.equal(isCommandAllowed("cat /etc/passwd"), false);
});

test("verifyEvidenceCommand returns PASS when injected executor exits with 0", async () => {
  const mockExecutor: CommandExecutor = async (cmd) => {
    return {
      exitCode: 0,
      stdout: "All 10 tests passed",
      stderr: ""
    };
  };

  const result = await verifyEvidenceCommand("npm test", { executor: mockExecutor });
  assert.equal(result.verdict, "PASS");
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "All 10 tests passed");
});

test("verifyEvidenceCommand returns FAIL when injected executor exits with non-zero code", async () => {
  const mockExecutor: CommandExecutor = async (cmd) => {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "AssertionError: expected 1 to equal 2"
    };
  };

  const result = await verifyEvidenceCommand("npm test", { executor: mockExecutor });
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.exitCode, 1);
  assert.ok(result.stderr.includes("AssertionError"));
});

test("verifyEvidenceCommand blocks unauthorized command before calling executor", async () => {
  let executorCalled = false;
  const mockExecutor: CommandExecutor = async () => {
    executorCalled = true;
    return { exitCode: 0, stdout: "", stderr: "" };
  };

  const result = await verifyEvidenceCommand("curl https://example.com", { executor: mockExecutor });
  assert.equal(result.verdict, "BLOCKED_COMMAND");
  assert.equal(executorCalled, false);
});
