import type { HarnessTag } from "../gates/check-gate.ts";

export type HarnessTagMode = "execute" | "report" | "merge";

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
  const tagToken = firstToken.replace(/\{[\s\S]*$/, "");
  const mode: HarnessTagMode = tagToken.endsWith(reportSuffix)
    ? "report"
    : tagToken.endsWith(mergeSuffix)
      ? "merge"
      : "execute";
  const normalizedToken = mode === "report"
    ? tagToken.slice(0, -reportSuffix.length)
    : mode === "merge"
      ? tagToken.slice(0, -mergeSuffix.length)
      : tagToken;
  const tag = tagMap.get(normalizedToken);
  return tag ? { tag, mode } : undefined;
}

export function buildHarnessTagExecutionOrder(parsed: ParsedHarnessTag): HarnessTagExecutionOrder {
  if (parsed.tag === "task_close" && (parsed.mode === "execute" || parsed.mode === "merge")) {
    const explicitMerge = parsed.mode === "merge";
    return {
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
    };
  }

  if (parsed.tag === "task_close" && parsed.mode === "report") {
    return {
      tag: parsed.tag,
      mode: parsed.mode,
      intent: "task_close_report",
      steps: ["read_status", "create_report"]
    };
  }

  return {
    tag: parsed.tag,
    mode: parsed.mode,
    intent: `${parsed.tag}_${parsed.mode}`,
    steps: []
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
