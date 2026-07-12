import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { checkProjectAccess, loadProjectProfile } from "../src/projects/project-profile.ts";

test("project profile loads internal jkadh repository settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "jkadh-profile-"));
  const profilesDir = join(root, "projects");

  try {
    await mkdir(profilesDir, { recursive: true });
    await writeFile(
      join(profilesDir, "jkadh.json"),
      JSON.stringify({
        project_id: "jkadh",
        repo_full_name: "jkoogit/jkadh",
        local_path: ".",
        access_mode: "internal"
      }),
      "utf8"
    );

    const profile = await loadProjectProfile("jkadh", profilesDir);

    assert.deepEqual(profile, {
      project_id: "jkadh",
      repo_full_name: "jkoogit/jkadh",
      local_path: ".",
      access_mode: "internal"
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project access allows internal mode without credential ref", () => {
  const result = checkProjectAccess({
    project_id: "jkadh",
    repo_full_name: "jkoogit/jkadh",
    local_path: ".",
    access_mode: "internal"
  });

  assert.deepEqual(result, {
    status: "allowed",
    reason: "internal repository access uses current workspace permissions"
  });
});

test("project access blocks env mode until external repository support is implemented", () => {
  const result = checkProjectAccess({
    project_id: "service",
    repo_full_name: "owner/service",
    local_path: "../service",
    access_mode: "env",
    credential_ref: "env:GITHUB_TOKEN"
  });

  assert.deepEqual(result, {
    status: "blocked",
    reason: "env repository access is reserved for a later implementation"
  });
});
