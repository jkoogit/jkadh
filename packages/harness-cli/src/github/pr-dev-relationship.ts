export interface PullRequestMergeMetadata {
  state?: string;
  baseRefName?: string;
  mergeCommit?: { oid?: string };
}

export function pullRequestMergeMatchesDevTarget(
  metadata: PullRequestMergeMetadata,
  targetCommit: string,
  devContainsTarget: boolean
): boolean {
  return metadata.state === "MERGED"
    && metadata.baseRefName === "dev"
    && metadata.mergeCommit?.oid === targetCommit
    && devContainsTarget;
}
