import { formatCopyablePrompt } from "../reports/copyable-prompt.ts";

export type ConversationRequestKind = "natural" | "tagged";
export type ConversationScopeDecision = "in_scope" | "out_of_scope" | "unknown";

export interface ConversationRequestInput {
  sessionId: string;
  taskId: string;
  request: string;
  taskScope: string;
  taskOutOfScope: string;
  requestKind?: ConversationRequestKind;
  scopeDecision?: ConversationScopeDecision;
  backlogTitle?: string;
}

export interface ConversationRequestGateResult {
  status: "tagged_execute_allowed" | "natural_report_only" | "scope_review_required" | "backlog_confirmation_required";
  executeAllowed: boolean;
  scopeDecision: ConversationScopeDecision;
  matchedOutOfScopeTerms: string[];
  markdown: string;
  nextPrompt?: string;
}

export function buildConversationRequestGate(input: ConversationRequestInput): ConversationRequestGateResult {
  const requestKind = input.requestKind ?? "natural";
  const matchedOutOfScopeTerms = matchOutOfScopeTerms(input.request, input.taskOutOfScope);
  const scopeDecision = input.scopeDecision && input.scopeDecision !== "unknown"
    ? input.scopeDecision
    : matchedOutOfScopeTerms.length > 0 ? "out_of_scope" : "unknown";

  if (requestKind === "tagged") {
    return buildResult("tagged_execute_allowed", true, scopeDecision, matchedOutOfScopeTerms,
      "recognized HCP tag/alias; continue through the corresponding execution gate");
  }
  if (scopeDecision === "out_of_scope") {
    const title = input.backlogTitle?.trim() || summarizeRequest(input.request);
    const request = normalizePromptValue(input.request);
    const nextPrompt = [
      "#백로그추가{",
      `sessionId: ${input.sessionId}`,
      `title: ${title}`,
      `note: 현재 태스크 ${input.taskId} 범위 외 요청: ${request}`,
      "}"
    ].join("\n");
    return buildResult("backlog_confirmation_required", false, scopeDecision, matchedOutOfScopeTerms,
      "do not execute the natural-language request; ask whether to register it in the session Backlog", nextPrompt);
  }
  if (scopeDecision === "in_scope") {
    const request = normalizePromptValue(input.request);
    const nextPrompt = [
      "#태스크처리{",
      `sessionId: ${input.sessionId}`,
      `taskId: ${input.taskId}`,
      `작업내용: ${request}`,
      "}"
    ].join("\n");
    return buildResult("natural_report_only", false, scopeDecision, matchedOutOfScopeTerms,
      "natural-language requests remain report-only; use the HCP task-process tag to execute", nextPrompt);
  }
  return buildResult("scope_review_required", false, "unknown", matchedOutOfScopeTerms,
    "natural-language request scope is not proven; compare it with the active task boundary before execution");
}

function buildResult(
  status: ConversationRequestGateResult["status"], executeAllowed: boolean,
  scopeDecision: ConversationScopeDecision, matchedOutOfScopeTerms: string[], detail: string, nextPrompt?: string
): ConversationRequestGateResult {
  const markdown = [
    "# HCP conversation request gate", "",
    `- status: ${status}`,
    `- execution: ${executeAllowed ? "allowed by tagged request" : "blocked"}`,
    `- scope decision: ${scopeDecision}`,
    `- matched out-of-scope terms: ${matchedOutOfScopeTerms.length > 0 ? matchedOutOfScopeTerms.join(", ") : "none"}`,
    `- detail: ${detail}`,
    ...(nextPrompt ? ["", "## Copy-ready next prompt", "", formatCopyablePrompt(nextPrompt)] : [])
  ].join("\n") + "\n";
  return { status, executeAllowed, scopeDecision, matchedOutOfScopeTerms, markdown, nextPrompt };
}

function matchOutOfScopeTerms(request: string, taskOutOfScope: string): string[] {
  const normalizedRequest = request.toLocaleLowerCase();
  const ignored = new Set(["구현", "수정", "작업", "소스", "제외", "범위", "소급"]);
  const terms = taskOutOfScope.split(/[,;、]/).flatMap((part) => part.trim().split(/\s+/))
    .map((term) => term.replace(/[^\p{L}\p{N}._-]/gu, ""))
    .filter((term) => term.length >= 2 && !ignored.has(term));
  return [...new Set(terms.filter((term) => normalizedRequest.includes(term.toLocaleLowerCase())))];
}

function summarizeRequest(request: string): string {
  const normalized = normalizePromptValue(request);
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77)}...`;
}

function normalizePromptValue(value: string): string {
  return value.trim().replace(/```/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ");
}
