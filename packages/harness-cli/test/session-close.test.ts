import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildSessionCloseReport, enrichSessionCloseInputWithAutoStatus, enrichSessionCloseInputWithHcpState, executeSessionClose, parseSessionCloseArgs } from "../src/flows/session-close.ts";
import { addHcpTask, createHcpSession, transitionHcpSessionStatus, updateHcpTask } from "../src/state/session-state.ts";

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
  assert.match(report.markdown, /## Issue Management Comment/);
  assert.match(report.markdown, /decision: close verified issue candidate/);
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
  assert.deepEqual(input.verifiedIssueNumbers, [73]);
  assert.equal(report.status, "ready");
});

test("session close hcp state can refresh summary after session moves to closing", () => {
  const repo = mkdtempSync(join(tmpdir(), "harness-session-close-closing-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_Harness_HCP_state",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  transitionHcpSessionStatus(repo, session.sessionId, "closing", new Date("2026-07-13T01:05:00.000Z"));

  const input = enrichSessionCloseInputWithHcpState({
    sessionId: session.sessionId,
    completedTasks: ["task promote"],
    issueUpdate: "Issue #73 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.회고/RET-009_2026-07-13_HCP_세션정리_회고.md",
    handoff: "Next session starts from generated RET",
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  }, repo);

  assert.match(input.hcpRetrospectiveSummary ?? "", /Session status: closing/);
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

test("session close execution blocks without verified issue candidates", () => {
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDeferredReason: "RET-009 will be added in a follow-up correction task",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true
    }
  }, "repo");

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /no verified issue close candidate/);
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
  assert.match(result.steps[2].detail, /missing execution options: message; pr-title; related-issue/);
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

  assert.equal(result.status, "blocked");
  assert.match(calls.join("\n"), /git add -- .*RET-001_.* docs\/12\.회고\/README\.md/);
  assert.match(calls.join("\n"), /git commit -m docs: add session close retrospective/);
  assert.match(calls.join("\n"), /git push origin task_codex\/073-hcp-session-close-retrospective-guard/);
  assert.match(calls.join("\n"), /gh pr create --base dev --head task_codex\/073-hcp-session-close-retrospective-guard --title \[073\]_\(001\)_HCP_세션정리_회고문서_누락방지_보강/);
  assert.match(calls.join("\n"), /Related #73/);
  assert.match(calls.join("\n"), /gh pr merge --merge --delete-branch=false/);
  assert.match(calls.join("\n"), /git push origin abc123:refs\/heads\/stg/);
  assert.match(calls.join("\n"), /git push origin abc123:refs\/heads\/main/);
  assert.equal(result.steps.at(-1)?.detail, "no verified issue close candidate");
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

  assert.equal(result.status, "blocked");
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

  assert.equal(result.status, "blocked");
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

  assert.equal(result.status, "blocked");
  assert.equal(calls[0], "gh issue edit 73 --title [073]_[HCP]_session_close_guard");
  assert.equal(calls[1], "gh issue comment 73 --body Issue #73 updated");
});

test("session close execution closes verified issues only", () => {
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    retrospectiveDocument: "docs/12.?뚭퀬/RET-009_2026-07-13_HCP_?몄뀡?뺣━_?뚭퀬.md",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [64],
    execution: {
      enabled: true
    }
  }, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.equal(calls[0], "gh issue close 64 --comment Closed by verified #세션정리.");
});
