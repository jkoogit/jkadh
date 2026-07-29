import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { externalCommandTimeoutMs, runBoundedGitHubCommand } from "../src/process/bounded-command.ts";

test("bounded GitHub command uses the production timeout default", () => {
  assert.equal(externalCommandTimeoutMs, 15_000);
});

test("bounded GitHub command terminates an unresponsive lookup", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-bounded-command-"));
  const script = join(repo, "slow-github.cjs");
  writeFileSync(script, "setTimeout(() => console.log('late'), 1000);\n", "utf8");
  const previousNodeEnv = process.env.NODE_ENV;
  const previousScript = process.env.JKADH_TEST_GH_SCRIPT;
  process.env.NODE_ENV = "test";
  process.env.JKADH_TEST_GH_SCRIPT = script;
  try {
    assert.throws(
      () => runBoundedGitHubCommand(repo, ["issue", "view", "1"], 25),
      (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: string }).code === "ETIMEDOUT")
    );
  } finally {
    restoreEnvironment("NODE_ENV", previousNodeEnv);
    restoreEnvironment("JKADH_TEST_GH_SCRIPT", previousScript);
  }
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
