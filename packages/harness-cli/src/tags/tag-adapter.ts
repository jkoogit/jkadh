import type { HarnessTag } from "../gates/check-gate.ts";

export type HarnessTagMode = "execute" | "report" | "merge" | "reuse";

export interface ParsedHarnessTag {
  tag: HarnessTag;
  mode: HarnessTagMode;
}

export interface HarnessTagExecutionOrder {
  tag: HarnessTag;
  mode: HarnessTagMode;
  intent: string;
  steps: string[];
  sharedBranchWrite?: string;
  approvalEquivalence?: string;
  approvalJustification?: string;
}

const tagMap = new Map<string, HarnessTag>([
  ["#세션시작", "session_start"],
  ["#태스크시작", "task_start"],
  ["#태스크처리", "task_process"],
  ["#태스크정리", "task_close"],
  ["#태스크승급", "task_promote"],
  ["#세션정리", "session_close"]
]);

export function parseHarnessTag(input: string): HarnessTag | undefined {
  return parseHarnessTagCommand(input)?.tag;
}

export function parseHarnessTagCommand(input: string): ParsedHarnessTag | undefined {
  const [firstToken] = input.trim().split(/\s+/);
  const reportSuffix = ".보고";
  const mergeSuffix = ".PR머지";
  const reuseSuffix = ".PR재사용";
  const tagToken = firstToken.replace(/\{[\s\S]*$/, "");
  const mode: HarnessTagMode = tagToken.endsWith(reportSuffix)
    ? "report"
    : tagToken.endsWith(mergeSuffix)
      ? "merge"
      : tagToken.endsWith(reuseSuffix)
        ? "reuse"
        : "execute";
  const normalizedToken = mode === "report"
    ? tagToken.slice(0, -reportSuffix.length)
    : mode === "merge"
      ? tagToken.slice(0, -mergeSuffix.length)
      : mode === "reuse"
        ? tagToken.slice(0, -reuseSuffix.length)
        : tagToken;
  const tag = tagMap.get(normalizedToken);
  if (mode === "merge" && tag !== "task_close") {
    return undefined;
  }
  if (mode === "reuse" && tag !== "session_close") {
    return undefined;
  }
  return tag ? { tag, mode } : undefined;
}

export function buildHarnessTagExecutionOrder(parsed: ParsedHarnessTag): HarnessTagExecutionOrder {
  if (parsed.tag === "task_process") {
    return withCompletionProtocol({
      tag: parsed.tag,
      mode: parsed.mode,
      intent: parsed.mode === "report" ? "task_process_report" : "task_process_execute",
      steps: ["check_active_session", "check_active_task", "check_registered_branch", "check_task_scope"]
    });
  }

  if (parsed.tag === "task_close" && (parsed.mode === "execute" || parsed.mode === "merge")) {
    const explicitMerge = parsed.mode === "merge";
    return withCompletionProtocol({
      tag: parsed.tag,
      mode: parsed.mode,
      intent: "task_close_execute",
      steps: ["commit_changes", "push_branch", "create_pr", "merge_pr_to_dev"],
      sharedBranchWrite: "dev",
      approvalEquivalence: explicitMerge
        ? "#태스크정리.PR머지 입력은 PR 생성과 dev merge 포함을 명시 승인한다."
        : "#태스크정리 단독 입력은 PR 생성과 dev merge 포함 승인과 동등하다.",
      approvalJustification: explicitMerge
        ? "사용자가 #태스크정리.PR머지로 dev merge를 명시 승인했으므로 commit, push, PR 생성, merge_pr_to_dev까지 실행한다."
        : "사용자의 #태스크정리 표준 의미는 commit, push, PR 생성, dev merge를 포함하므로 merge_pr_to_dev까지 실행한다."
    });
  }

  if (parsed.tag === "task_close" && parsed.mode === "report") {
    return withCompletionProtocol({
      tag: parsed.tag,
      mode: parsed.mode,
      intent: "task_close_report",
      steps: ["read_status", "create_report"]
    });
  }

  if (parsed.tag === "session_close" && parsed.mode === "reuse") {
    return withCompletionProtocol({
      tag: parsed.tag,
      mode: parsed.mode,
      intent: "session_close_reuse_open_pr_execute",
      steps: ["write_retrospective", "update_issue", "commit_changes", "push_branch", "reuse_open_pr", "merge_pr", "promote_branch", "close_issue"],
      sharedBranchWrite: "dev",
      approvalEquivalence: "#세션정리.PR재사용 입력은 현재 브랜치에 열린 세션정리 PR 갱신과 후속 merge/promote 진행을 명시 승인한다.",
      approvalJustification: "사용자가 #세션정리.PR재사용으로 열린 세션정리 PR 재사용을 명시 승인했으므로 기존 PR 갱신 후 merge/promote를 계속 진행한다."
    });
  }

  return withCompletionProtocol({
    tag: parsed.tag,
    mode: parsed.mode,
    intent: `${parsed.tag}_${parsed.mode}`,
    steps: []
  });
}

function withCompletionProtocol(order: HarnessTagExecutionOrder): HarnessTagExecutionOrder {
  return {
    ...order,
    steps: [
      ...order.steps,
      "confirm_missing_handling",
      "validate_next_prompt_constraints",
      "suggest_copy_ready_next_prompt"
    ]
  };
}

export function formatHarnessTagExecutionOrder(order: HarnessTagExecutionOrder): string {
  return [
    "# HCP normalized execution order",
    "",
    `- tag: ${order.tag}`,
    `- mode: ${order.mode}`,
    `- intent: ${order.intent}`,
    `- steps: ${order.steps.length > 0 ? order.steps.join(" -> ") : "none"}`,
    ...(order.sharedBranchWrite ? [`- shared branch write: ${order.sharedBranchWrite}`] : []),
    ...(order.approvalEquivalence ? [`- approval equivalence: ${order.approvalEquivalence}`] : []),
    ...(order.approvalJustification ? [`- approval justification: ${order.approvalJustification}`] : [])
  ].join("\n") + "\n";
}

export function expandHarnessTagBlockArgs(tag: HarnessTag, args: string[]): string[] {
  if (!args[0]?.includes("{")) return args;
  const block = args[0];
  const optionMap: Record<HarnessTag, Record<string, string>> = {
    session_start: {
      세션번호: "--session-number", 세션명: "--session-name", 에이전트: "--agent-id",
      sessionnumber: "--session-number", sessionname: "--session-name", agentid: "--agent-id"
    },
    task_start: {
      sessionid: "--session-id", 이슈: "--issue", 작업지시: "--work-order", 작업범위: "--scope",
      제외범위: "--out-of-scope", 완료조건: "--completion", 검증방법: "--verification"
    },
    task_process: {
      sessionid: "--session-id", taskid: "--task-id", 작업내용: "--scope"
    },
    task_close: {
      sessionid: "--session-id", taskid: "--task-id", 완료내용: "--completion",
      검증결과: "--verification", 제외범위: "--out-of-scope", 남은작업: "--remaining",
      변경경로: "--paths", 커밋메시지: "--message", pr제목: "--pr-title", 관련이슈: "--related-issue"
    },
    task_promote: {
      sessionid: "--session-id", taskid: "--task-id", 대상커밋: "--target-commit",
      대상브랜치: "--target-branches", 검증결과: "--verification"
    },
    session_close: {
      sessionid: "--session-id", 세션번호: "--session-number", 세션명: "--session-name",
      완료태스크: "--completed-tasks", 이슈현행화: "--issue-update", 남은작업: "--remaining",
      회고: "--retrospective", 다음세션인계: "--handoff", 커밋메시지: "--message",
      pr제목: "--pr-title", 관련이슈: "--related-issue", 이슈제목: "--issue-title"
    }
  };
  const parsed: string[] = [];
  const closingIndex = block.lastIndexOf("}");
  const body = block.slice(block.indexOf("{") + 1, closingIndex >= 0 ? closingIndex : undefined);
  for (const rawLine of body.split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([^:=]+)\s*[:=]\s*(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/\s+/g, "").toLowerCase();
    const value = match[2].trim();
    const option = optionMap[tag][key];
    if (option && value) parsed.push(option, value);
  }
  return [...parsed, ...args.slice(1)];
}
