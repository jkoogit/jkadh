import { createReportDocument } from "../reports/create-report.ts";
import type { ReferenceDoc, RetrospectiveDetail } from "../docs/retrospective-detail.ts";
import type { GitHubOpenStatus } from "../github/github-status.ts";
import type { SessionPlan } from "../session/session-plan.ts";
import type { EnvCheckResult } from "../security/env-check.ts";

export interface BranchStatus {
  currentBranch: string;
  remoteBranches: {
    main: string;
    dev: string;
    stg: string;
  };
  isAligned: boolean;
  worktreeStatus: "clean" | "dirty";
}

export interface BacklogCandidate {
  id: string;
  title: string;
  status: string;
  timing?: string;
  priority?: string;
  path?: string;
}

export interface RetrospectiveSummary {
  id: string;
  title: string;
  status: string;
  path: string;
}

export interface SessionStartInput {
  branchStatus: BranchStatus;
  backlog: {
    candidates: BacklogCandidate[];
  };
  credentials?: {
    required: EnvCheckResult[];
  };
  retrospective?: RetrospectiveSummary;
  retrospectiveDetail?: RetrospectiveDetail;
  github?: GitHubOpenStatus;
  sessionPlan?: SessionPlan;
}

export interface SessionStartReport {
  command: "session start";
  status: "ready" | "blocked";
  markdown: string;
  json: {
    branchStatus: BranchStatus;
    backlogCandidates: BacklogCandidate[];
    credentials: EnvCheckResult[];
    retrospective?: RetrospectiveSummary;
    retrospectiveDetail?: RetrospectiveDetail;
    github?: GitHubOpenStatus;
    sessionPlan?: SessionPlan;
    referenceDocs: ReferenceDoc[];
  };
  blockedActions: string[];
}

const blockedActions = ["create_issue", "close_issue", "merge_pr", "promote_branch"];

export function buildSessionStartReport(input: SessionStartInput): SessionStartReport {
  const status = input.branchStatus.isAligned ? "ready" : "blocked";
  const alignmentDetail = input.branchStatus.isAligned
    ? "dev/stg/main: aligned"
    : "dev/stg/main: not aligned";
  const backlogDetail = input.backlog.candidates.length === 0
    ? "no candidate found"
    : input.backlog.candidates.map((candidate) => `${candidate.id} ${candidate.title}`).join("; ");
  const credentials = input.credentials?.required ?? [];
  const credentialDetail = credentials.length === 0
    ? "no required credentials configured"
    : credentials.map((credential) => `${credential.name} ${credential.status}`).join("; ");
  const retrospectiveDetail = input.retrospective
    ? `${input.retrospective.id} ${input.retrospective.title}`
    : "no retrospective found";
  const githubDetail = input.github?.detail ?? "GitHub open issue/PR lookup not configured";
  const sessionPlanDetail = input.sessionPlan
    ? `session ${input.sessionPlan.sessionNumber}; ${input.sessionPlan.initialSessionName}; branch ${input.sessionPlan.recommendedBranchName}; issue ${input.sessionPlan.relatedIssue}; next ${input.sessionPlan.recommendedNextWork}`
    : "session plan not available";
  const referenceDocs = input.retrospectiveDetail?.referenceDocs ?? [];
  const referenceDocsDetail = referenceDocs.length === 0
    ? "no reference docs found"
    : referenceDocs.map((doc) => doc.title).join("; ");

  const report = createReportDocument({
    title: "Harness CLI session start",
    summary: "Read/check/report session start result",
    checks: [
      {
        name: "branch alignment",
        status: input.branchStatus.isAligned ? "pass" : "fail",
        detail: alignmentDetail
      },
      {
        name: "worktree status",
        status: input.branchStatus.worktreeStatus === "clean" ? "pass" : "blocked",
        detail: input.branchStatus.worktreeStatus
      },
      {
        name: "backlog candidates",
        status: input.backlog.candidates.length === 0 ? "info" : "pass",
        detail: backlogDetail
      },
      {
        name: "credentials",
        status: credentials.some((credential) => credential.status === "missing") ? "blocked" : "pass",
        detail: credentialDetail
      },
      {
        name: "latest retrospective",
        status: input.retrospective ? "pass" : "blocked",
        detail: retrospectiveDetail
      },
      {
        name: "github",
        status: input.github?.status === "available" ? "pass" : "blocked",
        detail: githubDetail
      },
      {
        name: "session plan",
        status: input.sessionPlan ? "pass" : "blocked",
        detail: sessionPlanDetail
      },
      {
        name: "reference docs",
        status: referenceDocs.length > 0 ? "pass" : "blocked",
        detail: referenceDocsDetail
      },
      {
        name: "write actions",
        status: "blocked",
        detail: blockedActions.join(", ")
      }
    ]
  });

  return {
    command: "session start",
    status,
    markdown: report.markdown,
    json: {
      branchStatus: input.branchStatus,
      backlogCandidates: input.backlog.candidates,
      credentials,
      retrospective: input.retrospective,
      retrospectiveDetail: input.retrospectiveDetail,
      github: input.github,
      sessionPlan: input.sessionPlan,
      referenceDocs
    },
    blockedActions
  };
}
