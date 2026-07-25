import assert from "node:assert/strict";
import { test } from "node:test";

import { pullRequestMergeMatchesDevTarget } from "../src/github/pr-dev-relationship.ts";

test("PR relationship requires a merged dev PR whose merge commit is the target on dev", () => {
  const metadata = { state: "MERGED", baseRefName: "dev", mergeCommit: { oid: "target" } };
  assert.equal(pullRequestMergeMatchesDevTarget(metadata, "target", true), true);
  assert.equal(pullRequestMergeMatchesDevTarget(metadata, "other", true), false);
  assert.equal(pullRequestMergeMatchesDevTarget(metadata, "target", false), false);
});

test("PR relationship rejects open PRs and non-dev bases", () => {
  assert.equal(pullRequestMergeMatchesDevTarget({ state: "OPEN", baseRefName: "dev", mergeCommit: { oid: "target" } }, "target", true), false);
  assert.equal(pullRequestMergeMatchesDevTarget({ state: "MERGED", baseRefName: "main", mergeCommit: { oid: "target" } }, "target", true), false);
});
