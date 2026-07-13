import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { readMigrationFiles } from "../src/db/db-migrate.ts";

test("migration reader accepts three digit sql files in order", () => {
  const dir = mkdtempSync(join(tmpdir(), "jkadh-migrations-"));
  writeFileSync(join(dir, "002_second.sql"), "select 2;\n");
  writeFileSync(join(dir, "001_first.sql"), "select 1;\n");
  writeFileSync(join(dir, "bad.sql"), "select 0;\n");

  const migrations = readMigrationFiles(dir);

  assert.deepEqual(migrations.map((migration) => migration.name), [
    "001_first.sql",
    "002_second.sql"
  ]);
  assert.deepEqual(migrations.map((migration) => migration.version), [1, 2]);
  assert.match(migrations[0].checksum, /^[a-f0-9]{64}$/);
});
