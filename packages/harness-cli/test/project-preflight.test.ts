import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateProjectPreflight, readProjectPreflight, type ProjectPreflightSnapshot } from "../src/flows/project-preflight.ts";
import type { ProjectProfile } from "../src/projects/project-profile.ts";

const profile: ProjectProfile = {
  project_id: "pdfowers",
  repo_full_name: "jkoogit/PDFowers",
  local_path: "../PDFowers",
  access_mode: "internal",
  default_base_branch: "main",
  task_pr_base_branch: "dev",
  promotion_branches: ["dev", "stg", "main"],
  branch_strategy: "feature",
  branch_alignment_policy: "promotion",
  allowed_work_types: ["service", "integration"],
  harness_enabled: true
};

function snapshot(overrides: Partial<ProjectPreflightSnapshot> = {}): ProjectPreflightSnapshot {
  return {
    repoFullName: "https://github.com/jkoogit/PDFowers.git",
    currentBranch: "main",
    trackedChanges: [],
    untrackedChanges: [],
    ignoredUntrackedChanges: [],
    agentsFiles: ["AGENTS.md"],
    branchCommits: { main: "main-sha", dev: "dev-sha", stg: "stg-sha" },
    github: {
      status: "available",
      openIssues: 0,
      openPullRequests: 0,
      detail: "open issues: 0; open PRs: 0",
      issues: [],
      pullRequests: []
    },
    ...overrides
  };
}

test("promotion lifecycle allows environment branches with different commits", () => {
  const result = evaluateProjectPreflight(profile, snapshot());

  assert.equal(result.checks.lifecycle, "pass");
  assert.equal(result.status, "approval_required");
  assert.match(result.markdown, /policy=promotion/);
});

test("tracked target changes block service work without considering untracked runtime files", () => {
  const result = evaluateProjectPreflight(profile, snapshot({
    trackedChanges: ["M src/domains/auth/auth-domain.ts"]
  }));

  assert.equal(result.status, "blocked");
  assert.equal(result.checks.trackedWorktree, "blocked");
  assert.match(result.blockers.join("\n"), /tracked worktree changes: 1/);
});

test("untracked source files block while ignored runtime files remain informational", () => {
  const result = evaluateProjectPreflight(profile, snapshot({
    untrackedChanges: ["?? src/db/migrations/0002_email.sql"],
    ignoredUntrackedChanges: ["?? .codex-remote-attachments/context.txt"]
  }));

  assert.equal(result.status, "blocked");
  assert.equal(result.checks.untrackedWorktree, "blocked");
  assert.match(result.markdown, /untracked worktree: blocked; changes=1; ignored=1/);
});

test("a task branch is blocked as a new service work start point", () => {
  const result = evaluateProjectPreflight(profile, snapshot({ currentBranch: "task/이메일인증구현_codex" }));

  assert.equal(result.status, "blocked");
  assert.equal(result.checks.currentBranch, "blocked");
  assert.match(result.blockers.join("\n"), /not an allowed start branch: main/);
});

test("aligned policy blocks divergent lifecycle branches", () => {
  const result = evaluateProjectPreflight({ ...profile, branch_alignment_policy: "aligned" }, snapshot());

  assert.equal(result.status, "blocked");
  assert.equal(result.checks.lifecycle, "blocked");
});

test("preflight reports human approval boundaries", () => {
  const result = evaluateProjectPreflight(profile, snapshot());

  assert.deepEqual(result.approvalRequired, [
    "secret access",
    "deployment",
    "OAuth manual verification",
    "external system write"
  ]);
});

test("missing project path returns a structured blocker instead of throwing", () => {
  const result = readProjectPreflight({ ...profile, local_path: "missing-service" }, process.cwd());

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /local path not found/);
});
