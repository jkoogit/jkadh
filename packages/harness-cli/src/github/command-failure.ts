export type GitHubFailureCategory = "network" | "authentication" | "api" | "command" | "unknown";

export interface GitHubFailureEvidence {
  category: GitHubFailureCategory;
  retryable: boolean;
  failure: string;
  recovery: string;
}

export function classifyGitHubCommandFailure(error: unknown): GitHubFailureEvidence {
  const failure = errorMessage(error);
  const normalized = failure.toLowerCase();

  if (/could not resolve|name resolution|dns|econnreset|etimedout|timed out|network|connection (?:reset|refused)|tls/.test(normalized)) {
    return { category: "network", retryable: true, failure, recovery: "preserve completed local work, verify connectivity, then retry only the failed GitHub action" };
  }
  if (/authentication|not logged|unauthorized|forbidden|http 401|http 403|bad credentials|token/.test(normalized)) {
    return { category: "authentication", retryable: false, failure, recovery: "preserve completed work, repair GitHub authentication or permissions, then retry only the failed action" };
  }
  if (/graphql|http 4\d\d|http 5\d\d|api rate limit|validation failed|github api/.test(normalized)) {
    return { category: "api", retryable: /http 5\d\d|rate limit/.test(normalized), failure, recovery: "inspect the GitHub API response and target state before retrying the failed action" };
  }
  if (/unknown flag|unknown command|not recognized|enoent|exit code|command failed/.test(normalized)) {
    return { category: "command", retryable: false, failure, recovery: "correct the command, CLI installation, or arguments before retrying" };
  }
  return { category: "unknown", retryable: false, failure, recovery: "inspect the failure without repeating completed remote actions, then retry only the failed action" };
}

export function formatGitHubFailureEvidence(evidence: GitHubFailureEvidence): string {
  return `category=${evidence.category}; retryable=${evidence.retryable ? "yes" : "no"}; recovery=${evidence.recovery}; failure=${evidence.failure}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const commandError = error as Error & { stderr?: string | Buffer };
    const stderr = typeof commandError.stderr === "string"
      ? commandError.stderr
      : commandError.stderr?.toString("utf8");
    return (stderr?.trim() || error.message || "GitHub command failed").replace(/\s+/g, " ");
  }
  return String(error || "GitHub command failed").replace(/\s+/g, " ");
}
