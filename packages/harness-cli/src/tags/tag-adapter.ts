import type { HarnessTag } from "../gates/check-gate.ts";

export type HarnessTagMode = "execute" | "report";

export interface ParsedHarnessTag {
  tag: HarnessTag;
  mode: HarnessTagMode;
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
  const mode: HarnessTagMode = firstToken.endsWith(reportSuffix) ? "report" : "execute";
  const normalizedToken = mode === "report" ? firstToken.slice(0, -reportSuffix.length) : firstToken;
  const tag = tagMap.get(normalizedToken);
  return tag ? { tag, mode } : undefined;
}
