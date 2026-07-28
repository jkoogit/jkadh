import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { beginSessionCloseState, buildSessionCloseReport, collectSessionRelatedIssues, completeSessionCloseState, enrichSessionCloseInputWithAutoStatus, enrichSessionCloseInputWithHcpState, enrichSessionCloseInputWithIssueSettlement, executeSessionClose, parseSessionCloseArgs, runSessionCloseExecution } from "../src/flows/session-close.ts";

const closingRetrospectiveSummary = [
  "Session status at snapshot: closing",
  "Session final status after successful #세션정리: complete"
].join("\n");
const settlementDigest = (decision: string, reason: string, followUp: string) => createHash("sha256").update([decision, reason, followUp].join("\n")).digest("hex").slice(0, 12);
import { addHcpTask, addHcpWorkItem, clearHcpSessionCloseCheckpoint, createHcpSession, readSessionById, recordHcpSessionCloseCheckpoint, transitionHcpSessionStatus, updateHcpTask } from "../src/state/session-state.ts";

test("session close arg parser accepts closure fields and verified issues", () => {
  const input = parseSessionCloseArgs([
    "--completed-task",
    "Harness task promote execution mode",
    "--session-number",
    "10",
    "--session-name",
    "Harness CLI execution modes",
    "--issue-update",
    "Issue #64 updated",
    "--remaining",
    "No open PR",
    "--retrospective",
    "RET draft ready",
    "--retrospective-doc",
    "docs/12.?뚭퀬/RET-009_2026-07-13_HCP_?몄뀡?뺣━_?뚭퀬.md",
    "--handoff",
    "Next: report suffix backlog",
    "--unresolved-doc",
    "BLG report suffix",
    "--verified-issue",
    "#64",
    "--execute"
  ]);

  assert.deepEqual(input, {
    completedTasks: ["Harness task promote execution mode"],
    sessionNumber: "010",
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.?뚭퀬/RET-009_2026-07-13_HCP_?몄뀡?뺣━_?뚭퀬.md",
    handoff: "Next: report suffix backlog",
    unresolvedDocs: ["BLG report suffix"],
    verifiedIssueNumbers: [64],
    execution: {
      enabled: true,
      paths: [],
      baseBranch: "dev",
      mergePr: true,
      promote: true,
      reuseOpenPr: false,
      targetBranches: ["stg", "main"]
    }
  });
});

test("session close arg parser accepts explicit open PR reuse approval", () => {
  const input = parseSessionCloseArgs([
    "--execute",
    "--reuse-open-pr",
    "--path",
    "docs/12.회고/RET-001.md",
    "--message",
    "docs: add session retrospective",
    "--pr-title",
    "[073]_(001)_HCP_session_close",
    "--related-issue",
    "73"
  ]);

  assert.equal(input.execution?.reuseOpenPr, true);
});

test("session close arg parser accepts bare session number", () => {
  const input = parseSessionCloseArgs([
    "010",
    "--completed-task",
    "Harness session close retrospective guard",
    "--session-name",
    "Harness HCP session close",
    "--issue-update",
    "Issue #73 updated",
    "--remaining",
    "No open PR",
    "--retrospective",
    "RET draft ready",
    "--retrospective-doc",
    "docs/12.????RET-009_2026-07-13_HCP_?紐꾨?類ｂ봺_????md",
    "--handoff",
    "Next session starts from session close guard"
  ]);

  assert.equal(input.sessionNumber, "010");
});

test("session close report is ready with required closure evidence", () => {
  const report = buildSessionCloseReport({
    completedTasks: ["task start", "task close", "task promote"],
    sessionNumber: "010",
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.?뚭퀬/RET-009_2026-07-13_HCP_?몄뀡?뺣━_?뚭퀬.md",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [64]
  });

  assert.equal(report.status, "ready");
  assert.equal(report.json.issueCloseReady, true);
  assert.match(report.markdown, /session name update: 010_Harness CLI execution modes/);
  assert.match(report.markdown, /session number: #010/);
  assert.match(report.markdown, /issue close readiness: #64/);
  assert.match(report.markdown, /retrospective artifact: docs\/12\..*RET-009_2026-07-13_HCP_/);
  assert.match(report.markdown, /## Next Session Handoff/);
  assert.match(report.markdown, /next start: Next session starts from report suffix backlog/);
  assert.match(report.markdown, /## Post-close Verification/);
  assert.match(report.markdown, /retrospective artifact: docs\/12\..*RET-009_2026-07-13_HCP_/);
  assert.match(report.markdown, /## Policy And Scope Summary/);
  assert.match(report.markdown, /appliedPolicies/);
  assert.match(report.markdown, /scopeDecision/);
  assert.equal(report.json.scopeDecision.decision, "allowed");
  assert.equal(report.json.appliedPolicies[0].id, "REF-008");
  assert.match(report.markdown, /## Issue Management Comment/);
  assert.match(report.markdown, /decision: close related Issue classified as close/);
});

test("session close report leaves session number blank when absent", () => {
  const report = buildSessionCloseReport({
    completedTasks: ["task start"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.?뚭퀬/RET-009_2026-07-13_HCP_?몄뀡?뺣━_?뚭퀬.md",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  });

  assert.match(report.markdown, /session number: \n/);
});

test("session close report is blocked when required closure evidence is missing", () => {
  const report = buildSessionCloseReport({
    completedTasks: [],
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  });

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.json.missing, [
    "completed tasks",
    "session name",
    "issue update",
    "remaining backlog issue PR",
    "retrospective",
    "retrospective artifact",
    "next session handoff"
  ]);
});

test("session close report is blocked when retrospective artifact is missing", () => {
  const report = buildSessionCloseReport({
    completedTasks: ["task promote"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [64]
  });

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.json.missing, ["retrospective artifact"]);
  assert.match(report.markdown, /retrospective artifact: missing; provide --retrospective-doc or --retrospective-deferred/);
});

test("session close auto status fills remaining work and reports branch alignment", () => {
  const calls: string[] = [];
  const input = enrichSessionCloseInputWithAutoStatus({
    completedTasks: ["task promote"],
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.회고/RET-009_2026-07-13_HCP_세션정리_회고.md",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  }, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return "repo";
      }
      if (command === "gh" && args[0] === "issue") {
        return JSON.stringify([{ number: 73, title: "open issue" }]);
      }
      if (command === "gh" && args[0] === "pr") {
        return JSON.stringify([]);
      }
      if (command === "git" && args[0] === "rev-parse") {
        return "abc123";
      }
      return "";
    }
  });

  const report = buildSessionCloseReport(input);

  assert.equal(input.remainingWork, "open backlog: 0; open issues: 1; open PRs: 0");
  assert.equal(input.autoStatus?.branchAlignment, "dev/stg/main aligned: abc123");
  assert.equal(report.status, "ready");
  assert.match(report.markdown, /auto status lookup: open backlog: 0; open issues: 1; open PRs: 0; dev\/stg\/main aligned: abc123/);
  assert.match(calls.join("\n"), /gh issue list --state open --json number,title/);
});

test("session close auto status counts unresolved backlog rows from Korean README path", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-backlog-count-"));
  const backlogDir = join(repo, "docs", "15.로그", "backlog");
  mkdirSync(backlogDir, { recursive: true });
  writeFileSync(join(backlogDir, "README.md"), `
# Backlog 미해결 인덱스

| ID | 제목 | 상태 | 처리시점 | 우선순위 | 의존 대상 | 연결 Issue | 경로 |
|---|---|---|---|---|---|---|---|
| BLG-026 | 세션정리 다음세션 인계와 후처리 정합성 보강 | Resolved | 진행 중 | High | HCP session close | #91 | [BLG-026](./2026/07/13/BLG-026.md) |
| BLG-027 | 세션정리 사후검증 Backlog 카운트 경로 보강 | Ready | 다음 Issue 선정 시 | High | HCP session close | - | [BLG-027](./2026/07/13/BLG-027.md) |
`, "utf8");

  const input = enrichSessionCloseInputWithAutoStatus({
    completedTasks: ["task promote"],
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.회고/RET-009_2026-07-13_HCP_세션정리_회고.md",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  }, repo, {
    run(command, args) {
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      if (command === "gh") {
        return JSON.stringify([]);
      }
      if (command === "git" && args[0] === "rev-parse") {
        return "abc123";
      }
      return "";
    }
  });

  assert.equal(input.remainingWork, "open backlog: 1; open issues: 0; open PRs: 0");
  assert.equal(input.autoStatus?.branchAlignment, "dev/stg/main aligned: abc123");
});

test("session close hcp state fills promoted tasks and verified session issue", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-state-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_Harness_HCP_state",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  const task = addHcpTask(repo, {
    sessionId: session.sessionId,
    taskName: "HCP state task",
    issueNumber: 73,
    now: new Date("2026-07-13T01:05:00.000Z")
  });
  updateHcpTask(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    status: "promoted",
    now: new Date("2026-07-13T01:10:00.000Z")
  });

  const input = enrichSessionCloseInputWithHcpState({
    completedTasks: [],
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.회고/RET-009_2026-07-13_HCP_세션정리_회고.md",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true,
      paths: [],
      baseBranch: "dev",
      mergePr: true,
      promote: true,
      targetBranches: ["stg", "main"]
    }
  }, repo);
  const report = buildSessionCloseReport(input);

  assert.equal(input.sessionId, session.sessionId);
  assert.deepEqual(input.completedTasks, [`${task.taskId} HCP state task`]);
  assert.deepEqual(input.verifiedIssueNumbers, []);
  assert.deepEqual(input.relatedIssues, [{ number: 73, sources: ["session.linkedIssue", `task:${task.taskId}`] }]);
  assert.equal(report.status, "ready");
});

test("session close collects session and task issues without duplicates", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-related-issues-"));
  const session = createHcpSession(repo, { sessionNumber: "10", sessionName: "related issues" });
  const first = addHcpTask(repo, { sessionId: session.sessionId, taskName: "first", issueNumber: 73 });
  const second = addHcpTask(repo, { sessionId: session.sessionId, taskName: "second", issueNumber: 73 });
  const stored = readSessionById(repo, session.sessionId);
  stored.linkedIssue = { hcpIssueId: "issue-73", sessionId: session.sessionId, number: 73 };

  assert.deepEqual(collectSessionRelatedIssues(stored), [{
    number: 73,
    sources: ["session.linkedIssue", `task:${first.taskId}`, `task:${second.taskId}`],
  }]);
});

test("session close blocks an undecided open issue and validates keep handoff evidence", () => {
  const base = {
    completedTasks: ["task promote"], sessionName: "settlement", issueUpdate: "issues checked",
    remainingWork: "none", retrospective: "ready", retrospectiveDocument: "docs/12.회고/RET.md",
    handoff: "#세션시작", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [{ number: 73, sources: ["session.linkedIssue"] }]
  };
  const undecided = enrichSessionCloseInputWithIssueSettlement(base, "repo", {
    run: () => JSON.stringify({ number: 73, state: "OPEN", title: "open", url: "https://example/73" })
  });
  assert.equal(buildSessionCloseReport(undecided).status, "blocked");
  assert.match(undecided.issueSettlementBlockers?.join(" ") ?? "", /OPEN without close\|keep\|handoff decision/);

  const kept = enrichSessionCloseInputWithIssueSettlement({
    ...base,
    relatedIssues: [{ number: 73, sources: ["session.linkedIssue"], decision: "keep", reason: "follow-up remains", followUp: "BLG-999" }]
  }, "repo", { run: () => JSON.stringify({ number: 73, state: "OPEN" }) });
  const report = buildSessionCloseReport(kept);
  assert.equal(report.status, "ready");
  assert.match(report.markdown, /#73 \[OPEN\] => keep/);
  assert.match(report.markdown, /```text\n#세션시작\n\nRelated Issue follow-ups:\n- Issue #73 keep: follow-up remains; follow-up: BLG-999\n```/);
});

test("session close blocks undecided issues before the closing state transition", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-issue-gate-"));
  const session = createHcpSession(repo, { sessionNumber: "10", sessionName: "issue gate" });
  const state = beginSessionCloseState({
    sessionId: session.sessionId, completedTasks: ["done"], sessionName: "issue gate", issueUpdate: "checked",
    remainingWork: "none", retrospective: "ready", handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    issueSettlementBlockers: ["#73 OPEN without close|keep|handoff decision"]
  }, repo);
  assert.equal(state.status, "blocked");
  assert.match(state.detail, /related issue settlement blocked/);
  assert.equal(readSessionById(repo, session.sessionId).status, "active");
});

test("session close classifies closed issues and closes only explicit close decisions", () => {
  const input = enrichSessionCloseInputWithIssueSettlement({
    completedTasks: ["task promote"], sessionName: "settlement", issueUpdate: "issues checked",
    remainingWork: "none", retrospective: "ready", retrospectiveDeferredReason: "existing artifact",
    hcpRetrospectiveSummary: closingRetrospectiveSummary, handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [74],
    relatedIssues: [
      { number: 73, sources: ["task:a"] },
      { number: 74, sources: ["task:b"], decision: "close" }
    ], execution: { enabled: true }
  }, "repo", {
    run(_command, args) {
      return JSON.stringify({ number: Number(args[2]), state: args[2] === "73" ? "CLOSED" : "OPEN" });
    }
  });
  const calls: string[] = [];
  const result = executeSessionClose(input, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      return "";
    }
  });
  assert.equal(result.status, "executed");
  assert.match(calls.join("\n"), /gh issue close 74/);
  assert.doesNotMatch(calls.join("\n"), /gh issue close 73/);
});

test("session close comments on every keep and handoff issue after promotion gates", () => {
  const calls: string[] = [];
  const input = {
    completedTasks: ["done"], sessionName: "settlement", issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing artifact", hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "#세션시작", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [
      { number: 73, sources: ["task:a"], state: "OPEN" as const, decision: "keep" as const, reason: "approval pending", followUp: "BLG-031" },
      { number: 74, sources: ["task:b"], state: "OPEN" as const, decision: "handoff" as const, reason: "next session", followUp: "session 025" }
    ], execution: { enabled: true }
  };
  const report = buildSessionCloseReport(input);
  const result = executeSessionClose(input, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      return "";
    }
  });
  assert.equal(result.status, "executed");
  assert.match(calls.join("\n"), /gh issue comment 73 --body <!-- hcp-session-close-settlement:settlement:73:keep:[0-9a-f]{12} -->/);
  assert.match(calls.join("\n"), /gh issue comment 74 --body <!-- hcp-session-close-settlement:settlement:74:handoff:[0-9a-f]{12} -->/);
  assert.match(report.markdown, /Related Issue follow-ups:\n- Issue #73 keep: approval pending; follow-up: BLG-031/);
});

test("session close reuses a marked keep or handoff settlement comment", () => {
  const calls: string[] = [];
  const input = {
    sessionId: "codex_ses_024", completedTasks: ["done"], sessionName: "settlement", issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing artifact", hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [{ number: 73, sources: ["task:a"], state: "OPEN" as const, decision: "keep" as const, reason: "pending", followUp: "BLG-031" }],
    execution: { enabled: true }
  };
  const result = executeSessionClose(input, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh" && args.join(" ") === "api --paginate --slurp repos/{owner}/{repo}/issues/73/comments?per_page=100") {
        const digest = settlementDigest("keep", "pending", "BLG-031");
        return JSON.stringify([[], [{ body: `<!-- hcp-session-close-settlement:codex_ses_024:73:keep:${digest} -->` }]]);
      }
      return "";
    }
  });
  assert.equal(result.status, "executed");
  assert.match(result.markdown, /settlement already recorded for issue #73: keep/);
  assert.doesNotMatch(calls.join("\n"), /gh issue comment 73/);
});

test("session close writes a new settlement when reason or follow-up changes", () => {
  const calls: string[] = [];
  const input = {
    sessionId: "codex_ses_024", completedTasks: ["done"], sessionName: "settlement", issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing artifact", hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [{ number: 73, sources: ["task:a"], state: "OPEN" as const, decision: "keep" as const, reason: "changed", followUp: "BLG-032" }],
    execution: { enabled: true }
  };
  const oldDigest = settlementDigest("keep", "pending", "BLG-031");
  const result = executeSessionClose(input, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh" && args.join(" ") === "api --paginate --slurp repos/{owner}/{repo}/issues/73/comments?per_page=100") {
        return JSON.stringify([[{ body: `<!-- hcp-session-close-settlement:codex_ses_024:73:keep:${oldDigest} -->` }]]);
      }
      return "";
    }
  });
  assert.equal(result.status, "executed");
  assert.match(calls.join("\n"), /gh issue comment 73/);
  assert.match(calls.join("\n"), /Reason: changed\nFollow-up: BLG-032/);
});

test("session close records completed issue numbers when a later settlement fails", () => {
  const input = {
    completedTasks: ["done"], sessionName: "settlement", issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing artifact", hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [
      { number: 73, sources: ["task:a"], state: "OPEN" as const, decision: "keep" as const, reason: "pending", followUp: "BLG-031" },
      { number: 74, sources: ["task:b"], state: "OPEN" as const, decision: "handoff" as const, reason: "later", followUp: "session 025" }
    ], execution: { enabled: true }
  };
  const result = executeSessionClose(input, "repo", {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh" && args[0] === "issue" && args[1] === "comment" && args[2] === "74") throw new Error("network failure");
      return "";
    }
  });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.recovery?.completedIssueSettlements, [73]);
  assert.match(result.markdown, /completed issue settlements: #73/);
  assert.equal(result.recovery?.sessionStatus, "active");
});

test("session close retries partial Issue settlement from active state and completes", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-settlement-retry-"));
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "settlement retry" });
  const input = {
    sessionId: session.sessionId, completedTasks: ["done"], sessionName: "settlement retry", issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing artifact", handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [
      { number: 73, sources: ["task:a"], state: "OPEN" as const, decision: "keep" as const, reason: "pending", followUp: "BLG-031" },
      { number: 74, sources: ["task:b"], state: "OPEN" as const, decision: "handoff" as const, reason: "later", followUp: "session 025" }
    ], execution: { enabled: true }
  };
  const comments = new Map<number, string[]>();
  let failSecond = true;
  const commentCalls = new Map<number, number>();
  const runner = {
    run(command: string, args: string[]) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh" && args[0] === "api") {
        const number = Number(args[3]?.match(/issues\/(\d+)\//)?.[1]);
        return JSON.stringify([comments.get(number)?.map((body) => ({ body })) ?? []]);
      }
      if (command === "gh" && args[0] === "issue" && args[1] === "comment") {
        const number = Number(args[2]);
        commentCalls.set(number, (commentCalls.get(number) ?? 0) + 1);
        if (number === 74 && failSecond) {
          failSecond = false;
          throw new Error("network failure");
        }
        comments.set(number, [...(comments.get(number) ?? []), args[4] ?? ""]);
      }
      return "";
    }
  };

  const firstState = beginSessionCloseState(input, repo);
  assert.equal(firstState.status, "updated");
  const first = executeSessionClose(firstState.executionInput, repo, runner);
  completeSessionCloseState(repo, firstState.sessionId, first.status, first.recovery);
  assert.equal(first.status, "blocked");
  assert.equal(readSessionById(repo, session.sessionId).status, "active");

  const secondState = beginSessionCloseState(input, repo);
  const second = executeSessionClose(secondState.executionInput, repo, runner);
  completeSessionCloseState(repo, secondState.sessionId, second.status, second.recovery);
  assert.equal(second.status, "executed");
  assert.equal(readSessionById(repo, session.sessionId).status, "complete");
  assert.equal(commentCalls.get(73), 1);
  assert.equal(commentCalls.get(74), 2);
  assert.match(second.markdown, /settlement already recorded for issue #73: keep/);
});

test("session close checkpoint persists across reads and clears after completion", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-checkpoint-state-"));
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "checkpoint" });
  recordHcpSessionCloseCheckpoint(repo, session.sessionId, {
    resumeFrom: "close_issue", retrospectiveDocument: "docs/12.회고/RET.md", pullRequestNumber: 80,
    promotedCommit: "abc123", targetBranches: ["stg", "main"], completedIssueSettlements: [73], relatedIssues: [], retryable: true
  });
  assert.equal(readSessionById(repo, session.sessionId).sessionCloseCheckpoint?.pullRequestNumber, 80);
  clearHcpSessionCloseCheckpoint(repo, session.sessionId);
  assert.equal(readSessionById(repo, session.sessionId).sessionCloseCheckpoint, undefined);
});

test("session close restores Issue decisions from checkpoint without repeated options", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-checkpoint-decisions-"));
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "checkpoint decisions" });
  recordHcpSessionCloseCheckpoint(repo, session.sessionId, {
    resumeFrom: "close_issue", targetBranches: [], completedIssueSettlements: [], retryable: false,
    relatedIssues: [{ number: 73, sources: ["task:a"], state: "OPEN", decision: "keep", reason: "approval pending", followUp: "BLG-031" }]
  });
  const restored = enrichSessionCloseInputWithHcpState({
    sessionId: session.sessionId, completedTasks: ["done"], issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing", handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: []
  }, repo);
  const settled = enrichSessionCloseInputWithIssueSettlement(restored, repo, {
    run: () => JSON.stringify({ number: 73, state: "OPEN" })
  });
  assert.equal(settled.relatedIssues?.[0]?.decision, "keep");
  assert.equal(settled.relatedIssues?.[0]?.followUp, "BLG-031");
  assert.deepEqual(settled.issueSettlementBlockers, []);
});

test("session close refreshes remote Issue state while preserving an open settlement decision", () => {
  const settled = enrichSessionCloseInputWithIssueSettlement({
    completedTasks: ["done"], unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [{ number: 73, sources: ["checkpoint"], state: "OPEN", decision: "handoff", reason: "later", followUp: "session 025" }]
  }, "repo", {
    run: () => JSON.stringify({ number: 73, state: "OPEN", title: "refreshed", url: "https://example/issues/73" })
  });
  assert.equal(settled.relatedIssues?.[0]?.decision, "handoff");
  assert.equal(settled.relatedIssues?.[0]?.reason, "later");
  assert.equal(settled.relatedIssues?.[0]?.title, "refreshed");
});

test("CLI session close orchestration exits on first Issue failure and resumes in a second process run", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-cli-restart-"));
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "CLI restart" });
  writeFileSync(join(repo, "retrospective.md"), closingRetrospectiveSummary);
  let failComment = true;
  const executionCalls: string[] = [];
  const runner = {
    run(command: string, args: string[]) {
      executionCalls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") return repo;
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "git" && args[0] === "rev-parse" && args[1]?.startsWith("origin/")) return "abc123";
      if (command === "gh" && args.join(" ") === "pr view 80 --json state") return JSON.stringify({ state: "MERGED" });
      if (command === "gh" && args.join(" ") === "pr view --json url,state") throw new Error("no pull requests found");
      if (command === "gh" && args[0] === "pr" && args[1] === "create") return "https://github.com/example/repo/pull/80";
      if (command === "gh" && args[0] === "api") return JSON.stringify([[]]);
      if (command === "gh" && args[0] === "issue" && args[1] === "comment" && args[2] === "73" && failComment) {
        failComment = false;
        throw new Error("network failure");
      }
      return "";
    }
  };
  const base = {
    sessionId: session.sessionId, completedTasks: ["done"], issueUpdate: "settlement checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDocument: "retrospective.md", hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    execution: {
      enabled: true, paths: ["retrospective.md"], mergePr: true, promote: true, targetBranches: ["stg", "main"], relatedIssueNumber: 99,
      commitMessage: "docs: close session", prTitle: "[099]_(024)_HCP_session_close"
    }
  };
  const issueRunner = { run: () => JSON.stringify({ number: 73, state: "OPEN" }) };

  const firstInput = enrichSessionCloseInputWithIssueSettlement(enrichSessionCloseInputWithHcpState({
    ...base,
    relatedIssues: [{ number: 73, sources: ["task:a"], decision: "keep" as const, reason: "pending", followUp: "BLG-031" }]
  }, repo), repo, issueRunner);
  const first = runSessionCloseExecution(firstInput, repo, runner);
  assert.equal(first.execution?.status, "blocked");
  assert.equal(first.execution?.recovery?.failedAction, "close_issue", first.execution?.markdown);
  assert.equal(readSessionById(repo, session.sessionId).status, "active");
  assert.equal(readSessionById(repo, session.sessionId).sessionCloseCheckpoint?.relatedIssues[0]?.decision, "keep");
  const firstWriteCount = executionCalls.filter((call) => call.includes("issue comment 73")).length;

  executionCalls.length = 0;
  const secondInput = enrichSessionCloseInputWithIssueSettlement(
    enrichSessionCloseInputWithHcpState(base, repo), repo, issueRunner
  );
  assert.equal(secondInput.relatedIssues?.[0]?.decision, "keep");
  const second = runSessionCloseExecution(secondInput, repo, runner);
  assert.equal(second.execution?.status, "executed", second.execution?.markdown);
  assert.equal(readSessionById(repo, session.sessionId).status, "complete");
  assert.equal(readSessionById(repo, session.sessionId).sessionCloseCheckpoint, undefined);
  assert.equal(firstWriteCount, 1);
  assert.doesNotMatch(executionCalls.join("\n"), /git add|git commit|git push|gh pr create|gh pr merge/);
  assert.match(executionCalls.join("\n"), /gh issue comment 73/);
});

test("session close preserves checkpoint recovery for non-retryable Issue settlement failures", () => {
  const result = executeSessionClose({
    completedTasks: ["done"], sessionName: "auth recovery", issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing", handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [{ number: 73, sources: ["task:a"], state: "OPEN", decision: "keep", reason: "pending", followUp: "BLG-031" }],
    execution: { enabled: true }
  }, "repo", {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh" && args[0] === "api") return "[]";
      if (command === "gh" && args[0] === "issue" && args[1] === "comment") throw new Error("authentication failed");
      return "";
    }
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.recovery?.retryable, false);
  assert.equal(result.recovery?.sessionStatus, "active");
  assert.deepEqual(result.recovery?.relatedIssues?.map((issue) => issue.number), [73]);
  assert.match(result.recovery?.recoveryAction ?? "", /requires operator remediation/);
});

test("session close converts checkpoint GitHub and Git verification exceptions into active recovery", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-checkpoint-command-errors-"));
  writeFileSync(join(repo, "retrospective.md"), closingRetrospectiveSummary);
  const base = {
    completedTasks: ["done"], sessionName: "checkpoint errors", issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDocument: "retrospective.md", handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [], execution: { enabled: true }
  };
  const githubFailure = executeSessionClose({
    ...base,
    recoveryCheckpoint: {
      resumeFrom: "close_issue" as const, retrospectiveDocument: "retrospective.md", pullRequestNumber: 80,
      targetBranches: [], completedIssueSettlements: [], relatedIssues: [], retryable: true, recordedAt: "2026-07-29T00:00:00.000Z"
    }
  }, repo, {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh") throw new Error("network failure");
      return "";
    }
  });
  assert.equal(githubFailure.status, "blocked");
  assert.equal(githubFailure.recovery?.sessionStatus, "active");
  assert.equal(githubFailure.recovery?.retryable, true);
  assert.match(githubFailure.recovery?.failure ?? "", /network failure/);

  const gitFailure = executeSessionClose({
    ...base,
    recoveryCheckpoint: {
      resumeFrom: "close_issue" as const, retrospectiveDocument: "retrospective.md", promotedCommit: "abc123",
      targetBranches: ["stg"], completedIssueSettlements: [], relatedIssues: [], retryable: true, recordedAt: "2026-07-29T00:00:00.000Z"
    }
  }, repo, {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      throw new Error("remote ref unavailable");
    }
  });
  assert.equal(gitFailure.status, "blocked");
  assert.equal(gitFailure.recovery?.sessionStatus, "active");
  assert.equal(gitFailure.recovery?.retryable, false);
  assert.match(gitFailure.recovery?.failure ?? "", /remote ref unavailable/);
});

test("session close preserves the persisted checkpoint when verification throws", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-checkpoint-verify-preserve-"));
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "verify preserve" });
  recordHcpSessionCloseCheckpoint(repo, session.sessionId, {
    resumeFrom: "close_issue", pullRequestNumber: 80, targetBranches: [], completedIssueSettlements: [73],
    relatedIssues: [{ number: 73, sources: ["task:a"], state: "OPEN", decision: "keep", reason: "pending", followUp: "BLG-031" }],
    retryable: true
  });
  const recordedAt = readSessionById(repo, session.sessionId).sessionCloseCheckpoint?.recordedAt;
  const result = runSessionCloseExecution({
    sessionId: session.sessionId, completedTasks: ["done"], issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing", handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    execution: { enabled: true }
  }, repo, {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh") throw new Error("network failure");
      return "";
    }
  });
  assert.equal(result.execution?.status, "blocked");
  assert.equal(readSessionById(repo, session.sessionId).status, "active");
  assert.equal(readSessionById(repo, session.sessionId).sessionCloseCheckpoint?.recordedAt, recordedAt);
  assert.equal(readSessionById(repo, session.sessionId).sessionCloseCheckpoint?.completedIssueSettlements[0], 73);
});

test("session close recovers when remote close succeeds but the first response fails", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-ambiguous-success-"));
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "ambiguous success" });
  let remoteState: "OPEN" | "CLOSED" = "OPEN";
  let closeCalls = 0;
  const executionRunner = {
    run(command: string, args: string[]) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh" && args[0] === "issue" && args[1] === "close") {
        closeCalls += 1;
        remoteState = "CLOSED";
        throw new Error("network response lost");
      }
      return "";
    }
  };
  const base = {
    sessionId: session.sessionId, completedTasks: ["done"], issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing", handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    execution: { enabled: true }
  };
  const first = runSessionCloseExecution({
    ...base,
    relatedIssues: [{ number: 73, sources: ["task:a"], state: "OPEN" as const, decision: "close" as const }]
  }, repo, executionRunner);
  assert.equal(first.execution?.status, "blocked");
  assert.equal(readSessionById(repo, session.sessionId).status, "active");

  const secondInput = enrichSessionCloseInputWithIssueSettlement(
    enrichSessionCloseInputWithHcpState(base, repo), repo,
    { run: () => JSON.stringify({ number: 73, state: remoteState }) }
  );
  assert.equal(secondInput.relatedIssues?.[0]?.decision, "closed");
  const second = runSessionCloseExecution(secondInput, repo, executionRunner);
  assert.equal(second.execution?.status, "executed");
  assert.equal(closeCalls, 1);
  assert.equal(readSessionById(repo, session.sessionId).status, "complete");
});

test("session close restores active and preserves an existing checkpoint when checkpoint persistence fails", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-checkpoint-write-failure-"));
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "checkpoint write failure" });
  recordHcpSessionCloseCheckpoint(repo, session.sessionId, {
    resumeFrom: "close_issue", targetBranches: [], completedIssueSettlements: [], relatedIssues: [], retryable: true
  });
  const originalRecordedAt = readSessionById(repo, session.sessionId).sessionCloseCheckpoint?.recordedAt;
  const result = runSessionCloseExecution({
    sessionId: session.sessionId, completedTasks: ["done"], issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDeferredReason: "existing", handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [{ number: 73, sources: ["task:a"], state: "OPEN", decision: "keep", reason: "pending", followUp: "BLG-031" }],
    execution: { enabled: true }
  }, repo, {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh" && args[0] === "api") return "[]";
      if (command === "gh" && args[0] === "issue" && args[1] === "comment") throw new Error("network failure");
      return "";
    }
  }, {
    recordCheckpoint: () => { throw new Error("checkpoint disk unavailable"); },
    clearCheckpoint: clearHcpSessionCloseCheckpoint,
    completeState: completeSessionCloseState
  });
  assert.equal(result.execution?.status, "blocked");
  assert.match(result.execution?.markdown ?? "", /checkpoint persistence failed: checkpoint disk unavailable/);
  assert.equal(readSessionById(repo, session.sessionId).status, "active");
  assert.equal(readSessionById(repo, session.sessionId).sessionCloseCheckpoint?.recordedAt, originalRecordedAt);
});

test("session close resumes at Issue settlement after checkpoint verification", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-checkpoint-resume-"));
  const retrospective = join(repo, "retrospective.md");
  writeFileSync(retrospective, closingRetrospectiveSummary);
  const calls: string[] = [];
  const result = executeSessionClose({
    sessionId: "codex_ses_024", completedTasks: ["done"], sessionName: "checkpoint", issueUpdate: "checked", remainingWork: "none",
    retrospective: "ready", retrospectiveDocument: "retrospective.md", handoff: "next", unresolvedDocs: [], verifiedIssueNumbers: [],
    relatedIssues: [{ number: 74, sources: ["task:b"], state: "OPEN", decision: "handoff", reason: "later", followUp: "session 025" }],
    recoveryCheckpoint: {
      resumeFrom: "close_issue", retrospectiveDocument: "retrospective.md", pullRequestNumber: 80,
      promotedCommit: "abc123", targetBranches: ["stg", "main"], completedIssueSettlements: [73], relatedIssues: [], retryable: true, recordedAt: "2026-07-29T00:00:00.000Z"
    },
    execution: { enabled: true }
  }, repo, {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      if (command === "gh" && args.join(" ") === "pr view 80 --json state") return JSON.stringify({ state: "MERGED" });
      if (command === "git" && (args.join(" ") === "rev-parse origin/stg" || args.join(" ") === "rev-parse origin/main")) return "abc123";
      if (command === "gh" && args[0] === "api") return JSON.stringify([[]]);
      return "";
    }
  });
  assert.equal(result.status, "executed");
  assert.doesNotMatch(calls.join("\n"), /git add|git commit|git push|gh pr create|gh pr merge/);
  assert.match(calls.join("\n"), /gh issue comment 74/);
});

test("session close orchestration replaces a report summary after closing transition before completion", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-closing-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_Harness_HCP_state",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  const activeInput = enrichSessionCloseInputWithHcpState({
    sessionId: session.sessionId,
    completedTasks: ["task promote"],
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.회고/RET-009_2026-07-13_HCP_세션정리_회고.md",
    hcpRetrospectiveSummary: "operator-provided report summary",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  }, repo);

  assert.equal(activeInput.hcpRetrospectiveSummary, "operator-provided report summary");

  const state = beginSessionCloseState(activeInput, repo);

  assert.equal(state.status, "updated");
  assert.equal(readSessionById(repo, session.sessionId).status, "closing");
  assert.match(state.executionInput.hcpRetrospectiveSummary ?? "", /Session status at snapshot: closing/);
  assert.match(state.executionInput.hcpRetrospectiveSummary ?? "", /Session final status after successful #세션정리: complete/);
  assert.doesNotMatch(state.executionInput.hcpRetrospectiveSummary ?? "", /operator-provided report summary/);
  completeSessionCloseState(repo, state.sessionId, "executed");
  assert.equal(readSessionById(repo, session.sessionId).status, "complete");
});

test("session close blocks before closing transition when a work item needs user disposition", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-work-item-block-"));
  const session = createHcpSession(repo, {
    sessionNumber: "10",
    sessionName: "010_Harness_work_item_gate"
  });
  const item = addHcpWorkItem(repo, {
    sessionId: session.sessionId,
    title: "unresolved follow-up",
    status: "deferred",
    reason: "user decision required"
  });
  const input = enrichSessionCloseInputWithHcpState({
    sessionId: session.sessionId,
    completedTasks: ["task promote"],
    issueUpdate: "Issue updated",
    remainingWork: "work item decision required",
    retrospective: "RET ready",
    handoff: "decide task, backlog, or cancellation",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: { enabled: true }
  }, repo);
  const state = beginSessionCloseState(input, repo);
  const report = buildSessionCloseReport(input);

  assert.equal(state.status, "blocked");
  assert.match(state.detail, new RegExp(`${item.workItemId} S1 deferred`));
  assert.match(state.detail, /S1=task\|backlog\|cancel/);
  assert.match(report.markdown, /natural-language feedback does not change HCP state/);
  assert.equal(readSessionById(repo, session.sessionId).status, "active");
});

test("session close hcp state blocks unfinished active tasks", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-active-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_Harness_HCP_state",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  const task = addHcpTask(repo, {
    sessionId: session.sessionId,
    taskName: "HCP active task",
    issueNumber: 73,
    now: new Date("2026-07-13T01:05:00.000Z")
  });

  const input = enrichSessionCloseInputWithHcpState({
    completedTasks: [],
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.회고/RET-009_2026-07-13_HCP_세션정리_회고.md",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  }, repo);
  const report = buildSessionCloseReport(input);

  assert.deepEqual(input.stateBlockers, [`${task.taskId} active`]);
  assert.equal(report.status, "blocked");
  assert.match(report.markdown, /hcp task state: codex_task_010_001 active/);
});

test("session close execution skips issue close when no related issue is classified as close", () => {
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    hcpRetrospectiveSummary: closingRetrospectiveSummary,
    retrospectiveDeferredReason: "RET-009 will be added in a follow-up correction task",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true
    }
  }, "repo", {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/024-close";
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.match(result.markdown, /no open related issue requires settlement action/);
});

test("session close execution blocks on protected branches before writes", () => {
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [73],
    execution: {
      enabled: true,
      paths: ["docs/12.retrospective/RET-001.md"],
      commitMessage: "docs: add session close retrospective",
      prTitle: "[073]_(001)_HCP_session_close_retrospective",
      relatedIssueNumber: 73,
      baseBranch: "dev",
      mergePr: true,
      promote: true,
      targetBranches: ["stg", "main"]
    }
  }, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "dev";
      }
      return "";
    }
  });

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /protected branch dev/);
  assert.doesNotMatch(calls.join("\n"), /git add --/);
  assert.doesNotMatch(calls.join("\n"), /gh pr create/);
});

test("session close execution blocks identical PR head and base before writes", () => {
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [73],
    execution: {
      enabled: true,
      paths: ["docs/12.retrospective/RET-001.md"],
      commitMessage: "docs: add session close retrospective",
      prTitle: "[073]_(001)_HCP_session_close_retrospective",
      relatedIssueNumber: 73,
      baseBranch: "session_codex/010-session-close",
      mergePr: true,
      promote: true,
      targetBranches: ["stg", "main"]
    }
  }, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "session_codex/010-session-close";
      }
      return "";
    }
  });

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /PR head and base are identical/);
  assert.doesNotMatch(calls.join("\n"), /git add --/);
});

test("session close execution blocks when post-retrospective diff check fails", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-diff-check-"));
  let diffChecks = 0;
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionNumber: "010",
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [73],
    execution: {
      enabled: true,
      paths: [],
      commitMessage: "docs: add session close retrospective",
      prTitle: "[073]_(001)_HCP_session_close_retrospective",
      relatedIssueNumber: 73,
      baseBranch: "dev",
      mergePr: true,
      promote: true,
      targetBranches: ["stg", "main"]
    }
  }, repo, {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "session_codex/010-session-close";
      }
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      if (command === "git" && args.join(" ") === "diff --check") {
        diffChecks += 1;
        if (diffChecks === 2) {
          throw new Error("trailing whitespace");
        }
      }
      return "";
    }
  });

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /post-retrospective git diff --check failed/);
  assert.equal(diffChecks, 2);
});

test("session close execution prints recovery report when PR creation fails after push", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-pr-failure-"));
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionNumber: "010",
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [73],
    execution: {
      enabled: true,
      paths: [],
      commitMessage: "docs: add session close retrospective",
      prTitle: "[073]_(001)_HCP_session_close_retrospective",
      relatedIssueNumber: 73,
      baseBranch: "dev",
      mergePr: true,
      promote: true,
      targetBranches: ["stg", "main"]
    }
  }, repo, {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "session_codex/010-session-close";
      }
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "create") {
        throw new Error("GraphQL: head and base must be different");
      }
      return "";
    }
  });

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /## Recovery Report/);
  assert.match(result.markdown, /failed action: create_pr/);
  assert.match(result.markdown, /created commit: yes/);
  assert.match(result.markdown, /pushed branch: yes/);
  assert.match(result.markdown, /failure category: api/);
  assert.match(result.markdown, /retryable: no/);
  assert.match(result.markdown, /recovery action: inspect the GitHub API response/);
  assert.equal(result.recovery?.failedAction, "create_pr");
  assert.equal(result.recovery?.failureCategory, "api");
  assert.ok(result.recovery?.completedActions?.includes("push_branch"));
  assert.match(result.markdown, /GraphQL: head and base must be different/);
});

test("session close execution creates retrospective draft before decision-required issue close", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-"));
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionNumber: "010",
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true
    }
  }, repo, {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      return "";
    }
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.steps[0].action, "write_retrospective");
  assert.equal(result.steps[0].status, "executed");
  assert.match(result.steps.at(-1)?.detail ?? "", /missing execution options: message; pr-title; related-issue/);
  const relativePath = result.steps[0].detail.replace("created ", "");
  const retrospective = readFileSync(join(repo, relativePath), "utf8");
  const readme = readFileSync(join(repo, "docs", "12.회고", "README.md"), "utf8");

  assert.match(retrospective, /Harness HCP session close/);
  assert.match(retrospective, /RET draft ready/);
  assert.match(readme, /RET-001/);
  assert.match(readme, /Harness HCP session close/);
  assert.match(calls.join("\n"), /git rev-parse --show-toplevel/);
});

test("session close execution can PR merge and promote generated retrospective artifacts", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-pr-"));
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionNumber: "010",
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [73],
    execution: {
      enabled: true,
      paths: [],
      commitMessage: "docs: add session close retrospective",
      prTitle: "[073]_(001)_HCP_세션정리_회고문서_누락방지_보강",
      relatedIssueNumber: 73,
      baseBranch: "dev",
      mergePr: true,
      promote: true,
      targetBranches: ["stg", "main"]
    }
  }, repo, {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "task_codex/073-hcp-session-close-retrospective-guard";
      }
      if (command === "git" && args.join(" ") === "rev-parse origin/dev") {
        return "abc123";
      }
      if (command === "git" && args.join(" ") === "rev-parse origin/stg") {
        return "abc123";
      }
      if (command === "git" && args.join(" ") === "rev-parse origin/main") {
        return "abc123";
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "create") {
        return "https://github.com/jkoogit/jkadh/pull/74";
      }
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.match(calls.join("\n"), /git add -- .*RET-001_.* docs\/12\.회고\/README\.md/);
  assert.match(calls.join("\n"), /git commit -m docs: add session close retrospective/);
  assert.match(calls.join("\n"), /git push origin task_codex\/073-hcp-session-close-retrospective-guard/);
  assert.match(calls.join("\n"), /gh pr create --base dev --head task_codex\/073-hcp-session-close-retrospective-guard --title \[073\]_\(001\)_HCP_세션정리_회고문서_누락방지_보강/);
  assert.match(calls.join("\n"), /Related #73/);
  assert.match(calls.join("\n"), /gh pr merge --merge --delete-branch=false/);
  assert.match(calls.join("\n"), /git push origin abc123:refs\/heads\/stg/);
  assert.match(calls.join("\n"), /git push origin abc123:refs\/heads\/main/);
  assert.equal(result.steps.at(-1)?.detail, "settled issue #73: close");
  const mergeIndex = calls.findIndex((call) => call.startsWith("gh pr merge"));
  const promoteIndex = calls.findIndex((call) => call === "git push origin abc123:refs/heads/main");
  const settlementIndex = calls.findIndex((call) => call.startsWith("gh issue close 73"));
  assert.ok(mergeIndex >= 0 && mergeIndex < promoteIndex && promoteIndex < settlementIndex);
});

test("session close execution ignores already merged session close PRs", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-merged-pr-"));
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionNumber: "010",
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true,
      paths: [],
      commitMessage: "docs: add session close retrospective",
      prTitle: "[073]_(001)_HCP_세션정리_회고문서_누락방지_보강",
      relatedIssueNumber: 73,
      baseBranch: "dev",
      mergePr: false,
      promote: false,
      targetBranches: ["stg", "main"]
    }
  }, repo, {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "session_codex/010-session-close";
      }
      if (command === "gh" && args.join(" ") === "pr view --json url,state") {
        return JSON.stringify({ url: "https://github.com/jkoogit/jkadh/pull/80", state: "MERGED" });
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "create") {
        return "https://github.com/jkoogit/jkadh/pull/81";
      }
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.match(calls.join("\n"), /gh pr view --json url,state/);
  assert.match(calls.join("\n"), /gh pr create --base dev --head session_codex\/010-session-close/);
  assert.doesNotMatch(calls.join("\n"), /gh pr edit --title/);
});

test("session close execution blocks open PR reuse without explicit approval", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-open-pr-block-"));
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionNumber: "010",
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open task PR",
    retrospective: "RET draft ready",
    hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true,
      paths: [],
      commitMessage: "docs: add session close retrospective",
      prTitle: "[073]_(001)_HCP_세션정리_회고문서_누락방지_보강",
      relatedIssueNumber: 73,
      baseBranch: "dev",
      mergePr: false,
      promote: false,
      reuseOpenPr: false,
      targetBranches: ["stg", "main"]
    }
  }, repo, {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "session_codex/010-session-close";
      }
      if (command === "gh" && args.join(" ") === "pr view --json url,state") {
        return JSON.stringify({ url: "https://github.com/jkoogit/jkadh/pull/80", state: "OPEN" });
      }
      return "";
    }
  });

  assert.equal(result.status, "blocked");
  assert.match(result.steps.at(-1)?.detail ?? "", /#세션정리\.PR재사용/);
  assert.match(calls.join("\n"), /gh pr view --json url,state/);
  assert.doesNotMatch(calls.join("\n"), /gh pr edit --title/);
  assert.doesNotMatch(calls.join("\n"), /gh pr create --base dev/);
});

test("session close execution reuses open PR only with explicit approval", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-open-pr-reuse-"));
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionNumber: "010",
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open task PR",
    retrospective: "RET draft ready",
    hcpRetrospectiveSummary: closingRetrospectiveSummary,
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true,
      paths: [],
      commitMessage: "docs: add session close retrospective",
      prTitle: "[073]_(001)_HCP_세션정리_회고문서_누락방지_보강",
      relatedIssueNumber: 73,
      baseBranch: "dev",
      mergePr: false,
      promote: false,
      reuseOpenPr: true,
      targetBranches: ["stg", "main"]
    }
  }, repo, {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "session_codex/010-session-close";
      }
      if (command === "gh" && args.join(" ") === "pr view --json url,state") {
        return JSON.stringify({ url: "https://github.com/jkoogit/jkadh/pull/80", state: "OPEN" });
      }
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.match(calls.join("\n"), /gh pr edit --title \[073\]_\(001\)_HCP_세션정리_회고문서_누락방지_보강/);
  assert.doesNotMatch(calls.join("\n"), /gh pr create --base dev/);
});

test("session close execution blocks non-compliant issue titles", () => {
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDeferredReason: "RET already written",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true,
      paths: [],
      relatedIssueNumber: 73,
      issueTitle: "HCP session close guard",
      baseBranch: "dev",
      mergePr: true,
      promote: true,
      targetBranches: ["stg", "main"]
    }
  }, "repo");

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /compliant issue-title/);
});

test("session close execution updates compliant issue titles", () => {
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness HCP session close",
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDeferredReason: "RET already written",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true,
      paths: [],
      relatedIssueNumber: 73,
      issueTitle: "[073]_[HCP]_session_close_guard",
      baseBranch: "dev",
      mergePr: true,
      promote: true,
      targetBranches: ["stg", "main"]
    }
  }, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.match(calls.join("\n"), /gh issue edit 73 --title \[073\]_\[HCP\]_session_close_guard/);
  assert.match(calls.join("\n"), /gh issue comment 73 --body Issue #73 updated/);
});

test("session close execution closes verified issues only", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-verified-issue-"));
  writeFileSync(join(repo, "retrospective.md"), [
    "Session status at snapshot: closing",
    "Session final status after successful #세션정리: complete"
  ].join("\n"));
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "retrospective.md",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [64],
    execution: {
      enabled: true
    }
  }, repo, {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.match(calls.join("\n"), /gh issue close 64 --comment HCP session close settlement: close/);
});

test("session close keeps verified issues open when retrospective close markers are missing", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-missing-marker-"));
  writeFileSync(join(repo, "retrospective.md"), "Session status at snapshot: closing\n");
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "retrospective.md",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [64],
    execution: { enabled: true }
  }, repo, {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return repo;
      }
      return "";
    }
  });

  assert.equal(result.status, "blocked");
  assert.match(result.steps.at(-1)?.detail ?? "", /retrospective close marker verification failed/);
  assert.match(result.steps.at(-1)?.detail ?? "", /Session final status after successful #세션정리: complete/);
  assert.doesNotMatch(calls.join("\n"), /gh issue close/);
  assert.doesNotMatch(calls.join("\n"), /gh issue (edit|comment)/);
  assert.doesNotMatch(calls.join("\n"), /git (add|commit|push)/);
  assert.equal(result.recovery?.sessionStatus, "active");
});

test("session close restores active state when early retrospective marker verification blocks retry", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-marker-retry-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_Harness_HCP_state",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  writeFileSync(join(repo, "retrospective.md"), "Session status at snapshot: closing\n");
  const state = beginSessionCloseState({
    sessionId: session.sessionId,
    completedTasks: ["task promote"],
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "retrospective.md",
    handoff: "Retry after correcting the retrospective",
    unresolvedDocs: [],
    verifiedIssueNumbers: [64],
    execution: { enabled: true }
  }, repo);

  assert.equal(readSessionById(repo, session.sessionId).status, "closing");
  const execution = executeSessionClose(state.executionInput, repo, {
    run(command, args) {
      if (command === "git" && args.join(" ") === "branch --show-current") return "session_codex/010-session-close";
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") return repo;
      return "";
    }
  });
  completeSessionCloseState(repo, state.sessionId, execution.status, execution.recovery);

  assert.equal(execution.status, "blocked");
  assert.equal(execution.steps.at(-1)?.action, "check_gate");
  assert.equal(readSessionById(repo, session.sessionId).status, "active");
});
