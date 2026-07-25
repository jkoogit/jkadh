import { execFileSync } from "node:child_process";

export interface GitRootRunner {
  run(cwd: string): string;
}

const defaultRunner: GitRootRunner = {
  run(cwd) {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  }
};

export function resolveRepositoryRoot(cwd: string, runner: GitRootRunner = defaultRunner): string {
  try {
    return runner.run(cwd);
  } catch {
    return cwd;
  }
}
