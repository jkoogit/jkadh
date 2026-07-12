import { execFileSync } from "node:child_process";

export interface GitHubOpenStatus {
  status: "available" | "unavailable";
  openIssues: number;
  openPullRequests: number;
  detail: string;
  issues: GitHubOpenItem[];
  pullRequests: GitHubOpenItem[];
}

export interface GitHubOpenItem {
  number: number;
  title: string;
}

export function parseGitHubOpenItems(issueJson: string, pullRequestJson: string): GitHubOpenStatus {
  const issues = JSON.parse(issueJson) as GitHubOpenItem[];
  const pullRequests = JSON.parse(pullRequestJson) as GitHubOpenItem[];

  return {
    status: "available",
    openIssues: issues.length,
    openPullRequests: pullRequests.length,
    detail: `open issues: ${issues.length}; open PRs: ${pullRequests.length}`,
    issues,
    pullRequests
  };
}

export function readGitHubOpenStatus(repoFullName: string, cwd: string): GitHubOpenStatus {
  try {
    const issueJson = runGh(cwd, ["issue", "list", "--repo", repoFullName, "--state", "open", "--json", "number,title"]);
    const pullRequestJson = runGh(cwd, ["pr", "list", "--repo", repoFullName, "--state", "open", "--json", "number,title"]);
    return parseGitHubOpenItems(issueJson, pullRequestJson);
  } catch {
    return {
      status: "unavailable",
      openIssues: 0,
      openPullRequests: 0,
      detail: "GitHub open issue/PR lookup unavailable",
      issues: [],
      pullRequests: []
    };
  }
}

function runGh(cwd: string, args: string[]): string {
  return execFileSync("gh", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
