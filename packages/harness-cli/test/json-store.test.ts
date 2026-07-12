import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { saveJsonFile } from "../src/storage/json-store.ts";

test("json store writes formatted json and creates parent directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "jkadh-harness-"));
  const filePath = join(root, "reports", "session-start.json");

  try {
    await saveJsonFile(filePath, {
      command: "session start",
      status: "ready"
    });

    const content = await readFile(filePath, "utf8");
    assert.equal(content, '{\n  "command": "session start",\n  "status": "ready"\n}\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
