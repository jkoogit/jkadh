import { execFileSync } from "node:child_process";

export const externalCommandTimeoutMs = 15_000;

export function runBoundedGitCommand(cwd: string, args: string[], timeoutMs = externalCommandTimeoutMs): string {
  return runBoundedCommand("git", args, cwd, timeoutMs);
}

export function runBoundedGitHubCommand(cwd: string, args: string[], timeoutMs = externalCommandTimeoutMs): string {
  const testScript = process.env.NODE_ENV === "test" ? process.env.JKADH_TEST_GH_SCRIPT : undefined;
  return testScript
    ? runBoundedCommand(process.execPath, [testScript, ...args], cwd, timeoutMs)
    : runBoundedCommand("gh", args, cwd, timeoutMs);
}

function runBoundedCommand(command: string, args: string[], cwd: string, timeoutMs: number): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
    windowsHide: true
  }).trim();
}
