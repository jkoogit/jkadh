import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { loadDbConfig, readDotEnv } from "../src/db/db-config.ts";

test("dotenv reader parses db values without exposing secrets", () => {
  const repo = mkdtempSync(join(tmpdir(), "jkadh-db-config-"));
  writeFileSync(join(repo, ".env"), [
    "JKADH_ENV=dev",
    "JKADH_DB_HOST=192.168.219.125",
    "JKADH_DB_PORT=35432",
    "JKADH_DB_NAME=jkadh_dev",
    "JKADH_DB_USER=devdbusr",
    "JKADH_DB_PASSWORD='secret value'"
  ].join("\n"));

  const values = readDotEnv(join(repo, ".env"));
  assert.equal(values.JKADH_DB_PASSWORD, "secret value");
});

test("db config loads required values from .env", () => {
  const repo = mkdtempSync(join(tmpdir(), "jkadh-db-config-"));
  writeFileSync(join(repo, ".env"), [
    "JKADH_ENV=dev",
    "JKADH_DB_HOST=192.168.219.125",
    "JKADH_DB_PORT=35432",
    "JKADH_DB_NAME=jkadh_dev",
    "JKADH_DB_USER=devdbusr",
    "JKADH_DB_PASSWORD=secret"
  ].join("\n"));

  const result = loadDbConfig(repo, {});

  assert.equal(result.status, "ready");
  assert.equal(result.config?.env, "dev");
  assert.equal(result.config?.port, 35432);
  assert.deepEqual(result.missing, []);
});

test("db config reports missing values", () => {
  const repo = mkdtempSync(join(tmpdir(), "jkadh-db-config-"));

  const result = loadDbConfig(repo, {});

  assert.equal(result.status, "blocked");
  assert.match(result.missing.join(","), /JKADH_DB_HOST/);
});
