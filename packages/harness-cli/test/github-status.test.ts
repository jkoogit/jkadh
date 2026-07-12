import assert from "node:assert/strict";
import { test } from "node:test";

import { parseGitHubOpenItems } from "../src/github/github-status.ts";

test("github status parser counts open issues and pull requests", () => {
  const status = parseGitHubOpenItems(
    '[{"number":64,"title":"Harness CLI"}]',
    '[{"number":12,"title":"Open PR"},{"number":13,"title":"Second PR"}]'
  );

  assert.deepEqual(status, {
    status: "available",
    openIssues: 1,
    openPullRequests: 2,
    detail: "open issues: 1; open PRs: 2",
    issues: [{ number: 64, title: "Harness CLI" }],
    pullRequests: [
      { number: 12, title: "Open PR" },
      { number: 13, title: "Second PR" }
    ]
  });
});
