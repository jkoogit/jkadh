import { execFileSync } from "node:child_process";

import type { BranchStatus } from "../flows/session-start.ts";

export interface GitStatusInput {
  currentBranch: string;
  worktreePorcelain: string;
  remoteRefs: {
    main: string;
    dev: string;
    stg: string;
  };
}

export function buildBranchStatusFromGit(input: GitStatusInput): BranchStatus {
  const refs = input.remoteRefs;
  return {
    currentBranch: input.currentBranch,
    remoteBranches: refs,
    isAligned: refs.main === refs.dev && refs.dev === refs.stg,
    worktreeStatus: input.worktreePorcelain.trim().length === 0 ? "clean" : "dirty"
  };
}

export function readInternalGitStatus(cwd: string): BranchStatus {
  const currentBranch = runGit(cwd, ["branch", "--show-current"]);
  const worktreePorcelain = runGit(cwd, ["status", "--porcelain"]);
  const remoteRefs = {
    main: runGit(cwd, ["rev-parse", "origin/main"]),
    dev: runGit(cwd, ["rev-parse", "origin/dev"]),
    stg: runGit(cwd, ["rev-parse", "origin/stg"])
  };

  return buildBranchStatusFromGit({
    currentBranch,
    worktreePorcelain,
    remoteRefs
  });
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
