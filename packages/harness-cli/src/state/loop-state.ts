import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type LoopStatus = "draft" | "analysis_ready" | "running" | "paused" | "blocked" | "completed" | "failed" | "cancelled" | "deleted";
export type LoopWorkItemStatus = "pending" | "ready" | "implementation_pending" | "implementing" | "implementation_complete" | "verifying" | "completed" | "paused" | "blocked" | "failed" | "skipped";
export type LoopResultType = "completed_changed" | "completed_no_change" | "completed_with_approved_exception" | "skipped_not_applicable" | "blocked_user_input" | "blocked_external_dependency" | "failed_verification";
export type CompletionCondition = string | { type: "command_passed" | "file_exists" | "file_changed" | "file_unchanged" | "path_scope_clean" | "manual_approval"; value?: string; required?: boolean; approved?: boolean };
export interface LoopRetryPolicy { maxAttempts: number; retryableErrors: string[]; requireAnalysisRevisionAfterFailure?: boolean; }

export interface LoopWorkItemDefinition {
  id: string;
  title: string;
  dependencies: string[];
  completionConditions: CompletionCondition[];
  expectedResults: LoopResultType[] | string[];
  errorCases: string[];
  allowedPaths: string[];
  verificationCommands: string[];
  retryPolicy?: LoopRetryPolicy;
  remoteCapabilities?: Array<{ capability: string; mode: "read" | "execute" | "write"; environment: "test" | "dev" | "stg"; requiresApproval: boolean }>;
}

export interface LoopCheckpoint {
  checkpointId: string;
  phase: "before" | "after_implementation" | "after_verification" | "rollback_before" | "rollback_after";
  branchName: string;
  baseCommit: string;
  changedFiles: string[];
  fileDigests: Record<string, string>;
  diffDigest: string;
  createdAt: string;
}

export interface HcpLoopRun {
  schemaVersion: 1;
  loopId: string;
  sessionId: string;
  taskId: string;
  title: string;
  objective: string;
  analysisVersion: number;
  required: boolean;
  analysisHistory?: Array<{ version: number; changedFields: string[]; invalidatedWorkItemIds: string[]; changedAt: string }>;
  status: LoopStatus;
  workItems: Array<LoopWorkItemDefinition & { status: LoopWorkItemStatus; attempt: number; resultType?: LoopResultType; lastError?: string; verificationEvidence?: VerificationEvidence[]; implementationEvidence?: WorkItemImplementationEvidence }>;
  checkpoints: LoopCheckpoint[];
  approvals?: Array<{ workItemId: string; conditionValue: string; approvedBy: string; approvedAt: string }>;
  deletion?: { deletedAt: string; reason: string; previousStatus: LoopStatus; replacementLoopId?: string; exclusionApproved?: boolean };
  lease?: { owner: string; acquiredAt: string; expiresAt: string };
  createdAt: string;
  updatedAt: string;
}
export interface VerificationEvidence { command: string; exitCode: number; status: "passed" | "failed"; startedAt: string; completedAt: string; commit: string; diffDigest: string; }
export interface WorkItemImplementationEvidence { summary: string; changedFiles: string[]; checkpointBefore: LoopCheckpoint; checkpointAfter: LoopCheckpoint; completedAt: string; }
export interface RollbackPlan { ready: boolean; detail: string; removableFiles: string[]; blockedFiles: string[]; checkpoint?: LoopCheckpoint; }

const activeStatuses = new Set<LoopStatus>(["draft", "analysis_ready", "running", "paused", "blocked", "failed"]);

export function validateWorkItems(items: LoopWorkItemDefinition[]): string[] {
  const errors: string[] = [];
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) errors.push("duplicate work item id");
  for (const item of items) {
    if (!item.completionConditions.length) errors.push(`${item.id}: completion condition missing`);
    if (!item.expectedResults.length) errors.push(`${item.id}: expected result missing`);
    if (!item.errorCases.length) errors.push(`${item.id}: error case missing`);
    if ((item.retryPolicy?.maxAttempts ?? 1) < 1) errors.push(`${item.id}: retry maxAttempts must be positive`);
    for (const dependency of item.dependencies) if (!ids.has(dependency)) errors.push(`${item.id}: unknown dependency ${dependency}`);
    for (const capability of item.remoteCapabilities ?? []) {
      if (/commit|push|pull_request\.write|merge|promote|deploy|release\.publish/.test(capability.capability)) errors.push(`${item.id}: repository propagation capability is not allowed in loops`);
      if (capability.mode !== "read" && !capability.requiresApproval) errors.push(`${item.id}: remote execute/write capability requires approval`);
    }
  }
  if (hasDependencyCycle(items)) errors.push("work item dependency cycle detected");
  return errors;
}

export function createLoopRun(repoRoot: string, input: {
  sessionId: string; taskId: string; title: string; objective: string; workItems: LoopWorkItemDefinition[]; now?: Date;
}): HcpLoopRun {
  const errors = validateWorkItems(input.workItems);
  if (errors.length) throw new Error(`Loop analysis invalid: ${errors.join("; ")}`);
  const now = input.now ?? new Date();
  const sequence = String(listLoopRuns(repoRoot).length + 1).padStart(3, "0");
  const loopId = `codex_loop_${input.taskId.match(/_task_(\d+)_/)?.[1] ?? "000"}_${sequence}`;
  const timestamp = now.toISOString();
  const loop: HcpLoopRun = {
    schemaVersion: 1, loopId, sessionId: input.sessionId, taskId: input.taskId,
    title: input.title, objective: input.objective, analysisVersion: 1, required: true, status: "analysis_ready",
    workItems: input.workItems.map((item) => ({ ...item, status: item.dependencies.length === 0 ? "ready" : "pending", attempt: 0 })),
    checkpoints: [], createdAt: timestamp, updatedAt: timestamp
  };
  writeLoop(repoRoot, loop);
  return loop;
}

export function listLoopRuns(repoRoot: string, taskId?: string, includeDeleted = false): HcpLoopRun[] {
  const roots = includeDeleted ? ["active", "completed", "deleted"] : ["active", "completed"];
  return roots.flatMap((folder) => readLoopFolder(repoRoot, folder)).filter((loop) => !taskId || loop.taskId === taskId);
}

export function selectLoopCandidates(repoRoot: string, command: string, taskId?: string): HcpLoopRun[] {
  const allowed: Record<string, LoopStatus[]> = {
    analyze: ["draft", "blocked", "failed"], execute: ["analysis_ready", "paused", "running"],
    remediate: ["blocked", "paused", "failed"], stop: ["running", "paused"],
    delete: ["draft", "analysis_ready", "paused", "blocked", "failed", "cancelled"],
    rollback: ["paused", "blocked", "failed", "completed"], restore: ["deleted"], approve: ["analysis_ready", "paused", "blocked"], status: [...activeStatuses]
  };
  return listLoopRuns(repoRoot, taskId, command === "restore").filter((loop) => (allowed[command] ?? []).includes(loop.status));
}

export function transitionLoop(repoRoot: string, loopId: string, status: LoopStatus, now = new Date()): HcpLoopRun {
  const loop = readLoop(repoRoot, loopId, true);
  if (status === "running" && listLoopRuns(repoRoot, loop.taskId).some((item) => item.status === "running" && item.loopId !== loopId)) {
    throw new Error("Another loop is already running for this task");
  }
  loop.status = status;
  if (status === "running") loop.lease = { owner: "codex", acquiredAt: now.toISOString(), expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString() };
  else delete loop.lease;
  loop.updatedAt = now.toISOString();
  writeLoop(repoRoot, loop);
  return loop;
}

export function reviseLoopAnalysis(repoRoot: string, loopId: string, changes: Partial<Pick<LoopWorkItemDefinition, "completionConditions" | "expectedResults" | "errorCases" | "allowedPaths" | "verificationCommands" | "retryPolicy">> = {}, now = new Date(), workItemId?: string): HcpLoopRun {
  const loop = readLoop(repoRoot, loopId, true);
  if (loop.status === "running") throw new Error("Running loop must be paused before analysis revision");
  const targets = workItemId ? loop.workItems.filter((item) => item.id === workItemId) : loop.workItems;
  if (workItemId && !targets.length) throw new Error(`Work item not found: ${workItemId}`);
  const changedFields = Object.keys(changes).filter((key) => targets.some((item) => JSON.stringify(item[key as keyof typeof changes]) !== JSON.stringify(changes[key as keyof typeof changes])));
  const invalidatedWorkItemIds: string[] = [];
  if (changedFields.length) for (const item of targets) {
    for (const key of changedFields) Object.assign(item, { [key]: changes[key as keyof typeof changes] });
    invalidateWorkItemAndDependents(loop, item.id, invalidatedWorkItemIds);
  }
  loop.analysisVersion += 1;
  loop.analysisHistory = [...(loop.analysisHistory ?? []), { version: loop.analysisVersion, changedFields, invalidatedWorkItemIds, changedAt: now.toISOString() }];
  loop.status = "analysis_ready";
  loop.updatedAt = now.toISOString();
  writeLoop(repoRoot, loop);
  return loop;
}

export function recoverStaleLoopLeases(repoRoot: string, now = new Date()): HcpLoopRun[] {
  const recovered: HcpLoopRun[] = [];
  for (const loop of listLoopRuns(repoRoot).filter((item) => item.status === "running" && item.lease && new Date(item.lease.expiresAt).getTime() < now.getTime())) {
    loop.status = "paused"; delete loop.lease; loop.updatedAt = now.toISOString(); writeLoop(repoRoot, loop); recovered.push(loop);
  }
  return recovered;
}

export function runNextLoopWorkItem(repoRoot: string, loopId: string, now = new Date()): HcpLoopRun {
  const loop = readLoop(repoRoot, loopId, true);
  if (loop.status !== "running") throw new Error("Loop must be running");
  if (loop.lease && new Date(loop.lease.expiresAt).getTime() < now.getTime()) { loop.status = "paused"; delete loop.lease; writeLoop(repoRoot, loop); throw new Error("Loop lease expired; resume required"); }
  loop.lease = { owner: loop.lease?.owner ?? "codex", acquiredAt: loop.lease?.acquiredAt ?? now.toISOString(), expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString() };
  const item = loop.workItems.find((candidate) => candidate.status === "implementation_complete");
  if (!item) {
    if (loop.workItems.every((candidate) => ["completed", "skipped"].includes(candidate.status))) loop.status = "completed";
    else loop.status = "blocked";
    writeLoop(repoRoot, loop); return loop;
  }
  if (item.status !== "implementation_complete" || !item.implementationEvidence) throw new Error("Work item implementation is not complete");
  item.status = "verifying"; item.verificationEvidence = [];
  const baseCommit = git(repoRoot, ["rev-parse", "HEAD"]);
  for (const command of item.verificationCommands) {
    const startedAt = now.toISOString(); let exitCode = 0;
    try { runVerification(repoRoot, command); } catch { exitCode = 1; }
    const diffDigest = createHash("sha256").update(git(repoRoot, ["diff", "--binary", "HEAD"])).digest("hex");
    item.verificationEvidence.push({ command, exitCode, status: exitCode === 0 ? "passed" : "failed", startedAt, completedAt: new Date().toISOString(), commit: baseCommit, diffDigest });
    if (exitCode !== 0) {
      item.lastError = "verification_failed"; item.resultType = "failed_verification";
      const policy = item.retryPolicy ?? { maxAttempts: 1, retryableErrors: [] };
      item.status = item.attempt < policy.maxAttempts && policy.retryableErrors.includes(item.lastError) && !policy.requireAnalysisRevisionAfterFailure ? "ready" : "blocked";
      loop.status = item.status === "ready" ? "paused" : "blocked"; delete loop.lease; writeLoop(repoRoot, loop); return loop;
    }
  }
  const conditionFailure = evaluateCompletionConditions(repoRoot, loop, item);
  if (conditionFailure) { item.lastError = conditionFailure; item.status = "blocked"; loop.status = "blocked"; delete loop.lease; writeLoop(repoRoot, loop); return loop; }
  const resultType: LoopResultType = item.implementationEvidence.changedFiles.length ? "completed_changed" : "completed_no_change";
  if (!item.expectedResults.includes(resultType)) { item.lastError = `unexpected_result:${resultType}`; item.resultType = resultType; item.status = "blocked"; loop.status = "blocked"; delete loop.lease; writeLoop(repoRoot, loop); return loop; }
  item.status = "completed"; item.resultType = resultType; delete item.lastError;
  for (const candidate of loop.workItems.filter((entry) => entry.status === "pending")) {
    if (candidate.dependencies.every((id) => loop.workItems.find((entry) => entry.id === id)?.status === "completed")) candidate.status = "ready";
  }
  if (loop.workItems.every((candidate) => ["completed", "skipped"].includes(candidate.status))) loop.status = "completed";
  if (loop.status === "completed") delete loop.lease;
  loop.updatedAt = new Date().toISOString(); writeLoop(repoRoot, loop); return loop;
}

export function beginLoopWorkItemImplementation(repoRoot: string, loopId: string, now = new Date()): HcpLoopRun {
  const loop = readLoop(repoRoot, loopId, true); if (loop.status !== "running") throw new Error("Loop must be running");
  const item = loop.workItems.find((candidate) => candidate.status === "ready"); if (!item) throw new Error("Ready work item not found");
  item.status = "implementing"; item.attempt += 1;
  item.implementationEvidence = { summary: "", changedFiles: [], checkpointBefore: createCheckpointValue(repoRoot, loop, "before", now), checkpointAfter: createCheckpointValue(repoRoot, loop, "after_implementation", now), completedAt: "" };
  loop.updatedAt = now.toISOString(); writeLoop(repoRoot, loop); return loop;
}

export function completeLoopWorkItemImplementation(repoRoot: string, loopId: string, summary: string, now = new Date()): HcpLoopRun {
  const loop = readLoop(repoRoot, loopId, true); const item = loop.workItems.find((candidate) => candidate.status === "implementing");
  if (!item?.implementationEvidence) throw new Error("Implementing work item not found");
  const after = createCheckpointValue(repoRoot, loop, "after_implementation", now);
  const beforeDigests = item.implementationEvidence.checkpointBefore.fileDigests ?? {};
  const changedFiles = [...new Set([...Object.keys(beforeDigests), ...Object.keys(after.fileDigests)])]
    .filter((path) => beforeDigests[path] !== after.fileDigests[path] && !path.replace(/\\/g, "/").startsWith(".hcp/"));
  const outside = changedFiles.filter((path) => !item.allowedPaths.some((pattern) => pathAllowed(path, pattern)));
  item.implementationEvidence = { ...item.implementationEvidence, summary, changedFiles, checkpointAfter: after, completedAt: now.toISOString() };
  if (outside.length) { item.status = "blocked"; loop.status = "blocked"; }
  else item.status = "implementation_complete";
  writeLoop(repoRoot, loop); return loop;
}

export function softDeleteLoop(repoRoot: string, loopId: string, reason: string, now = new Date(), replacementLoopId?: string, exclusionApproved = false): HcpLoopRun {
  const loop = readLoop(repoRoot, loopId, true);
  if (loop.status === "running") throw new Error("Running loop must be paused before deletion");
  const previousStatus = loop.status;
  loop.status = "deleted";
  loop.deletion = { deletedAt: now.toISOString(), reason, previousStatus, replacementLoopId, exclusionApproved };
  loop.updatedAt = now.toISOString();
  writeLoop(repoRoot, loop);
  return loop;
}

export function restoreLoop(repoRoot: string, loopId: string, now = new Date()): HcpLoopRun {
  const loop = readLoop(repoRoot, loopId, true);
  if (loop.status !== "deleted") throw new Error("Only deleted loops can be restored");
  loop.status = "paused";
  delete loop.deletion;
  loop.updatedAt = now.toISOString();
  writeLoop(repoRoot, loop);
  return loop;
}

export function createLoopCheckpoint(repoRoot: string, loopId: string, phase: LoopCheckpoint["phase"], now = new Date()): LoopCheckpoint {
  const loop = readLoop(repoRoot, loopId, true);
  const branchName = git(repoRoot, ["branch", "--show-current"]);
  const baseCommit = git(repoRoot, ["rev-parse", "HEAD"]);
  const changedFiles = readChangedFiles(repoRoot);
  const diff = git(repoRoot, ["diff", "--binary", "HEAD"]); const fileDigests = createFileDigests(repoRoot, changedFiles);
  const checkpoint: LoopCheckpoint = {
    checkpointId: `${loop.loopId}_cp_${String(loop.checkpoints.length + 1).padStart(3, "0")}`,
    phase, branchName, baseCommit, changedFiles, fileDigests,
    diffDigest: createHash("sha256").update(diff).digest("hex"), createdAt: now.toISOString()
  };
  loop.checkpoints.push(checkpoint);
  loop.updatedAt = checkpoint.createdAt;
  writeLoop(repoRoot, loop);
  return checkpoint;
}

export function buildRollbackReport(repoRoot: string, loopId: string): RollbackPlan {
  const loop = readLoop(repoRoot, loopId, true);
  const checkpoint = loop.checkpoints.at(-1);
  if (!checkpoint) return { ready: false, detail: "rollback blocked: checkpoint missing", removableFiles: [], blockedFiles: [] };
  const currentBranch = git(repoRoot, ["branch", "--show-current"]);
  if (currentBranch !== checkpoint.branchName) return { ready: false, checkpoint, removableFiles: [], blockedFiles: [], detail: "rollback blocked: branch changed" };
  const first = loop.checkpoints.find((entry) => entry.phase === "before") ?? checkpoint;
  const current = createCheckpointValue(repoRoot, loop, "rollback_before", new Date());
  const paths = [...new Set([...Object.keys(first.fileDigests ?? {}), ...Object.keys(current.fileDigests)])].filter((path) => first.fileDigests?.[path] !== current.fileDigests[path] && !path.startsWith(".hcp/"));
  const removableFiles = paths.filter((path) => first.fileDigests?.[path] === undefined && current.fileDigests[path] !== "deleted");
  const blockedFiles = paths.filter((path) => !removableFiles.includes(path));
  return { ready: blockedFiles.length === 0 && removableFiles.length > 0, checkpoint: first, removableFiles, blockedFiles, detail: blockedFiles.length ? "rollback blocked: pre-existing or modified files require manual recovery" : removableFiles.length ? "rollback ready for loop-created files" : "rollback has no eligible changes" };
}

export function approveLoopCondition(repoRoot: string, loopId: string, workItemId: string, conditionValue: string, approvedBy: string, now = new Date()): HcpLoopRun {
  const loop = readLoop(repoRoot, loopId, true);
  const item = loop.workItems.find((candidate) => candidate.id === workItemId);
  if (!item) throw new Error(`Work item not found: ${workItemId}`);
  if (!item.completionConditions.some((condition) => typeof condition !== "string" && condition.type === "manual_approval" && condition.value === conditionValue)) throw new Error(`Manual approval condition not found: ${conditionValue}`);
  if (!approvedBy.trim()) throw new Error("Approval actor is required");
  loop.approvals = [...(loop.approvals ?? []).filter((approval) => !(approval.workItemId === workItemId && approval.conditionValue === conditionValue)), { workItemId, conditionValue, approvedBy: approvedBy.trim(), approvedAt: now.toISOString() }];
  if (item.lastError === "completion_condition_failed:manual_approval" && item.implementationEvidence) { item.status = "implementation_complete"; delete item.lastError; loop.status = "paused"; }
  loop.updatedAt = now.toISOString(); writeLoop(repoRoot, loop); return loop;
}

export function executeApprovedRollback(repoRoot: string, loopId: string, approvedPaths: string[], now = new Date()): HcpLoopRun {
  const plan = buildRollbackReport(repoRoot, loopId);
  if (!plan.ready) throw new Error(plan.detail);
  if (!approvedPaths.length || approvedPaths.some((path) => !plan.removableFiles.includes(normalizeRepoPath(repoRoot, path)))) throw new Error("Rollback approval must match removable files");
  for (const path of approvedPaths.map((value) => normalizeRepoPath(repoRoot, value))) {
    const absolute = resolve(repoRoot, path); assertInsideRepo(repoRoot, absolute);
    if (existsSync(absolute) && !lstatSync(absolute).isFile()) throw new Error(`Rollback only supports regular files: ${path}`);
    if (existsSync(absolute)) unlinkSync(absolute);
  }
  const loop = readLoop(repoRoot, loopId, true); loop.checkpoints.push(createCheckpointValue(repoRoot, loop, "rollback_after", now)); loop.status = "paused"; loop.updatedAt = now.toISOString(); writeLoop(repoRoot, loop); return loop;
}

function hasDependencyCycle(items: LoopWorkItemDefinition[]): boolean {
  const deps = new Map(items.map((item) => [item.id, item.dependencies]));
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true; if (visited.has(id)) return false;
    visiting.add(id); for (const dep of deps.get(id) ?? []) if (visit(dep)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  return items.some((item) => visit(item.id));
}

function loopRoot(repoRoot: string, folder: string): string { return join(repoRoot, ".hcp", "loops", folder); }
function readLoopFolder(repoRoot: string, folder: string): HcpLoopRun[] {
  const root = loopRoot(repoRoot, folder); if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(root, name), "utf8")) as HcpLoopRun);
}
function readLoop(repoRoot: string, loopId: string, includeDeleted: boolean): HcpLoopRun {
  const loop = listLoopRuns(repoRoot, undefined, includeDeleted).find((item) => item.loopId === loopId);
  if (!loop) throw new Error(`Loop not found: ${loopId}`); return loop;
}
function writeLoop(repoRoot: string, loop: HcpLoopRun): void {
  const folder = loop.status === "deleted" ? "deleted" : loop.status === "completed" ? "completed" : "active";
  const path = join(loopRoot(repoRoot, folder), `${loop.loopId}.json`); mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`; writeFileSync(temp, `${JSON.stringify(loop, null, 2)}\n`, "utf8");
  const backups: string[] = [];
  for (const candidate of ["active", "completed", "deleted"].map((name) => join(loopRoot(repoRoot, name), `${loop.loopId}.json`))) {
    if (existsSync(candidate)) {
      const backup = `${candidate}.moving`;
      renameSync(candidate, backup);
      backups.push(backup);
    }
  }
  try {
    renameSync(temp, path);
    for (const backup of backups) unlinkSync(backup);
  } catch (error) {
    for (const backup of backups) renameSync(backup, backup.slice(0, -".moving".length));
    throw error;
  }
}
function git(cwd: string, args: string[]): string { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function createCheckpointValue(repoRoot: string, loop: HcpLoopRun, phase: LoopCheckpoint["phase"], now: Date): LoopCheckpoint {
  const changedFiles = readChangedFiles(repoRoot);
  return { checkpointId: `${loop.loopId}_inline_${now.getTime()}`, phase, branchName: git(repoRoot, ["branch", "--show-current"]), baseCommit: git(repoRoot, ["rev-parse", "HEAD"]), changedFiles, fileDigests: createFileDigests(repoRoot, changedFiles), diffDigest: createHash("sha256").update(git(repoRoot, ["diff", "--binary", "HEAD"])).digest("hex"), createdAt: now.toISOString() };
}
function pathAllowed(path: string, pattern: string): boolean { const normalized = pattern.replace(/\\/g, "/"); return normalized.endsWith("/**") ? path.replace(/\\/g, "/").startsWith(normalized.slice(0, -3)) : path.replace(/\\/g, "/") === normalized || path.replace(/\\/g, "/").startsWith(`${normalized}/`); }
function runVerification(repoRoot: string, command: string): void {
  const packageRoot = existsSync(join(repoRoot, "packages", "harness-cli", "package.json")) ? join(repoRoot, "packages", "harness-cli") : repoRoot;
  if (command === "npm test") { execFileSync("npm", ["test"], { cwd: packageRoot, stdio: "ignore" }); return; }
  if (command === "npm run check") { execFileSync("npm", ["run", "check"], { cwd: packageRoot, stdio: "ignore" }); return; }
  if (command === "git diff --check") { execFileSync("git", ["diff", "--check"], { cwd: repoRoot, stdio: "ignore" }); return; }
  throw new Error(`Verification command is not allowed: ${command}`);
}

function createFileDigests(repoRoot: string, paths: string[]): Record<string, string> {
  return Object.fromEntries(paths.map((value) => {
    const path = normalizeRepoPath(repoRoot, value); const absolute = resolve(repoRoot, path); assertInsideRepo(repoRoot, absolute);
    if (!existsSync(absolute)) return [path, "deleted"];
    const stat = lstatSync(absolute); if (!stat.isFile() || stat.isSymbolicLink()) return [path, `unsupported:${stat.mode}`];
    if (stat.size > 10 * 1024 * 1024) return [path, `large-file:${stat.size}:${stat.mtimeMs}`];
    return [path, createHash("sha256").update(readFileSync(absolute)).digest("hex")];
  }));
}
function normalizeRepoPath(repoRoot: string, value: string): string {
  const absolute = isAbsolute(value) ? resolve(value) : resolve(repoRoot, value); assertInsideRepo(repoRoot, absolute); return relative(repoRoot, absolute).replace(/\\/g, "/");
}
function assertInsideRepo(repoRoot: string, absolute: string): void { const rel = relative(resolve(repoRoot), absolute); if (!rel || rel.startsWith("..") || isAbsolute(rel)) { if (rel) throw new Error(`Path outside repository: ${absolute}`); } }
function invalidateWorkItemAndDependents(loop: HcpLoopRun, id: string, result: string[]): void {
  const affected = new Set([id]); let changed = true;
  while (changed) { changed = false; for (const item of loop.workItems) if (!affected.has(item.id) && item.dependencies.some((dep) => affected.has(dep))) { affected.add(item.id); changed = true; } }
  for (const item of loop.workItems.filter((candidate) => affected.has(candidate.id))) { item.status = item.dependencies.length ? "pending" : "ready"; item.verificationEvidence = []; delete item.resultType; delete item.lastError; result.push(item.id); }
}
function evaluateCompletionConditions(repoRoot: string, loop: HcpLoopRun, item: HcpLoopRun["workItems"][number]): string | undefined {
  for (const condition of item.completionConditions) {
    if (typeof condition === "string" || condition.required === false) continue;
    const path = condition.value ? resolve(repoRoot, condition.value) : undefined; if (path) assertInsideRepo(repoRoot, path);
    const passed = condition.type === "command_passed" ? item.verificationEvidence?.some((e) => e.command === condition.value && e.status === "passed")
      : condition.type === "file_exists" ? Boolean(path && existsSync(path))
      : condition.type === "file_changed" ? Boolean(condition.value && item.implementationEvidence?.changedFiles.includes(condition.value.replace(/\\/g, "/")))
      : condition.type === "file_unchanged" ? Boolean(condition.value && !item.implementationEvidence?.changedFiles.includes(condition.value.replace(/\\/g, "/")))
      : condition.type === "path_scope_clean" ? Boolean(item.implementationEvidence?.changedFiles.every((changed) => item.allowedPaths.some((pattern) => pathAllowed(changed, pattern))))
      : Boolean(condition.value && loop.approvals?.some((approval) => approval.workItemId === item.id && approval.conditionValue === condition.value));
    if (!passed) return `completion_condition_failed:${condition.type}`;
  }
  return undefined;
}

function readChangedFiles(repoRoot: string): string[] {
  const raw = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const fields = raw.split("\0"); const paths: string[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index]; if (!entry) continue;
    const status = entry.slice(0, 2); const path = entry.slice(3); if (path) paths.push(path.replace(/\\/g, "/"));
    if (/[RC]/.test(status) && fields[index + 1]) { paths.push(fields[index + 1].replace(/\\/g, "/")); index += 1; }
  }
  return [...new Set(paths)];
}
