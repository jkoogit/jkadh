import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSessionStartReport } from "../src/flows/session-start.ts";

test("session start report summarizes branch and backlog checks", () => {
  const report = buildSessionStartReport({
    branchStatus: {
      currentBranch: "main",
      remoteBranches: {
        main: "abc123",
        dev: "abc123",
        stg: "abc123"
      },
      isAligned: true,
      worktreeStatus: "clean"
    },
    backlog: {
      candidates: [
        {
          id: "RET-008",
          title: "Harness CLI initial implementation",
          status: "Candidate"
        }
      ]
    },
    credentials: {
      required: [
        { name: "GITHUB_TOKEN", status: "present" },
        { name: "OPENAI_API_KEY", status: "missing" }
      ]
    },
    github: {
      status: "available",
      openIssues: 0,
      openPullRequests: 0,
      detail: "open issues: 0; open PRs: 0",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(report.command, "session start");
  assert.equal(report.status, "ready");
  assert.match(report.markdown, /dev\/stg\/main: aligned/);
  assert.match(report.markdown, /RET-008/);
  assert.match(report.markdown, /credentials: GITHUB_TOKEN present; OPENAI_API_KEY missing/);
  assert.match(report.markdown, /github: open issues: 0; open PRs: 0/);
  assert.deepEqual(report.blockedActions, [
    "create_issue",
    "merge_pr",
    "promote_branch"
  ]);
});
