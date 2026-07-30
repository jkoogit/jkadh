import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { promoteHcpTaskWithSessionReview, readTaskPromoteSessionReview, type TaskPromoteReviewRunner } from "../src/flows/task-promote-review.ts";
import { parseSessionCloseArgs } from "../src/flows/session-close.ts";
import { expandHarnessTagBlockArgs } from "../src/tags/tag-adapter.ts";
import {
  addHcpBacklog,
  addHcpTask,
  addHcpWorkItem,
  createHcpSession,
  readSessionById,
  updateHcpTask,
  updateHcpTaskPullRequest
} from "../src/state/session-state.ts";

test("task promote review reports multiple promoted tasks and recommends session close when no work remains", () => {
  const repo = createRepo("complete");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "promotion complete" });
  const first = addHcpTask(repo, { sessionId: session.sessionId, taskName: "first task", issueNumber: 169 });
  const second = addHcpTask(repo, { sessionId: session.sessionId, taskName: "second task", issueNumber: 170 });
  promoteTask(repo, session.sessionId, first.taskId);
  promoteTask(repo, session.sessionId, second.taskId);
  updateHcpTaskPullRequest(repo, { sessionId: session.sessionId, taskId: second.taskId, pullRequestNumber: 171 });
  addHcpWorkItem(repo, {
    sessionId: session.sessionId,
    sourceTaskId: second.taskId,
    title: "completed work item",
    status: "done",
    reason: "verified"
  });

  const review = readTaskPromoteSessionReview(repo, session.sessionId, successfulRunner());

  assert.equal(review.nextDecision, "close_session");
  assert.equal(review.tasks.length, 2);
  assert.equal(review.relatedIssues.length, 2);
  assert.equal(review.aligned, true);
  assert.match(review.markdown, new RegExp(`${first.taskId}=promoted`));
  assert.match(review.markdown, /T2\.1=done \(completed work item\)/);
  assert.match(review.markdown, /#169=CLOSED/);
  assert.match(review.markdown, /#501 dev<-task\/open/);
  assert.match(review.markdown, /branch alignment: aligned/);
  assert.match(review.markdown, new RegExp(`\`\`\`text\\n#세션정리\\{\\nsessionId: ${session.sessionId}`));
  assert.match(review.markdown, /완료태스크: .*first task/);
  assert.match(review.markdown, /종료이슈: 169/);
  assert.match(review.markdown, /종료이슈: 170/);
  assert.match(review.markdown, /PR제목: \[024\]_\(001\)_promotion_complete_세션정리/);
  const closeInput = parseSessionCloseArgs(expandHarnessTagBlockArgs("session_close", [review.nextPrompt]));
  assert.deepEqual(closeInput.verifiedIssueNumbers, [169, 170]);
});

test("task promote review builds a copyable task-start prompt from the actual open session backlog", () => {
  const repo = createRepo("backlog");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "backlog candidate" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "promoted task", issueNumber: 169 });
  promoteTask(repo, session.sessionId, task.taskId);
  addHcpBacklog(repo, {
    sessionId: session.sessionId,
    backlogId: "BLG-044",
    title: "실제 남은 작업",
    note: "실제 세션 Backlog\n범위를 ``` 구현한다"
  });

  const review = readTaskPromoteSessionReview(repo, session.sessionId, successfulRunner({ openPullRequests: [] }));

  assert.equal(review.nextDecision, "start_task");
  assert.match(review.markdown, /BLG-044=open \(실제 남은 작업\)/);
  assert.match(review.nextPrompt, /작업지시: BLG-044 실제 남은 작업/);
  assert.match(review.nextPrompt, new RegExp(`sessionId: ${session.sessionId}`));
  assert.match(review.nextPrompt, /작업범위: 실제 세션 Backlog 범위를 구현한다/);
  assert.doesNotMatch(review.nextPrompt, /```/);
  assert.match(review.markdown, /```text\n#태스크시작\{/);
  assert.doesNotMatch(review.markdown, /HCP 태스크 테이블 생성/);
});

test("task promote review continues an existing unfinished task instead of creating a duplicate", () => {
  const repo = createRepo("unfinished");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "unfinished task" });
  const promoted = addHcpTask(repo, { sessionId: session.sessionId, taskName: "promoted task", issueNumber: 169 });
  promoteTask(repo, session.sessionId, promoted.taskId);
  const active = addHcpTask(repo, { sessionId: session.sessionId, taskName: "existing active task", issueNumber: 170 });

  const review = readTaskPromoteSessionReview(repo, session.sessionId, successfulRunner());

  assert.equal(review.nextDecision, "continue_task");
  assert.match(review.nextPrompt, /#태스크처리\{/);
  assert.match(review.nextPrompt, new RegExp(`taskId: ${active.taskId}`));
  assert.doesNotMatch(review.nextPrompt, /#태스크시작/);
});

test("task promote review recommends promotion for an existing closed task", () => {
  const repo = createRepo("closed-task");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "closed task" });
  const promoted = addHcpTask(repo, { sessionId: session.sessionId, taskName: "promoted task", issueNumber: 169 });
  promoteTask(repo, session.sessionId, promoted.taskId);
  const closed = addHcpTask(repo, { sessionId: session.sessionId, taskName: "closed task", issueNumber: 170 });
  updateHcpTask(repo, { sessionId: session.sessionId, taskId: closed.taskId, expectedStatus: "active", status: "closed" });

  const review = readTaskPromoteSessionReview(repo, session.sessionId, successfulRunner());

  assert.equal(review.nextDecision, "continue_task");
  assert.match(review.nextPrompt, /#태스크승급\{/);
  assert.match(review.nextPrompt, new RegExp(`taskId: ${closed.taskId}`));
});

test("task promote review does not turn a deferred Work Item into a next task candidate", () => {
  const repo = createRepo("deferred-work");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "deferred work" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "promoted task", issueNumber: 169 });
  promoteTask(repo, session.sessionId, task.taskId);
  addHcpWorkItem(repo, { sessionId: session.sessionId, title: "deferred follow-up", status: "deferred", reason: "resume later" });

  const review = readTaskPromoteSessionReview(repo, session.sessionId, successfulRunner());

  assert.equal(review.nextDecision, "close_session");
  assert.match(review.markdown, /S1=deferred \(deferred follow-up\)/);
  assert.match(review.nextPrompt, /#세션정리/);
});

test("task promote review keeps local status useful when Issue and PR lookups fail", () => {
  const repo = createRepo("remote-failure");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "remote failure" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "promoted task", issueNumber: 169 });
  updateHcpTask(repo, { sessionId: session.sessionId, taskId: task.taskId, expectedStatus: "active", status: "closed" });
  const runner: TaskPromoteReviewRunner = {
    run(command, args) {
      if (command === "git") return alignedBranches();
      throw new Error(`${command} ${args.join(" ")} unavailable`);
    }
  };

  const { review } = promoteHcpTaskWithSessionReview(repo, { sessionId: session.sessionId, taskId: task.taskId }, runner);

  assert.equal(readSessionById(repo, session.sessionId).tasks[0]?.status, "promoted");
  assert.equal(review.issueLookup, "unavailable");
  assert.equal(review.pullRequestLookup, "unavailable");
  assert.equal(review.nextDecision, "close_session");
  assert.match(review.markdown, /related Issues \(unavailable\): #169=UNKNOWN/);
  assert.match(review.markdown, /open PRs \(unavailable\): none/);
  assert.match(review.markdown, /#세션정리/);
});

test("task promote orchestration persists promoted status before building the live review", () => {
  const repo = createRepo("orchestration");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "promotion orchestration" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "orchestrated task", issueNumber: 169 });
  updateHcpTask(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    expectedStatus: "active",
    status: "closed",
  });
  let observedPromotedStatus = false;
  const runner: TaskPromoteReviewRunner = {
    run(command, args) {
      observedPromotedStatus ||= readSessionById(repo, session.sessionId).tasks[0]?.status === "promoted";
      if (command === "git") return alignedBranches();
      if (args[0] === "issue") return JSON.stringify({ number: 169, state: "CLOSED", title: "completed issue" });
      if (args[0] === "pr") return "[]";
      throw new Error("unexpected command");
    }
  };

  const result = promoteHcpTaskWithSessionReview(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId
  }, runner);

  assert.equal(observedPromotedStatus, true);
  assert.equal(result.task.status, "promoted");
  assert.equal(readSessionById(repo, session.sessionId).tasks[0]?.status, "promoted");
  assert.ok(result.review);
  assert.match(result.review.markdown, new RegExp(`${task.taskId}=promoted`));
  assert.match(result.review.markdown, new RegExp(`\`\`\`text\\n#세션정리\\{\\nsessionId: ${session.sessionId}`));
  assert.match(result.review.markdown, /constraint validation: pass/);
});

test("task promote orchestration preserves promotion when the status review itself throws", () => {
  const repo = createRepo("review-failure");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "review failure" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "closed task", issueNumber: 169 });
  updateHcpTask(repo, { sessionId: session.sessionId, taskId: task.taskId, expectedStatus: "active", status: "closed" });

  const result = promoteHcpTaskWithSessionReview(repo, { sessionId: session.sessionId, taskId: task.taskId }, successfulRunner(), () => {
    throw new Error("review renderer failed");
  });

  assert.equal(result.task.status, "promoted");
  assert.equal(readSessionById(repo, session.sessionId).tasks[0]?.status, "promoted");
  assert.equal(result.review, undefined);
  assert.equal(result.reviewFailure, "review renderer failed");
});

test("task promote review rejects malformed GitHub PR items as an unavailable lookup", () => {
  const repo = createRepo("malformed-pr");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "malformed PR" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "promoted task", issueNumber: 169 });
  promoteTask(repo, session.sessionId, task.taskId);
  const runner = successfulRunner({ openPullRequests: [{ number: "invalid", title: null }] });

  const review = readTaskPromoteSessionReview(repo, session.sessionId, runner);

  assert.equal(review.pullRequestLookup, "unavailable");
  assert.deepEqual(review.openPullRequests, []);
  assert.match(review.markdown, /open PRs \(unavailable\): none/);
});

test("task promote review rejects a mismatched GitHub Issue response", () => {
  const repo = createRepo("malformed-issue");
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "malformed Issue" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "promoted task", issueNumber: 169 });
  promoteTask(repo, session.sessionId, task.taskId);
  const runner: TaskPromoteReviewRunner = {
    run(command, args) {
      if (command === "git") return alignedBranches();
      if (args[0] === "issue") return JSON.stringify({ number: 999, state: "CLOSED", title: "wrong Issue" });
      if (args[0] === "pr") return "[]";
      throw new Error("unexpected command");
    }
  };

  const review = readTaskPromoteSessionReview(repo, session.sessionId, runner);

  assert.equal(review.issueLookup, "unavailable");
  assert.deepEqual(review.relatedIssues, [{ number: 169, state: "UNKNOWN" }]);
});

function createRepo(label: string): string {
  return mkdtempSync(join(tmpdir(), `hcp-task-promote-review-${label}-`));
}

function promoteTask(repo: string, sessionId: string, taskId: string): void {
  updateHcpTask(repo, { sessionId, taskId, expectedStatus: "active", status: "closed" });
  updateHcpTask(repo, { sessionId, taskId, expectedStatus: "closed", status: "promoted" });
}

function successfulRunner(options: { openPullRequests?: unknown[] } = {}): TaskPromoteReviewRunner {
  return {
    run(command, args) {
      if (command === "git") return alignedBranches();
      if (args[0] === "issue") {
        const number = Number(args[2]);
        return JSON.stringify({ number, state: "CLOSED", title: `issue ${number}` });
      }
      if (args[0] === "pr") {
        return JSON.stringify(options.openPullRequests ?? [{
          number: 501,
          title: "open work",
          baseRefName: "dev",
          headRefName: "task/open"
        }]);
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    }
  };
}

function alignedBranches(): string {
  return [
    "abc123\trefs/heads/dev",
    "abc123\trefs/heads/stg",
    "abc123\trefs/heads/main"
  ].join("\n");
}
