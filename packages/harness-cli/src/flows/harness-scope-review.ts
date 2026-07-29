import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseBacklogIndex, type BacklogIndexEntry } from "../docs/backlog-index.ts";
import { listLoopRuns, type HcpLoopRun } from "../state/loop-state.ts";
import { readSessionById, type HcpSessionState } from "../state/session-state.ts";
import { getHarnessScopeNode, type HarnessScopeNodeId } from "./harness-scope-graph.ts";

export type HarnessReviewTrigger = Extract<
  HarnessScopeNodeId,
  "task_promote" | "loop_approve" | "loop_delete" | "loop_restore" | "loop_rollback" | "session_close"
>;

export interface HarnessScopeReview {
  trigger: HarnessReviewTrigger;
  sessionId: string;
  reviewRequired: boolean;
  missingWorkCheckRequired: boolean;
  globalBacklog: BacklogIndexEntry[];
  session: HcpSessionState;
  loops: HcpLoopRun[];
  missingWorkItems: string[];
  markdown: string;
}

export function buildHarnessScopeReview(
  repoRoot: string,
  sessionId: string,
  trigger: HarnessReviewTrigger
): HarnessScopeReview {
  const node = getHarnessScopeNode(trigger);
  const session = readSessionById(repoRoot, sessionId);
  const loops = listLoopRuns(repoRoot, undefined, true).filter((loop) => loop.sessionId === sessionId);
  const globalBacklog = readGlobalBacklog(repoRoot);
  const missingWorkItems = node.missingWorkCheckRequired ? collectMissingWorkItems(session, loops) : [];
  const review = {
    trigger,
    sessionId,
    reviewRequired: node.reviewRequired,
    missingWorkCheckRequired: node.missingWorkCheckRequired,
    globalBacklog,
    session,
    loops,
    missingWorkItems
  };
  return { ...review, markdown: buildHarnessScopeReviewMarkdown(review) };
}

export function buildHarnessScopeReviewMarkdown(review: Omit<HarnessScopeReview, "markdown">): string {
  const statusCounts = countBy(review.globalBacklog.map((item) => item.status));
  const missingStatus = review.missingWorkCheckRequired
    ? review.missingWorkItems.length === 0 ? "clear" : "items_found"
    : "not_required";
  return [
    "## Harness Scope Review",
    "",
    `- trigger: ${review.trigger}`,
    `- review required: ${review.reviewRequired ? "yes" : "no"}`,
    `- missing-work check required: ${review.missingWorkCheckRequired ? "yes" : "no"}`,
    "",
    "### Global Document Backlog",
    "",
    `- total: ${review.globalBacklog.length}`,
    `- status summary: ${formatCounts(statusCounts)}`,
    ...formatItems(review.globalBacklog.map((item) => `${item.id} [${item.status}] ${item.title}; timing=${item.timing}; priority=${item.priority}`)),
    "",
    "### HCP Session Work Status",
    "",
    `- session: ${review.session.sessionId} [${review.session.status}] ${review.session.sessionName}`,
    `- tasks: ${summarize(review.session.tasks.map((task) => `${task.taskId}=${task.status} (${normalize(task.taskName)})`))}`,
    `- Work Items: ${summarize((review.session.workItems ?? []).map((item) => `${item.displayId}=${item.status} (${normalize(item.title)})`))}`,
    `- session Backlog: ${summarize(review.session.backlogItems.map((item) => `${item.hcpBacklogId}=${item.status} (${normalize(item.title)})`))}`,
    `- Loops: ${summarize(review.loops.map((loop) => `${loop.loopId}=${loop.status} (${normalize(loop.title)})`))}`,
    "",
    "### Missing Work Check",
    "",
    `- status: ${missingStatus}`,
    ...formatItems(review.missingWorkItems)
  ].join("\n") + "\n";
}

function readGlobalBacklog(repoRoot: string): BacklogIndexEntry[] {
  const indexPath = join(repoRoot, "docs", "15.로그", "backlog", "README.md");
  return existsSync(indexPath) ? parseBacklogIndex(readFileSync(indexPath, "utf8")) : [];
}

function collectMissingWorkItems(session: HcpSessionState, loops: HcpLoopRun[]): string[] {
  const missing: string[] = [];
  for (const task of session.tasks.filter((item) => item.status !== "promoted")) {
    missing.push(`task ${task.taskId}=${task.status}: ${normalize(task.taskName)}`);
  }
  for (const item of (session.workItems ?? []).filter((candidate) =>
    !["done", "cancelled", "backlogged", "deferred"].includes(candidate.status))) {
    missing.push(`Work Item ${item.displayId}=${item.status}: ${normalize(item.title)}`);
  }
  for (const item of session.backlogItems.filter((candidate) => candidate.status === "open")) {
    missing.push(`session Backlog ${item.hcpBacklogId}=open: ${normalize(item.title)}`);
  }
  for (const loop of loops) {
    const dispositionComplete = loop.status === "deleted"
      && Boolean(loop.deletion?.replacementLoopId || loop.deletion?.exclusionApproved);
    if (dispositionComplete) continue;
    for (const item of loop.workItems.filter((candidate) => !["completed", "skipped"].includes(candidate.status))) {
      missing.push(`Loop ${loop.loopId}/${item.id}=${item.status}: ${normalize(item.title)}`);
    }
  }
  return [...new Set(missing)];
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  return entries.length > 0 ? entries.map(([status, count]) => `${status}=${count}`).join(", ") : "none";
}

function summarize(items: string[]): string {
  return items.length > 0 ? items.join("; ") : "none";
}

function formatItems(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- none"];
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
