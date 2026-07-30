import { runBoundedGitCommand, runBoundedGitHubCommand } from "../process/bounded-command.ts";
import { buildHarnessCompletionProtocol } from "./harness-completion-protocol.ts";
import { buildHarnessScopeReview, type HarnessScopeReview } from "./harness-scope-review.ts";
import {
  buildHcpSessionHandoff,
  buildHcpSessionRetrospectiveSummary,
  readSessionById,
  updateHcpTask,
  type HcpSessionState,
  type HcpTaskState,
  type HcpWorkItem,
  type UpdateHcpTaskInput
} from "../state/session-state.ts";

export interface TaskPromoteReviewRunner {
  run(command: string, args: string[], cwd: string): string;
}

export interface TaskPromoteSessionReview {
  sessionId: string;
  tasks: Array<{ taskId: string; status: string; issueNumber?: number; pullRequestNumber?: number }>;
  workItems: Array<{ displayId: string; status: string; title: string }>;
  backlogs: Array<{ backlogId: string; status: string; title: string; note?: string }>;
  relatedIssues: Array<{ number: number; state: "OPEN" | "CLOSED" | "UNKNOWN"; title?: string }>;
  issueLookup: "available" | "partial" | "unavailable";
  openPullRequests: Array<{ number: number; title: string; baseRefName?: string; headRefName?: string }>;
  pullRequestLookup: "available" | "unavailable";
  branches: Array<{ branch: "dev" | "stg" | "main"; commit?: string }>;
  branchLookup: "available" | "unavailable";
  aligned: boolean;
  scopeReview: HarnessScopeReview;
  nextDecision: "continue_task" | "start_task" | "close_session";
  nextPrompt: string;
  markdown: string;
}

export interface TaskPromotePostSuccessResult {
  task: HcpTaskState;
  review?: TaskPromoteSessionReview;
  reviewFailure?: string;
}

export type TaskPromoteReviewReader = (
  cwd: string, sessionId: string, runner: TaskPromoteReviewRunner
) => TaskPromoteSessionReview;

export function promoteHcpTaskWithSessionReview(
  cwd: string,
  input: Omit<UpdateHcpTaskInput, "status" | "expectedStatus"> & { sessionId: string },
  runner: TaskPromoteReviewRunner = defaultRunner,
  reviewReader: TaskPromoteReviewReader = readTaskPromoteSessionReview
): TaskPromotePostSuccessResult {
  const task = updateHcpTask(cwd, { ...input, expectedStatus: "closed", status: "promoted" });
  try {
    return { task, review: reviewReader(cwd, input.sessionId, runner) };
  } catch (error) {
    return { task, reviewFailure: error instanceof Error ? error.message : "session work status review failed" };
  }
}

export function readTaskPromoteSessionReview(
  cwd: string, sessionId: string, runner: TaskPromoteReviewRunner = defaultRunner
): TaskPromoteSessionReview {
  const session = readSessionById(cwd, sessionId);
  const issues = readRelatedIssues(session, cwd, runner);
  const pullRequests = readOpenPullRequests(cwd, runner);
  const branchState = readBranchAlignment(cwd, runner);
  const scopeReview = buildHarnessScopeReview(cwd, sessionId, "task_promote");
  const next = selectNextPrompt(session, branchState.items.find((item) => item.branch === "dev")?.commit);
  const review = {
    sessionId,
    tasks: session.tasks.map((task) => ({
      taskId: task.taskId, status: task.status, issueNumber: task.issueNumber, pullRequestNumber: task.pullRequest?.number
    })),
    workItems: (session.workItems ?? []).map((item) => ({ displayId: item.displayId, status: item.status, title: item.title })),
    backlogs: session.backlogItems.map((item) => ({
      backlogId: item.backlogId ?? item.hcpBacklogId, status: item.status, title: item.title, note: item.note
    })),
    relatedIssues: issues.items, issueLookup: issues.status,
    openPullRequests: pullRequests.items, pullRequestLookup: pullRequests.status,
    branches: branchState.items, branchLookup: branchState.status, aligned: branchState.aligned, scopeReview,
    nextDecision: next.decision, nextPrompt: next.prompt
  } satisfies Omit<TaskPromoteSessionReview, "markdown">;
  return { ...review, markdown: buildTaskPromoteSessionReviewMarkdown(review) };
}

export function buildTaskPromoteSessionReviewMarkdown(review: Omit<TaskPromoteSessionReview, "markdown">): string {
  const protocol = buildHarnessCompletionProtocol({
    tag: "task_promote",
    outcome: "executed",
    nextPrompt: review.nextPrompt,
    detail: `state-derived decision: ${review.nextDecision}`
  });
  return [
    "## Session Work Status Review", "", `- session: ${review.sessionId}`,
    `- tasks: ${summarize(review.tasks.map((item) => `${item.taskId}=${item.status}${item.issueNumber ? `,Issue#${item.issueNumber}` : ""}${item.pullRequestNumber ? `,PR#${item.pullRequestNumber}` : ""}`))}`,
    `- Work Items: ${summarize(review.workItems.map((item) => `${item.displayId}=${item.status} (${normalizePromptValue(item.title)})`))}`,
    `- session Backlog: ${summarize(review.backlogs.map((item) => `${item.backlogId}=${item.status} (${normalizePromptValue(item.title)})`))}`,
    `- related Issues (${review.issueLookup}): ${summarize(review.relatedIssues.map((item) => `#${item.number}=${item.state}${item.title ? ` (${normalizePromptValue(item.title)})` : ""}`))}`,
    `- open PRs (${review.pullRequestLookup}): ${summarize(review.openPullRequests.map((item) => `#${item.number} ${item.baseRefName ?? "?"}<-${item.headRefName ?? "?"} (${normalizePromptValue(item.title)})`))}`,
    `- dev/stg/main (${review.branchLookup}): ${summarize(review.branches.map((item) => `${item.branch}=${item.commit ?? "UNKNOWN"}`))}`,
    `- branch alignment: ${review.aligned ? "aligned" : "not aligned or unavailable"}`,
    "", review.scopeReview.markdown.trimEnd(),
    "", "## Next Task Review", "", `- decision: ${review.nextDecision}`, "",
    protocol.markdown.trimEnd()
  ].join("\n") + "\n";
}

export function buildTaskPromoteSessionReviewFailureMarkdown(sessionId: string, detail: string): string {
  return [
    "## Session Work Status Review", "", `- session: ${sessionId}`,
    "- status: unavailable", `- detail: ${normalizePromptValue(detail)}`,
    "- promotion result: preserved; retry the status review without repeating promotion"
  ].join("\n") + "\n";
}

function selectNextPrompt(session: HcpSessionState, devCommit?: string): { decision: TaskPromoteSessionReview["nextDecision"]; prompt: string } {
  const unfinishedTask = session.tasks.find((task) => task.status !== "promoted");
  if (unfinishedTask) {
    if (unfinishedTask.status === "closed") {
      return {
        decision: "continue_task",
        prompt: [
          "#태스크승급{",
          `sessionId: ${session.sessionId}`,
          `taskId: ${unfinishedTask.taskId}`,
          `대상커밋: ${devCommit ?? "확인필요"}`,
          "대상브랜치: stg,main",
          `검증결과: ${normalizePromptValue(unfinishedTask.closeEvidence?.verificationResult ?? "확인필요")}`,
          "}"
        ].join("\n")
      };
    }
    return {
      decision: "continue_task",
      prompt: ["#태스크처리{", `sessionId: ${session.sessionId}`, `taskId: ${unfinishedTask.taskId}`,
        `작업내용: ${normalizePromptValue(unfinishedTask.taskName)}의 ${unfinishedTask.status === "active" ? "남은 작업" : `${unfinishedTask.status} 상태 복구 작업`}을 처리한다.`, "}"].join("\n")
    };
  }
  const openBacklog = session.backlogItems.find((item) => item.status === "open");
  const remainingWorkItem = (session.workItems ?? []).find((item) => isNextWorkCandidate(item)
    && (!item.sourceTaskId || session.tasks.find((task) => task.taskId === item.sourceTaskId)?.status === "promoted"));
  if (openBacklog || remainingWorkItem) {
    const id = openBacklog?.backlogId ?? openBacklog?.hcpBacklogId ?? remainingWorkItem?.displayId ?? "session-candidate";
    const title = normalizePromptValue(openBacklog?.title ?? remainingWorkItem?.title ?? "세션 후속 작업");
    const scope = normalizePromptValue(openBacklog?.note ?? remainingWorkItem?.title ?? title);
    return {
      decision: "start_task",
      prompt: ["#태스크시작{", `sessionId: ${session.sessionId}`, `작업지시: ${id} ${title}`, `작업범위: ${scope}`,
        "제외범위: 현재 후보와 직접 관련 없는 작업은 제외한다.", `완료조건: ${title} 요구사항이 구현되고 검증된다.`,
        "검증방법: npm test, npm run check, 관련 CLI 실행 테스트", "}"].join("\n")
    };
  }
  return { decision: "close_session", prompt: buildSessionCloseContinuationPrompt(session) };
}

function buildSessionCloseContinuationPrompt(session: HcpSessionState): string {
  const relatedIssues = [...new Set([
    session.linkedIssue?.number,
    ...session.tasks.map((task) => task.issueNumber)
  ].filter((number): number is number => Boolean(number)))];
  const relatedIssue = relatedIssues[0];
  const completedTasks = session.tasks.filter((task) => task.status === "promoted")
    .map((task) => `${task.taskId} ${normalizePromptValue(task.taskName)}`);
  const remaining = [
    ...session.tasks.filter((task) => task.status !== "promoted").map((task) => `${task.taskId}=${task.status}`),
    ...session.backlogItems.filter((item) => item.status === "open").map((item) => `${item.backlogId ?? item.hcpBacklogId}=open`),
    ...(session.workItems ?? []).filter((item) => !["done", "cancelled", "backlogged", "deferred"].includes(item.status))
      .map((item) => `${item.displayId}=${item.status}`)
  ];
  return [
    "#세션정리{",
    `sessionId: ${session.sessionId}`,
    `완료태스크: ${completedTasks.join("; ") || "없음"}`,
    `세션명: ${normalizePromptValue(session.sessionName)}`,
    `이슈현행화: ${completedTasks.length}개 promoted 태스크와 최종 결산 상태를 반영한다.`,
    `남은작업: ${remaining.join("; ") || "없음"}`,
    `회고: ${normalizePromptValue(buildHcpSessionRetrospectiveSummary(session))}`,
    `다음세션인계: ${normalizePromptValue(buildHcpSessionHandoff(session))}`,
    `커밋메시지: docs: close session ${session.sessionNumber}`,
    `PR제목: [${session.sessionNumber}]_(001)_${normalizeTitleValue(session.sessionName)}_세션정리`,
    `관련이슈: ${relatedIssue ?? "확인필요"}`,
    ...relatedIssues.map((issue) => `종료이슈: ${issue}`),
    `이슈제목: [${relatedIssue ?? session.sessionNumber}]_[HCP]_${normalizeTitleValue(session.sessionName)}`,
    "}"
  ].join("\n");
}

function isNextWorkCandidate(item: HcpWorkItem): boolean {
  return !["done", "cancelled", "backlogged", "deferred"].includes(item.status);
}

function readRelatedIssues(session: HcpSessionState, cwd: string, runner: TaskPromoteReviewRunner): {
  status: TaskPromoteSessionReview["issueLookup"]; items: TaskPromoteSessionReview["relatedIssues"];
} {
  const numbers = [...new Set([session.linkedIssue?.number, ...session.tasks.map((task) => task.issueNumber)]
    .filter((value): value is number => Boolean(value)))];
  let failures = 0;
  const items = numbers.map((number) => {
    try {
      const value = parseIssueResponse(runner.run("gh", ["issue", "view", String(number), "--json", "number,state,title"], cwd), number);
      return { number, state: value.state === "OPEN" ? "OPEN" as const : value.state === "CLOSED" ? "CLOSED" as const : "UNKNOWN" as const, title: value.title };
    } catch {
      failures += 1;
      return { number, state: "UNKNOWN" as const };
    }
  });
  return { status: failures === 0 ? "available" : failures === items.length ? "unavailable" : "partial", items };
}

function readOpenPullRequests(cwd: string, runner: TaskPromoteReviewRunner): {
  status: TaskPromoteSessionReview["pullRequestLookup"]; items: TaskPromoteSessionReview["openPullRequests"];
} {
  try {
    const items = parsePullRequestList(runner.run("gh", ["pr", "list", "--state", "open", "--json", "number,title,baseRefName,headRefName"], cwd));
    return { status: "available", items };
  } catch {
    return { status: "unavailable", items: [] };
  }
}

function readBranchAlignment(cwd: string, runner: TaskPromoteReviewRunner): {
  status: TaskPromoteSessionReview["branchLookup"]; items: TaskPromoteSessionReview["branches"]; aligned: boolean;
} {
  try {
    const output = runner.run("git", ["ls-remote", "origin", "refs/heads/dev", "refs/heads/stg", "refs/heads/main"], cwd);
    const refs = new Map(output.split(/\r?\n/).filter(Boolean).map((line) => {
      const [commit, ref] = line.trim().split(/\s+/, 2);
      return [ref?.replace("refs/heads/", ""), commit] as const;
    }));
    const items = (["dev", "stg", "main"] as const).map((branch) => ({ branch, commit: refs.get(branch) }));
    const commits = items.map((item) => item.commit).filter(Boolean);
    return { status: "available", items, aligned: commits.length === 3 && new Set(commits).size === 1 };
  } catch {
    return { status: "unavailable", items: (["dev", "stg", "main"] as const).map((branch) => ({ branch })), aligned: false };
  }
}

function summarize(items: string[]): string { return items.length > 0 ? items.join("; ") : "none"; }

function normalizePromptValue(value: string): string {
  return value.trim().replace(/```/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ");
}

function normalizeTitleValue(value: string): string {
  return normalizePromptValue(value).replace(/\s+/g, "_");
}

function parseIssueResponse(output: string, expectedNumber: number): { state?: string; title?: string } {
  const value: unknown = JSON.parse(output);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GitHub Issue response must be an object");
  const issue = value as Record<string, unknown>;
  if (issue.number !== expectedNumber || typeof issue.state !== "string") throw new Error("GitHub Issue response fields are invalid");
  if (issue.title !== undefined && typeof issue.title !== "string") throw new Error("GitHub Issue title is invalid");
  return { state: issue.state, title: issue.title as string | undefined };
}

function parsePullRequestList(output: string): TaskPromoteSessionReview["openPullRequests"] {
  const value: unknown = JSON.parse(output);
  if (!Array.isArray(value)) throw new Error("GitHub PR list response must be an array");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("GitHub PR response item must be an object");
    const pullRequest = entry as Record<string, unknown>;
    if (typeof pullRequest.number !== "number" || !Number.isInteger(pullRequest.number) || typeof pullRequest.title !== "string") {
      throw new Error("GitHub PR response fields are invalid");
    }
    if (pullRequest.baseRefName !== undefined && typeof pullRequest.baseRefName !== "string") throw new Error("GitHub PR base branch is invalid");
    if (pullRequest.headRefName !== undefined && typeof pullRequest.headRefName !== "string") throw new Error("GitHub PR head branch is invalid");
    return {
      number: pullRequest.number as number,
      title: pullRequest.title,
      baseRefName: pullRequest.baseRefName as string | undefined,
      headRefName: pullRequest.headRefName as string | undefined
    };
  });
}

const defaultRunner: TaskPromoteReviewRunner = {
  run(command, args, cwd) {
    return command === "gh" ? runBoundedGitHubCommand(cwd, args) : runBoundedGitCommand(cwd, args);
  }
};
