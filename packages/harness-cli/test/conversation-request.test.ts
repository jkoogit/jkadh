import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildConversationRequestGate } from "../src/flows/conversation-request.ts";
import { addHcpTask, createHcpSession, readSessionById } from "../src/state/session-state.ts";

const cliPath = join(import.meta.dirname, "..", "src", "cli.ts");

test("natural out-of-scope request requires Backlog confirmation without execution", () => {
  const result = buildConversationRequestGate({
    sessionId: "codex_ses_024", taskId: "codex_task_024_002",
    request: "PDFowers 배포도 같이 진행해줘", taskScope: "Harness conversation gate",
    taskOutOfScope: "PDFowers 소스, 이메일 인증, 배포", requestKind: "natural"
  });
  assert.equal(result.status, "backlog_confirmation_required");
  assert.equal(result.executeAllowed, false);
  assert.deepEqual(result.matchedOutOfScopeTerms.sort(), ["PDFowers", "배포"].sort());
  assert.match(result.markdown, /## Copy-ready next prompt\n\n```text\n#백로그추가\{/);
});

test("natural in-scope request remains report-only and returns a copy-ready task tag", () => {
  const result = buildConversationRequestGate({
    sessionId: "codex_ses_024", taskId: "codex_task_024_002", request: "CLI 게이트 테스트를 추가해줘",
    taskScope: "CLI 게이트 테스트", taskOutOfScope: "배포", requestKind: "natural", scopeDecision: "in_scope"
  });
  assert.equal(result.status, "natural_report_only");
  assert.equal(result.executeAllowed, false);
  assert.match(result.markdown, /```text\n#태스크처리\{/);
});

test("recognized tagged request can continue to its execution gate", () => {
  const result = buildConversationRequestGate({
    sessionId: "codex_ses_024", taskId: "codex_task_024_002", request: "#태스크처리{ 작업내용: test }",
    taskScope: "test", taskOutOfScope: "배포", requestKind: "tagged", scopeDecision: "in_scope"
  });
  assert.equal(result.status, "tagged_execute_allowed");
  assert.equal(result.executeAllowed, true);
});

test("CLI request check does not register Backlog until the approved add command runs", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-conversation-request-cli-"));
  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  const session = createHcpSession(repo, { sessionNumber: "24", sessionName: "request gate" });
  const task = addHcpTask(repo, {
    sessionId: session.sessionId, taskName: "request gate", issueNumber: 167, branchName: "task_codex/167-request-gate",
    scope: "conversation request gate", outOfScope: "PDFowers 소스, 이메일 인증, 배포",
    completionCriteria: "confirmation required", verificationMethod: "npm test"
  });

  const report = execFileSync(process.execPath, [
    "--experimental-strip-types", cliPath, "hcp", "request", "check",
    "--session-id", session.sessionId, "--task-id", task.taskId,
    "--request", "배포 작업도 진행해줘", "--scope-decision", "out_of_scope"
  ], { cwd: repo, encoding: "utf8" });
  assert.match(report, /backlog_confirmation_required/);
  assert.match(report, /```text\n#백로그추가\{/);
  assert.equal(readSessionById(repo, session.sessionId).backlogItems.length, 0);

  const approvedAlias = [
    "#백로그추가{", `sessionId: ${session.sessionId}`, "title: 배포 작업", "note: 사용자 승인", "}"
  ].join("\n");
  execFileSync(process.execPath, ["--experimental-strip-types", cliPath, "tag", approvedAlias], { cwd: repo, encoding: "utf8" });
  assert.equal(readSessionById(repo, session.sessionId).backlogItems.length, 1);
});
