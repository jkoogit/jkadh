import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { readBaselineFiles } from "../src/db/db-baseline.ts";

test("baseline reader accepts three digit sql files in order", () => {
  const dir = mkdtempSync(join(tmpdir(), "jkadh-baseline-"));
  writeFileSync(join(dir, "002_seed.sql"), "select 2;\n");
  writeFileSync(join(dir, "001_init.sql"), "select 1;\n");
  writeFileSync(join(dir, "note.txt"), "ignored\n");

  const files = readBaselineFiles(dir);

  assert.deepEqual(files.map((file) => file.name), [
    "001_init.sql",
    "002_seed.sql"
  ]);
  assert.match(files[0].checksum, /^[a-f0-9]{64}$/);
});
