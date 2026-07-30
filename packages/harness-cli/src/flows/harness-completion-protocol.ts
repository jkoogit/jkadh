import type { HarnessTag } from "../gates/check-gate.ts";
import { formatCopyablePrompt } from "../reports/copyable-prompt.ts";

export type HarnessCompletionOutcome = "blocked" | "ready" | "executed";
export type HarnessCompletionTag = HarnessTag
  | "loop_analyze"
  | "loop_execute"
  | "loop_remediate"
  | "loop_approve"
  | "loop_delete"
  | "loop_restore"
  | "loop_rollback";

export interface HarnessCompletionProtocolInput {
  tag: HarnessCompletionTag;
  outcome: HarnessCompletionOutcome;
  missingItems?: string[];
  requiredReviewAvailable?: boolean;
  nextPrompt: string;
  detail?: string;
}

export interface HarnessNextPromptConstraint {
  allowedTags: string[];
  requiredFields: string[];
  reason: string;
}

export interface HarnessCompletionProtocolResult {
  status: "pass" | "blocked";
  missingHandling: "confirmed" | "required";
  missingItems: string[];
  nextTag?: string;
  constraint: HarnessNextPromptConstraint;
  violations: string[];
  nextPrompt: string;
  markdown: string;
}

const promptFields: Record<string, string[]> = {
  "#세션시작": ["세션번호", "세션명", "에이전트"],
  "#태스크시작": ["이슈|작업지시", "작업범위", "제외범위", "완료조건", "검증방법"],
  "#태스크처리": ["sessionId", "taskId", "작업내용"],
  "#태스크정리": [
    "sessionId", "taskId", "완료내용", "검증결과", "제외범위", "남은작업",
    "변경경로", "커밋메시지", "PR제목", "관련이슈"
  ],
  "#태스크승급": ["sessionId", "taskId", "대상커밋", "대상브랜치", "검증결과"],
  "#세션정리": [
    "sessionId", "완료태스크", "세션명", "이슈현행화", "남은작업", "회고", "다음세션인계",
    "커밋메시지", "PR제목", "관련이슈", "이슈제목", "종료이슈|검증종료이슈|유지이슈|인계이슈"
  ],
  "#루프분석": [
    "sessionId", "taskId", "제목", "목표", "완료조건", "정상결과", "오류케이스", "허용경로", "검증방법"
  ],
  "#루프실행": ["loopId"],
  "#루프보완": ["loopId", "완료조건|정상결과|오류케이스|허용경로|검증방법"],
  "#루프승인": ["loopId", "작업항목", "승인조건", "승인자"],
  "#루프삭제": ["loopId", "사유", "대체루프ID|제외승인"],
  "#루프복원": ["loopId"],
  "#루프롤백": ["loopId", "롤백승인경로"]
};

export function getHarnessNextPromptConstraint(
  tag: HarnessCompletionTag,
  outcome: HarnessCompletionOutcome
): HarnessNextPromptConstraint {
  if (outcome === "blocked") {
    const allowedTags: Record<HarnessCompletionTag, string[]> = {
      session_start: ["#세션시작"],
      task_start: ["#태스크시작"],
      task_process: ["#태스크처리", "#태스크시작"],
      task_close: ["#태스크정리"],
      task_promote: ["#태스크승급"],
      session_close: ["#세션정리"],
      loop_analyze: ["#루프분석"],
      loop_execute: ["#루프실행", "#루프보완", "#루프승인"],
      loop_remediate: ["#루프보완"],
      loop_approve: ["#루프승인"],
      loop_delete: ["#루프삭제"],
      loop_restore: ["#루프복원"],
      loop_rollback: ["#루프롤백"]
    };
    return buildConstraint(allowedTags[tag], "누락 또는 차단 상태에서는 현재 하네스를 건너뛰지 않고 보완·재실행한다.");
  }

  if (outcome === "ready") {
    const allowedTags: Record<HarnessCompletionTag, string[]> = {
      session_start: ["#세션시작"],
      task_start: ["#태스크시작"],
      task_process: ["#태스크처리"],
      task_close: ["#태스크정리"],
      task_promote: ["#태스크승급"],
      session_close: ["#세션정리"],
      loop_analyze: ["#루프분석"],
      loop_execute: ["#루프실행"],
      loop_remediate: ["#루프보완"],
      loop_approve: ["#루프승인"],
      loop_delete: ["#루프삭제"],
      loop_restore: ["#루프복원"],
      loop_rollback: ["#루프롤백"]
    };
    return buildConstraint(allowedTags[tag], "보고가 ready여도 실행 전 상태이면 현재 하네스의 실행 주문을 제안한다.");
  }

  const allowedTags: Record<HarnessCompletionTag, string[]> = {
    session_start: ["#태스크시작"],
    task_start: ["#태스크처리"],
    task_process: ["#태스크정리"],
    task_close: ["#태스크승급"],
    task_promote: ["#태스크처리", "#태스크시작", "#세션정리"],
    session_close: ["#세션시작"],
    loop_analyze: ["#루프실행"],
    loop_execute: ["#루프실행", "#루프보완", "#루프승인", "#태스크처리"],
    loop_remediate: ["#루프실행"],
    loop_approve: ["#루프실행"],
    loop_delete: ["#루프분석", "#태스크처리"],
    loop_restore: ["#루프실행", "#루프보완"],
    loop_rollback: ["#루프보완", "#태스크처리"]
  };
  return buildConstraint(allowedTags[tag], "실행 성공 후에는 HCP 생명주기의 바로 다음 단계만 제안한다.");
}

export function buildHarnessCompletionProtocol(
  input: HarnessCompletionProtocolInput
): HarnessCompletionProtocolResult {
  const missingItems = unique(input.missingItems ?? []);
  const missingHandling = missingItems.length === 0 ? "confirmed" : "required";
  const baseConstraint = getHarnessNextPromptConstraint(input.tag, input.outcome);
  const nextPrompt = sanitizePrompt(input.nextPrompt);
  const nextTag = extractNextTag(nextPrompt);
  const constraint = {
    ...baseConstraint,
    requiredFields: nextTag ? promptFields[nextTag] ?? [] : []
  };
  const violations: string[] = [];

  if (input.requiredReviewAvailable === false) {
    violations.push("required Harness scope review unavailable");
  }
  if (input.outcome === "executed" && missingItems.length > 0) {
    violations.push(`executed outcome retains missing items: ${missingItems.join(", ")}`);
  }
  if (!nextTag) {
    violations.push("next prompt tag missing");
  } else if (!constraint.allowedTags.includes(nextTag)) {
    violations.push(`next tag ${nextTag} is not allowed; expected ${constraint.allowedTags.join(" or ")}`);
  }
  for (const field of constraint.requiredFields) {
    const states = field.split("|").map((candidate) => promptFieldState(nextPrompt, candidate));
    if (!states.includes("valid")) {
      violations.push(states.includes("invalid")
        ? `required prompt field invalid: ${field}`
        : `required prompt field missing: ${field}`);
    }
  }

  const status = violations.length === 0 ? "pass" : "blocked";
  const markdown = [
    "## Harness Completion Protocol",
    "",
    `- harness: ${input.tag}`,
    `- outcome: ${input.outcome}`,
    `- missing handling: ${missingHandling}`,
    `- missing items: ${missingItems.join("; ") || "none"}`,
    `- allowed next tags: ${constraint.allowedTags.join(", ")}`,
    `- required prompt fields: ${constraint.requiredFields.join(", ") || "none"}`,
    `- constraint validation: ${status}`,
    ...(input.detail ? [`- detail: ${normalizeLine(input.detail)}`] : []),
    ...(violations.length > 0 ? violations.map((violation) => `- violation: ${violation}`) : []),
    "",
    "## Copy-ready next prompt",
    "",
    status === "pass"
      ? formatCopyablePrompt(nextPrompt)
      : "Next prompt suppressed until the protocol constraint violations are resolved."
  ].join("\n") + "\n";

  return {
    status,
    missingHandling,
    missingItems,
    nextTag,
    constraint,
    violations,
    nextPrompt,
    markdown
  };
}

function buildConstraint(allowedTags: string[], reason: string): HarnessNextPromptConstraint {
  return {
    allowedTags,
    requiredFields: allowedTags.length === 1 ? promptFields[allowedTags[0] ?? ""] ?? [] : [],
    reason
  };
}

function extractNextTag(prompt: string): string | undefined {
  return prompt.match(/^\s*(#(?:세션시작|태스크시작|태스크처리|태스크정리|태스크승급|세션정리|루프분석|루프실행|루프보완|루프승인|루프삭제|루프복원|루프롤백))(?=\s|\{|$)/m)?.[1];
}

function promptFieldState(prompt: string, field: string): "missing" | "invalid" | "valid" {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const values = [...prompt.matchAll(new RegExp(`^\\s*${escaped}\\s*[:=]\\s*(.*)$`, "gim"))]
    .map((match) => match[1]?.trim() ?? "");
  if (values.length === 0) return "missing";
  return values.some((value) => isValidPromptFieldValue(field, value)) ? "valid" : "invalid";
}

function isValidPromptFieldValue(field: string, value: string): boolean {
  if (!value || /확인\s*필요|선택\s*필요|미정|\b(?:todo|tbd)\b/i.test(value)) return false;
  const normalizedField = field.replace(/\s+/g, "").toLowerCase();
  if (normalizedField === "제외승인") return value.toLowerCase() === "true";
  if (["관련이슈", "종료이슈", "검증종료이슈", "이슈"].includes(normalizedField)) {
    return /^#?\d+$/.test(value);
  }
  if (["유지이슈", "인계이슈"].includes(normalizedField)) {
    const [issue, reason, followUp] = value.split("|").map((item) => item.trim());
    return /^#?\d+$/.test(issue ?? "")
      && Boolean(reason && followUp)
      && !/확인\s*필요|선택\s*필요|미정|\b(?:todo|tbd)\b/i.test(`${reason} ${followUp}`);
  }
  if (normalizedField === "대상커밋") return /^[0-9a-f]{7,40}$/i.test(value);
  if (normalizedField === "세션번호") return /^\d{1,3}$/.test(value);
  if (["변경경로", "롤백승인경로"].includes(normalizedField)) return value !== "없음";
  return true;
}

function sanitizePrompt(prompt: string): string {
  return prompt.replace(/```(?:text)?/gi, "").trim();
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
