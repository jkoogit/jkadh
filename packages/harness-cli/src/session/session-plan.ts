import type { RetrospectiveDetail } from "../docs/retrospective-detail.ts";

export interface SessionPlanInput {
  detail: RetrospectiveDetail;
  issueNumber?: number;
  issueTitle?: string;
}

export interface SessionPlan {
  sessionNumber: "manual_required";
  initialSessionName: string;
  recommendedBranchName: string;
  relatedIssue: string;
  issueStep: "use existing issue" | "create issue before task start";
  recommendedNextWork: string;
}

export function buildSessionPlan(input: SessionPlanInput): SessionPlan {
  const initialSessionName = input.detail.recommendedSessionName ?? "세션명_확인필요";
  const recommendedNextWork = input.detail.recommendedStartPoint ?? "추천 작업 확인 필요";
  const issueStep = input.issueNumber ? "use existing issue" : "create issue before task start";
  const relatedIssue = input.issueNumber && input.issueTitle
    ? `#${input.issueNumber} ${input.issueTitle}`
    : "not found";

  return {
    sessionNumber: "manual_required",
    initialSessionName,
    recommendedBranchName: input.issueNumber
      ? `task_codex/${String(input.issueNumber).padStart(3, "0")}-${slugifySessionName(initialSessionName)}`
      : `task_codex/pending-${slugifySessionName(initialSessionName)}`,
    relatedIssue,
    issueStep,
    recommendedNextWork
  };
}

function slugifySessionName(name: string): string {
  if (name.includes("Harness_CLI")) {
    return "harness-cli-initial";
  }

  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "session-start";
}
