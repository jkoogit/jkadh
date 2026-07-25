import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { GitHubOpenStatus } from "../github/github-status.ts";
import { readGitHubOpenStatus } from "../github/github-status.ts";
import { resolveProjectLocalPath, type ProjectProfile } from "../projects/project-profile.ts";

export type ProjectPreflightStatus = "ready" | "blocked" | "approval_required";

export interface ProjectPreflightSnapshot {
  repoFullName: string;
  currentBranch: string;
  trackedChanges: string[];
  untrackedChanges: string[];
  ignoredUntrackedChanges: string[];
  agentsFiles: string[];
  branchCommits: Record<string, string>;
  github: GitHubOpenStatus;
}

export interface ProjectPreflightResult {
  status: ProjectPreflightStatus;
  checks: {
    repository: "pass" | "blocked";
    agents: "pass" | "blocked";
    lifecycle: "pass" | "blocked";
    trackedWorktree: "pass" | "blocked";
    github: "pass" | "blocked";
  };
  blockers: string[];
  approvalRequired: string[];
  markdown: string;
}

const approvalRequired = ["secret access", "deployment", "OAuth manual verification", "external system write"];

export function evaluateProjectPreflight(
  profile: ProjectProfile,
  snapshot: ProjectPreflightSnapshot
): ProjectPreflightResult {
  const expectedBranches = unique([
    profile.default_base_branch ?? "main",
    profile.task_pr_base_branch ?? profile.default_base_branch ?? "main",
    ...(profile.promotion_branches ?? [])
  ]);
  const missingBranches = expectedBranches.filter((branch) => !snapshot.branchCommits[branch]);
  const aligned = new Set(expectedBranches.map((branch) => snapshot.branchCommits[branch])).size <= 1;
  const lifecycleAllowed = missingBranches.length === 0
    && (profile.branch_alignment_policy === "promotion" || aligned);
  const repoMatches = normalizeRepo(snapshot.repoFullName) === normalizeRepo(profile.repo_full_name);
  const allowedStartBranches = profile.allowed_start_branches ?? [profile.default_base_branch ?? "main"];
  const branchAllowed = allowedStartBranches.includes(snapshot.currentBranch);
  const checks = {
    repository: repoMatches ? "pass" as const : "blocked" as const,
    agents: snapshot.agentsFiles.length > 0 ? "pass" as const : "blocked" as const,
    lifecycle: lifecycleAllowed ? "pass" as const : "blocked" as const,
    trackedWorktree: snapshot.trackedChanges.length === 0 ? "pass" as const : "blocked" as const,
    untrackedWorktree: snapshot.untrackedChanges.length === 0 ? "pass" as const : "blocked" as const,
    currentBranch: branchAllowed ? "pass" as const : "blocked" as const,
    github: snapshot.github.status === "available" ? "pass" as const : "blocked" as const
  };
  const blockers = [
    ...(!repoMatches ? [`origin mismatch: expected ${profile.repo_full_name}, got ${snapshot.repoFullName}`] : []),
    ...(snapshot.agentsFiles.length === 0 ? ["AGENTS.md not found"] : []),
    ...(missingBranches.length > 0 ? [`missing lifecycle branches: ${missingBranches.join(", ")}`] : []),
    ...(missingBranches.length === 0 && !lifecycleAllowed ? ["lifecycle branches are not aligned by profile policy"] : []),
    ...(snapshot.trackedChanges.length > 0 ? [`tracked worktree changes: ${snapshot.trackedChanges.length}`] : []),
    ...(snapshot.untrackedChanges.length > 0 ? [`untracked worktree changes: ${snapshot.untrackedChanges.length}`] : []),
    ...(!branchAllowed ? [`current branch ${snapshot.currentBranch} is not an allowed start branch: ${allowedStartBranches.join(", ")}`] : []),
    ...(profile.harness_enabled === false ? ["Harness is disabled for this project"] : []),
    ...(snapshot.github.status !== "available" ? [snapshot.github.detail] : [])
  ];
  const status: ProjectPreflightStatus = blockers.length > 0 ? "blocked" : "approval_required";
  const branchDetail = expectedBranches
    .map((branch) => `${branch}=${snapshot.branchCommits[branch] ?? "missing"}`)
    .join("; ");
  const markdown = [
    "# Project target preflight",
    "",
    `- project: ${profile.project_id}`,
    `- status: ${status}`,
    `- repository: ${checks.repository}; ${snapshot.repoFullName}`,
    `- AGENTS: ${checks.agents}; ${snapshot.agentsFiles.join(", ") || "missing"}`,
    `- branch lifecycle: ${checks.lifecycle}; policy=${profile.branch_alignment_policy ?? "aligned"}; ${branchDetail}`,
    `- current branch: ${checks.currentBranch}; ${snapshot.currentBranch}; allowed=${allowedStartBranches.join(", ")}`,
    `- tracked worktree: ${checks.trackedWorktree}; changes=${snapshot.trackedChanges.length}`,
    `- untracked worktree: ${checks.untrackedWorktree}; changes=${snapshot.untrackedChanges.length}; ignored=${snapshot.ignoredUntrackedChanges.length}`,
    `- GitHub: ${checks.github}; ${snapshot.github.detail}`,
    `- approval required: ${approvalRequired.join(", ")}`,
    ...(blockers.length > 0 ? ["", "## Blockers", "", ...blockers.map((blocker) => `- ${blocker}`)] : [])
  ].join("\n") + "\n";

  return { status, checks, blockers, approvalRequired, markdown };
}

export function readProjectPreflight(profile: ProjectProfile, repositoryRoot: string): ProjectPreflightResult {
  const cwd = resolveProjectLocalPath(profile, repositoryRoot);
  try {
    if (!existsSync(cwd)) return blockedResult(profile, `local path not found: ${cwd}`);
    if (!tryGit(cwd, ["rev-parse", "--show-toplevel"])) return blockedResult(profile, `not a Git repository: ${cwd}`);
    const branches = unique([
      profile.default_base_branch ?? "main",
      profile.task_pr_base_branch ?? profile.default_base_branch ?? "main",
      ...(profile.promotion_branches ?? [])
    ]);
    const statusLines = lines(runGit(cwd, ["status", "--porcelain", "--untracked-files=all"]));
    const ignoredPatterns = profile.ignored_untracked_paths ?? [];
    const untracked = statusLines.filter((line) => line.startsWith("?? "));
    const ignoredUntrackedChanges = untracked.filter((line) => isIgnoredUntracked(line, ignoredPatterns));
    const snapshot: ProjectPreflightSnapshot = {
      repoFullName: readOriginRepo(cwd),
      currentBranch: runGit(cwd, ["branch", "--show-current"]),
      trackedChanges: statusLines.filter((line) => !line.startsWith("?? ")),
      untrackedChanges: untracked.filter((line) => !isIgnoredUntracked(line, ignoredPatterns)),
      ignoredUntrackedChanges,
      agentsFiles: readAgentsFiles(cwd),
      branchCommits: Object.fromEntries(branches.map((branch) => [branch, tryGit(cwd, ["rev-parse", `origin/${branch}`])])),
      github: readGitHubOpenStatus(profile.repo_full_name, cwd)
    };
    return evaluateProjectPreflight(profile, snapshot);
  } catch (error) {
    return blockedResult(profile, error instanceof Error ? error.message : "preflight read failed");
  }
}

function blockedResult(profile: ProjectProfile, blocker: string): ProjectPreflightResult {
  const markdown = `# Project target preflight\n\n- project: ${profile.project_id}\n- status: blocked\n\n## Blockers\n\n- ${blocker}\n`;
  return {
    status: "blocked",
    checks: {
      repository: "blocked",
      agents: "blocked",
      lifecycle: "blocked",
      trackedWorktree: "blocked",
      untrackedWorktree: "blocked",
      currentBranch: "blocked",
      github: "blocked"
    },
    blockers: [blocker],
    approvalRequired,
    markdown
  };
}

function isIgnoredUntracked(line: string, patterns: string[]): boolean {
  const path = line.slice(3).replace(/^"|"$/g, "").replaceAll("\\", "/");
  return patterns.some((pattern) => {
    const normalized = pattern.replaceAll("\\", "/");
    return normalized.endsWith("/") ? path.startsWith(normalized) : path === normalized;
  });
}

function readAgentsFiles(cwd: string): string[] {
  const tracked = lines(tryGit(cwd, ["ls-files", "AGENTS.md", "**/AGENTS.md"]));
  if (tracked.length > 0) return tracked;
  return existsSync(resolve(cwd, "AGENTS.md")) ? ["AGENTS.md"] : [];
}

function readOriginRepo(cwd: string): string {
  return runGit(cwd, ["remote", "get-url", "origin"]);
}

function normalizeRepo(value: string): string {
  return value.trim()
    .replace(/^git@github\.com:/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryGit(cwd: string, args: string[]): string {
  try {
    return runGit(cwd, args);
  } catch {
    return "";
  }
}
