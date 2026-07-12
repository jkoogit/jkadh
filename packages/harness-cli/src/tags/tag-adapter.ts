import type { HarnessTag } from "../gates/check-gate.ts";

const tagMap = new Map<string, HarnessTag>([
  ["#세션시작", "session_start"],
  ["#태스크시작", "task_start"],
  ["#태스크정리", "task_close"],
  ["#태스크승급", "task_promote"],
  ["#세션정리", "session_close"]
]);

export function parseHarnessTag(input: string): HarnessTag | undefined {
  const [firstToken] = input.trim().split(/\s+/);
  return tagMap.get(firstToken);
}
