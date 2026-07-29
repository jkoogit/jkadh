export type HarnessScopeNodeId =
  | "session_start"
  | "session_close"
  | "task_start"
  | "task_close"
  | "task_promote"
  | "task_process"
  | "loop_analyze"
  | "loop_execute"
  | "loop_remediate"
  | "loop_approve"
  | "loop_delete"
  | "loop_restore"
  | "loop_rollback";

export interface HarnessScopeNode {
  id: HarnessScopeNodeId;
  label: string;
  displayOrder: string;
  parentIds: HarnessScopeNodeId[];
  reviewRequired: boolean;
  missingWorkCheckRequired: boolean;
}

const nodes: HarnessScopeNode[] = [
  node("session_start", "세션시작", "1.1"),
  node("session_close", "세션정리", "1.2", [], true, true),
  node("task_start", "태스크시작", "2.1", ["session_start"]),
  node("task_close", "태스크정리", "2.2", ["session_start"]),
  node("task_promote", "태스크승급", "2.3", ["session_start"], true, true),
  node("task_process", "태스크처리", "3", ["task_start"]),
  node("loop_analyze", "루프분석", "4.1", ["task_process"]),
  node("loop_execute", "루프실행", "4.2", ["task_process"]),
  node("loop_remediate", "루프보완", "4.3", ["task_process"]),
  node("loop_approve", "루프승인", "5.1", ["loop_analyze", "loop_execute", "loop_remediate"], true, false),
  node("loop_delete", "루프삭제", "5.2", ["loop_analyze", "loop_execute", "loop_remediate"], true, true),
  node("loop_restore", "루프복원", "5.3", ["loop_analyze", "loop_execute", "loop_remediate"], true, true),
  node("loop_rollback", "루프롤백", "5.4", ["loop_analyze", "loop_execute", "loop_remediate"], true, true)
];

export function listHarnessScopeNodes(): HarnessScopeNode[] {
  return nodes.map((item) => ({ ...item }));
}

export function getHarnessScopeNode(id: HarnessScopeNodeId): HarnessScopeNode {
  const found = nodes.find((item) => item.id === id);
  if (!found) throw new Error(`Harness scope node not found: ${id}`);
  return { ...found };
}

export function buildHarnessScopeGraphMarkdown(): string {
  return [
    "## Harness Scope Graph",
    "",
    ...nodes.map((item) => {
      const depth = scopeDepth(item);
      return `${"  ".repeat(depth)}- ${item.displayOrder} ${item.label} (${item.id})`;
    })
  ].join("\n") + "\n";
}

function node(
  id: HarnessScopeNodeId,
  label: string,
  displayOrder: string,
  parentIds: HarnessScopeNodeId[] = [],
  reviewRequired = false,
  missingWorkCheckRequired = false
): HarnessScopeNode {
  return { id, label, displayOrder, parentIds, reviewRequired, missingWorkCheckRequired };
}

function scopeDepth(item: HarnessScopeNode): number {
  return Math.max(0, Number(item.displayOrder.split(".")[0]) - 1);
}
