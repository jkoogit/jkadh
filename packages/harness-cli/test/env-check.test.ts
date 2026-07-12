import assert from "node:assert/strict";
import { test } from "node:test";

import { checkRequiredEnv, redactSecretValues } from "../src/security/env-check.ts";

test("env check reports present and missing variables without exposing values", () => {
  const result = checkRequiredEnv(["GITHUB_TOKEN", "OPENAI_API_KEY"], {
    GITHUB_TOKEN: "ghp_real_secret_value"
  });

  assert.deepEqual(result, [
    { name: "GITHUB_TOKEN", status: "present" },
    { name: "OPENAI_API_KEY", status: "missing" }
  ]);
});

test("redaction removes configured secret values from report text", () => {
  const redacted = redactSecretValues(
    "token=ghp_real_secret_value api=sk-real-secret-value",
    ["ghp_real_secret_value", "sk-real-secret-value"]
  );

  assert.equal(redacted, "token=***REDACTED*** api=***REDACTED***");
});
