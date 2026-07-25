import assert from "node:assert/strict";
import test from "node:test";

import { classifyGitHubCommandFailure, formatGitHubFailureEvidence } from "../src/github/command-failure.ts";

test("classifies a transient GitHub network failure with retry evidence", () => {
  const evidence = classifyGitHubCommandFailure(new Error("Could not resolve host: api.github.com"));
  assert.equal(evidence.category, "network");
  assert.equal(evidence.retryable, true);
  assert.match(formatGitHubFailureEvidence(evidence), /retry only the failed GitHub action/);
});

test("classifies authentication and command failures as non-retryable", () => {
  assert.equal(classifyGitHubCommandFailure(new Error("HTTP 401: Bad credentials")).category, "authentication");
  assert.equal(classifyGitHubCommandFailure(new Error("unknown flag: --broken")).category, "command");
});

test("preserves UTF-8 Korean failure text", () => {
  const evidence = classifyGitHubCommandFailure(new Error("GitHub API 응답 실패: 권한을 확인하세요"));
  assert.match(evidence.failure, /권한을 확인하세요/);
});
