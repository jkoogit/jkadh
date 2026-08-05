import { createHash } from "node:crypto";

import type { DbClient } from "./db-client.ts";

export type RegistryProvider = "github";
export type RepositoryStatus = "active" | "deprecated";
export type WorkGroupIssuePolicy = "dedicated" | "shared_registration";
export type TaskIssuePolicy = "dedicated" | "shared_umbrella";

type DbId = number | string;

export interface RepositoryRegistrationInput {
  repositoryKey: string;
  provider?: RegistryProvider;
  repositoryFullName: string;
  canonicalUrl?: string;
  lifecyclePolicy: string;
  status?: RepositoryStatus;
}

export interface RegistryRepository {
  repositoryId: DbId;
  repositoryKey: string;
  provider: RegistryProvider;
  repositoryFullName: string;
  canonicalUrl: string;
  lifecyclePolicy: string;
  status: RepositoryStatus;
  reused: boolean;
}

export interface IssueAllocationRequest {
  provider?: RegistryProvider;
  number: number;
  title: string;
  url: string;
}

export interface ExternalIssueEvidence extends IssueAllocationRequest {
  status?: "open" | "closed";
  verificationSource: "github";
  verifiedAt: string;
}

export interface WorkGroupAllocationRequest {
  repositoryKey: string;
  registrationIssue: IssueAllocationRequest;
  title: string;
  issuePolicy?: WorkGroupIssuePolicy;
  sharedRegistrationApproved?: boolean;
  allocationKey?: string;
}

export interface WorkGroupBootstrapInput extends WorkGroupAllocationRequest {
  registrationIssue: ExternalIssueEvidence;
}

export interface WorkGroupAllocation {
  workGroupId: string;
  repositoryId: DbId;
  registrationIssueId: string;
  issueSequence: number;
  allocationKey: string;
  issuePolicy: WorkGroupIssuePolicy;
  reused: boolean;
}

export interface RegistryTaskAllocationRequest {
  repositoryKey: string;
  workGroupId: string;
  executionIssue: IssueAllocationRequest;
  sessionId: string;
  taskName: string;
  issuePolicy?: TaskIssuePolicy;
  sharedUmbrellaApproved?: boolean;
  allocationKey?: string;
}

export interface RegistryTaskAllocationInput extends RegistryTaskAllocationRequest {
  executionIssue: ExternalIssueEvidence;
}

export interface RegistryTaskAllocation {
  taskId: string;
  repositoryId: DbId;
  workGroupId: string;
  executionIssueId: string;
  issueSequence: number;
  allocationKey: string;
  issuePolicy: TaskIssuePolicy;
  reused: boolean;
}

interface RepositoryRow {
  repository_id: DbId;
  repository_key: string;
  provider: RegistryProvider;
  repository_full_name: string;
  canonical_url: string;
  lifecycle_policy: string;
  status: RepositoryStatus;
}

interface WorkGroupRow {
  work_group_id: string;
  repository_id: DbId;
  registration_issue_id: string;
  issue_sequence: number | string;
  allocation_key: string;
  issue_policy: WorkGroupIssuePolicy;
}

interface TaskRow {
  task_id: string;
  repository_id: DbId;
  work_group_id: string;
  execution_issue_id: string;
  issue_sequence: number | string;
  allocation_key: string;
  issue_policy: TaskIssuePolicy;
}

interface AllocationRow {
  allocation_key: string;
  request_fingerprint: string;
  entity_type: "work_group" | "task";
  repository_id: DbId;
  issue_id: string;
  issue_number: number | string;
  issue_sequence: number | string;
  entity_id: string;
  status: "reserved" | "allocated" | "tombstoned";
}

interface IdAllocationPlan<T> {
  existing?: T;
  reservation?: AllocationRow;
  create?: () => Promise<T>;
}

interface NormalizedWorkGroupAllocationRequest {
  repositoryKey: string;
  issue: Required<IssueAllocationRequest>;
  title: string;
  issuePolicy: WorkGroupIssuePolicy;
  allocationKey: string;
  requestFingerprint: string;
}

interface NormalizedTaskAllocationRequest {
  repositoryKey: string;
  workGroupId: string;
  issue: Required<IssueAllocationRequest>;
  sessionId: string;
  taskName: string;
  issuePolicy: TaskIssuePolicy;
  allocationKey: string;
  requestFingerprint: string;
}

export class RegistryPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryPolicyError";
  }
}

export class RegistryOperationResultUnknownError extends Error {
  readonly operationKey: string;
  readonly lastConfirmedBoundary: string;

  constructor(
    operationKey: string,
    message: string,
    cause?: unknown,
    lastConfirmedBoundary = "before_commit_confirmation"
  ) {
    super(`operation_result_unknown: ${message}; operationKey=${operationKey}`, { cause });
    this.name = "RegistryOperationResultUnknownError";
    this.operationKey = operationKey;
    this.lastConfirmedBoundary = lastConfirmedBoundary;
  }
}

export function normalizeRepositoryKey(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]*$/.test(normalized)) {
    throw new RegistryPolicyError("repositoryKey must use uppercase letters, digits, or hyphens");
  }
  return normalized;
}

export function formatWorkGroupId(repositoryKey: string, issueNumber: number, sequence: number): string {
  return `WG-${normalizeRepositoryKey(repositoryKey)}-${positiveInteger(issueNumber, "registration issue number")}-${formatSequence(sequence)}`;
}

export function formatTaskId(repositoryKey: string, issueNumber: number, sequence: number): string {
  return `TSK-${normalizeRepositoryKey(repositoryKey)}-${positiveInteger(issueNumber, "execution issue number")}-${formatSequence(sequence)}`;
}

export async function registerRepository(client: DbClient, input: RepositoryRegistrationInput): Promise<RegistryRepository> {
  const normalized = normalizeRepositoryInput(input);
  return withTransaction(client, `repository:${normalized.repositoryKey}`, async () => {
    await acquireAllocationLock(client, `repository-key:${normalized.repositoryKey}`);
    await acquireAllocationLock(client, `repository-coordinate:${normalized.provider}:${normalized.repositoryFullName}`);
    const existingByKey = await client.query<RepositoryRow>(`
      select repository_id, repository_key, provider, repository_full_name, canonical_url, lifecycle_policy, status
      from hcp.harness_repository
      where repository_key = $1
    `, [normalized.repositoryKey]);
    const existing = existingByKey.rows[0];
    if (existing) {
      assertRepositoryCoordinates(existing, normalized);
      if (existing.lifecycle_policy !== normalized.lifecyclePolicy || existing.status !== normalized.status) {
        const updated = await client.query<RepositoryRow>(`
          update hcp.harness_repository
          set lifecycle_policy = $2,
              status = $3,
              updated_at = now()
          where repository_key = $1
          returning repository_id, repository_key, provider, repository_full_name, canonical_url, lifecycle_policy, status
        `, [normalized.repositoryKey, normalized.lifecyclePolicy, normalized.status]);
        return mapRepository(updated.rows[0] ?? existing, true);
      }
      return mapRepository(existing, true);
    }

    const coordinateCollision = await client.query<RepositoryRow>(`
      select repository_id, repository_key, provider, repository_full_name, canonical_url, lifecycle_policy, status
      from hcp.harness_repository
      where provider = $1 and repository_full_name = $2
    `, [normalized.provider, normalized.repositoryFullName]);
    if (coordinateCollision.rows[0]) {
      throw new RegistryPolicyError(
        `repository coordinate already registered as ${coordinateCollision.rows[0].repository_key}`
      );
    }

    const inserted = await client.query<RepositoryRow>(`
      insert into hcp.harness_repository (
        repository_key, provider, repository_full_name, canonical_url, lifecycle_policy, status
      ) values ($1, $2, $3, $4, $5, $6)
      returning repository_id, repository_key, provider, repository_full_name, canonical_url, lifecycle_policy, status
    `, [
      normalized.repositoryKey,
      normalized.provider,
      normalized.repositoryFullName,
      normalized.canonicalUrl,
      normalized.lifecyclePolicy,
      normalized.status
    ]);
    const row = inserted.rows[0];
    if (!row) throw new Error("repository registration returned no row");
    return mapRepository(row, false);
  });
}

export async function readActiveRegistryRepository(client: DbClient, repositoryKey: string): Promise<RegistryRepository> {
  const row = await requireActiveRepository(client, normalizeRepositoryKey(repositoryKey));
  return mapRepository(row, true);
}

export async function replayWorkGroupAllocation(
  client: DbClient,
  input: WorkGroupAllocationRequest
): Promise<WorkGroupAllocation | undefined> {
  const request = normalizeWorkGroupAllocationRequest(input);
  return withTransaction(client, request.allocationKey, async () => {
    await acquireAllocationLock(client, `allocation:${request.allocationKey}`);
    return reuseWorkGroupAllocation(client, request.allocationKey, request.requestFingerprint);
  }, false);
}

export async function bootstrapWorkGroup(client: DbClient, input: WorkGroupBootstrapInput): Promise<WorkGroupAllocation> {
  const request = normalizeWorkGroupAllocationRequest(input);

  return withIdAllocationTransaction(client, request.allocationKey, async () => {
    await acquireAllocationLock(client, `allocation:${request.allocationKey}`);
    const existing = await reuseWorkGroupAllocation(client, request.allocationKey, request.requestFingerprint);
    if (existing) return { existing };

    const issue = normalizeIssueEvidence(input.registrationIssue, "registration");
    const repository = await requireActiveRepository(client, request.repositoryKey);
    const issueId = await upsertIssue(client, repository, issue);
    const existingCount = await countRows(client, `
      select count(*)::int as count
      from hcp.harness_work_group
      where repository_id = $1 and registration_issue_id = $2
    `, [repository.repository_id, issueId]);
    if (existingCount > 0 && request.issuePolicy !== "shared_registration") {
      throw new RegistryPolicyError("registration Issue already owns a WG; shared_registration approval is required");
    }
    if (existingCount > 0) {
      const existingPolicies = await client.query<{ issue_policy: WorkGroupIssuePolicy }>(`
        select issue_policy
        from hcp.harness_work_group
        where repository_id = $1 and registration_issue_id = $2
      `, [repository.repository_id, issueId]);
      if (existingPolicies.rows.some((row) => row.issue_policy !== "shared_registration")) {
        throw new RegistryPolicyError("a dedicated registration Issue cannot be converted to shared_registration");
      }
    }

    const reservation = await reserveWorkGroupAllocation(
      client,
      repository.repository_id,
      request.issue.number,
      request.issuePolicy,
      request.allocationKey,
      request.requestFingerprint,
      issueId,
      request.repositoryKey
    );
    return {
      reservation,
      create: async () => {
        const inserted = await client.query<WorkGroupRow>(`
          insert into hcp.harness_work_group (
            work_group_id, repository_id, registration_issue_id, issue_sequence,
            allocation_key, title, issue_policy, status
          ) values ($1, $2, $3, $4, $5, $6, $7, 'active')
          returning work_group_id, repository_id, registration_issue_id, issue_sequence, allocation_key, issue_policy
        `, [
          reservation.entity_id,
          repository.repository_id,
          issueId,
          Number(reservation.issue_sequence),
          request.allocationKey,
          request.title,
          request.issuePolicy
        ]);
        const row = inserted.rows[0];
        if (!row) throw new Error("WG allocation returned no row");
        await linkIssueRole(client, issueId, "work_group", reservation.entity_id, "registration");
        return mapWorkGroup(row, false);
      }
    };
  });
}

export async function replayRegistryTaskAllocation(
  client: DbClient,
  input: RegistryTaskAllocationRequest
): Promise<RegistryTaskAllocation | undefined> {
  const request = normalizeTaskAllocationRequest(input);
  return withTransaction(client, request.allocationKey, async () => {
    await acquireAllocationLock(client, `allocation:${request.allocationKey}`);
    return reuseTaskAllocation(client, request.allocationKey, request.requestFingerprint);
  }, false);
}

export async function allocateRegistryTask(client: DbClient, input: RegistryTaskAllocationInput): Promise<RegistryTaskAllocation> {
  const request = normalizeTaskAllocationRequest(input);

  return withIdAllocationTransaction(client, request.allocationKey, async () => {
    await acquireAllocationLock(client, `allocation:${request.allocationKey}`);
    const existing = await reuseTaskAllocation(client, request.allocationKey, request.requestFingerprint);
    if (existing) return { existing };

    const issue = normalizeIssueEvidence(input.executionIssue, "execution");
    const repository = await requireActiveRepository(client, request.repositoryKey);
    const workGroup = await client.query<{ work_group_id: string }>(`
      select work_group_id
      from hcp.harness_work_group
      where work_group_id = $1
        and status in ('planned', 'active')
    `, [request.workGroupId]);
    if (!workGroup.rows[0]) {
      throw new RegistryPolicyError(`active WG not found: ${request.workGroupId}`);
    }

    const issueId = await upsertIssue(client, repository, issue);
    const existingCount = await countRows(client, `
      select count(*)::int as count
      from hcp.harness_task
      where repository_id = $1 and execution_issue_id = $2
    `, [repository.repository_id, issueId]);
    if (existingCount > 0 && request.issuePolicy !== "shared_umbrella") {
      throw new RegistryPolicyError("execution Issue already owns a Task; shared_umbrella approval is required");
    }
    if (existingCount > 0) {
      const existingPolicies = await client.query<{ issue_policy: TaskIssuePolicy }>(`
        select issue_policy
        from hcp.harness_task
        where repository_id = $1 and execution_issue_id = $2
      `, [repository.repository_id, issueId]);
      if (existingPolicies.rows.some((row) => row.issue_policy !== "shared_umbrella")) {
        throw new RegistryPolicyError("a dedicated execution Issue cannot be converted to shared_umbrella");
      }
    }

    const reservation = await reserveTaskAllocation(
      client,
      repository.repository_id,
      request.issue.number,
      request.issuePolicy,
      request.allocationKey,
      request.requestFingerprint,
      issueId,
      request.repositoryKey
    );
    return {
      reservation,
      create: async () => {
        const inserted = await client.query<TaskRow>(`
          insert into hcp.harness_task (
            task_id, session_id, task_name, status, issue_number, repository_id,
            work_group_id, execution_issue_id, issue_sequence, allocation_key, issue_policy
          ) values ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, $10)
          returning task_id, repository_id, work_group_id, execution_issue_id, issue_sequence, allocation_key, issue_policy
        `, [
          reservation.entity_id,
          request.sessionId,
          request.taskName,
          request.issue.number,
          repository.repository_id,
          request.workGroupId,
          issueId,
          Number(reservation.issue_sequence),
          request.allocationKey,
          request.issuePolicy
        ]);
        const row = inserted.rows[0];
        if (!row) throw new Error("Task allocation returned no row");
        await linkIssueRole(client, issueId, "task", reservation.entity_id, "execution");
        return mapTask(row, false);
      }
    };
  });
}

async function withTransaction<T>(
  client: DbClient,
  operationKey: string,
  operation: () => Promise<T>,
  authoritativeCommit = true
): Promise<T> {
  await client.query("begin");
  let result: T;
  try {
    result = await operation();
  } catch (error) {
    await safeRollback(client);
    throw error;
  }
  if (authoritativeCommit) {
    await commitOrThrowUnknown(client, operationKey);
  } else {
    await client.query("commit");
  }
  return result;
}

async function withIdAllocationTransaction<T>(
  client: DbClient,
  operationKey: string,
  prepare: () => Promise<IdAllocationPlan<T>>
): Promise<T> {
  // The reservation transaction permanently consumes the sequence before entity creation.
  // A later connection loss therefore leaves a recoverable reserved row instead of reusing the number.
  await client.query("begin");
  let plan: IdAllocationPlan<T>;
  try {
    plan = await prepare();
  } catch (error) {
    await safeRollback(client);
    throw error;
  }

  if (plan.existing !== undefined) {
    await commitOrThrowUnknown(client, operationKey);
    return plan.existing;
  }
  if (!plan.reservation || !plan.create) {
    await safeRollback(client);
    throw new Error("ID allocation plan is incomplete");
  }
  await commitOrThrowUnknown(client, operationKey);

  try {
    await client.query("begin");
  } catch (error) {
    throw new RegistryOperationResultUnknownError(
      operationKey,
      `reserved allocation ${plan.reservation.entity_id} requires recovery before entity creation`,
      error
    );
  }
  try {
    const result = await plan.create();
    await finalizeAllocation(client, plan.reservation.allocation_key, "allocated");
    await commitOrThrowUnknown(client, operationKey);
    return result;
  } catch (error) {
    await safeRollback(client);
    const detail = error instanceof Error ? error.message : "registry entity creation failed";
    if (error instanceof RegistryOperationResultUnknownError) throw error;
    try {
      await client.query("begin");
      await acquireAllocationLock(client, `allocation:${operationKey}`);
      await finalizeAllocation(client, plan.reservation.allocation_key, "tombstoned", detail);
      await commitOrThrowUnknown(client, operationKey);
    } catch (tombstoneError) {
      await safeRollback(client);
      throw tombstoneError instanceof RegistryOperationResultUnknownError
        ? tombstoneError
        : new RegistryOperationResultUnknownError(
          operationKey,
          `reserved allocation ${plan.reservation.entity_id} requires recovery before retry`,
          tombstoneError
        );
    }
    throw new RegistryPolicyError(`${plan.reservation.entity_id} was tombstoned after allocation failure: ${detail}`);
  }
}

async function commitOrThrowUnknown(client: DbClient, operationKey: string): Promise<void> {
  try {
    await client.query("commit");
  } catch (error) {
    throw new RegistryOperationResultUnknownError(
      operationKey,
      "database commit result could not be confirmed; query the same operationKey before retrying",
      error
    );
  }
}

async function safeRollback(client: DbClient): Promise<boolean> {
  try {
    await client.query("rollback");
    return true;
  } catch {
    // Preserve the original fail-closed error when the connection is already unavailable.
    return false;
  }
}

function normalizeRepositoryInput(input: RepositoryRegistrationInput): Required<RepositoryRegistrationInput> {
  const repositoryKey = normalizeRepositoryKey(input.repositoryKey);
  const provider = input.provider ?? "github";
  if (provider !== "github") throw new RegistryPolicyError(`unsupported repository provider: ${provider}`);
  const repositoryFullName = requiredText(input.repositoryFullName, "repository full name").toLowerCase();
  if (!/^[^/\s]+\/[^/\s]+$/.test(repositoryFullName)) {
    throw new RegistryPolicyError("repository full name must contain exactly one owner/repository separator");
  }
  const expectedCanonicalUrl = `https://github.com/${repositoryFullName}`;
  const canonicalUrl = (input.canonicalUrl?.trim() || expectedCanonicalUrl).replace(/\/$/, "").toLowerCase();
  if (canonicalUrl !== expectedCanonicalUrl) {
    throw new RegistryPolicyError(`canonical URL must match provider coordinate: ${expectedCanonicalUrl}`);
  }
  const lifecyclePolicy = requiredText(input.lifecyclePolicy, "lifecycle policy");
  const status = input.status ?? "active";
  return { repositoryKey, provider, repositoryFullName, canonicalUrl, lifecyclePolicy, status };
}

function normalizeIssueEvidence(issue: ExternalIssueEvidence, role: "registration" | "execution"): Required<ExternalIssueEvidence> {
  const normalized = normalizeIssueRequest(issue, role);
  const status = issue.status ?? "open";
  if (status !== "open") {
    throw new RegistryPolicyError(`${role} Issue must exist and be open before ID allocation`);
  }
  if (issue.verificationSource !== "github") {
    throw new RegistryPolicyError(`${role} Issue requires GitHub verification evidence`);
  }
  const verifiedAt = requiredText(issue.verifiedAt, `${role} Issue verifiedAt`);
  const verifiedTime = Date.parse(verifiedAt);
  const age = Date.now() - verifiedTime;
  if (!Number.isFinite(verifiedTime) || age < -60_000 || age > 5 * 60_000) {
    throw new RegistryPolicyError(`${role} Issue verification evidence is stale or invalid`);
  }
  return { ...normalized, status, verificationSource: "github", verifiedAt };
}

function normalizeIssueRequest(
  issue: IssueAllocationRequest,
  role: "registration" | "execution"
): Required<IssueAllocationRequest> {
  const provider = issue.provider ?? "github";
  if (provider !== "github") throw new RegistryPolicyError(`unsupported Issue provider: ${provider}`);
  const number = positiveInteger(issue.number, `${role} Issue number`);
  const title = requiredText(issue.title, `${role} Issue title`);
  const url = requiredText(issue.url, `${role} Issue URL`).replace(/\/$/, "");
  return { provider, number, title, url };
}

function normalizeWorkGroupAllocationRequest(input: WorkGroupAllocationRequest): NormalizedWorkGroupAllocationRequest {
  const repositoryKey = normalizeRepositoryKey(input.repositoryKey);
  const title = requiredText(input.title, "work group title");
  const issuePolicy = input.issuePolicy ?? "dedicated";
  if (issuePolicy === "shared_registration" && input.sharedRegistrationApproved !== true) {
    throw new RegistryPolicyError("shared_registration requires explicit approval");
  }
  const issue = normalizeIssueRequest(input.registrationIssue, "registration");
  const allocationKey = resolveWorkGroupAllocationKey(input, repositoryKey, issue.number, issuePolicy);
  return {
    repositoryKey,
    issue,
    title,
    issuePolicy,
    allocationKey,
    requestFingerprint: allocationFingerprint({
      entityType: "work_group",
      repositoryKey,
      issueProvider: issue.provider,
      issueNumber: issue.number,
      issueUrl: issue.url.toLowerCase(),
      title,
      issuePolicy
    })
  };
}

function normalizeTaskAllocationRequest(input: RegistryTaskAllocationRequest): NormalizedTaskAllocationRequest {
  const repositoryKey = normalizeRepositoryKey(input.repositoryKey);
  const workGroupId = requiredText(input.workGroupId, "workGroupId");
  const sessionId = requiredText(input.sessionId, "sessionId");
  const taskName = requiredText(input.taskName, "task name");
  const issuePolicy = input.issuePolicy ?? "dedicated";
  if (issuePolicy === "shared_umbrella" && input.sharedUmbrellaApproved !== true) {
    throw new RegistryPolicyError("shared_umbrella requires explicit approval");
  }
  const issue = normalizeIssueRequest(input.executionIssue, "execution");
  const allocationKey = resolveTaskAllocationKey(input, repositoryKey, issue.number, issuePolicy);
  return {
    repositoryKey,
    workGroupId,
    issue,
    sessionId,
    taskName,
    issuePolicy,
    allocationKey,
    requestFingerprint: allocationFingerprint({
      entityType: "task",
      repositoryKey,
      workGroupId,
      issueProvider: issue.provider,
      issueNumber: issue.number,
      issueUrl: issue.url.toLowerCase(),
      sessionId,
      taskName,
      issuePolicy
    })
  };
}

function assertRepositoryCoordinates(existing: RepositoryRow, input: Required<RepositoryRegistrationInput>): void {
  if (existing.provider !== input.provider || existing.repository_full_name.toLowerCase() !== input.repositoryFullName || existing.canonical_url.replace(/\/$/, "") !== input.canonicalUrl) {
    throw new RegistryPolicyError(`repositoryKey is immutable and already bound to ${existing.provider}:${existing.repository_full_name}`);
  }
}

async function requireActiveRepository(client: DbClient, repositoryKey: string): Promise<RepositoryRow> {
  const result = await client.query<RepositoryRow>(`
    select repository_id, repository_key, provider, repository_full_name, canonical_url, lifecycle_policy, status
    from hcp.harness_repository
    where repository_key = $1 and status = 'active'
  `, [repositoryKey]);
  const row = result.rows[0];
  if (!row) throw new RegistryPolicyError(`active repository is not registered: ${repositoryKey}`);
  return row;
}

async function upsertIssue(client: DbClient, repository: RepositoryRow, issue: Required<ExternalIssueEvidence>): Promise<string> {
  assertIssueCoordinate(repository, issue);
  const issueId = `${issue.provider}:${repository.repository_key}:${issue.number}`;
  const inserted = await client.query<{ issue_id: string }>(`
    insert into hcp.harness_issue (
      issue_id, repository_id, provider, issue_number, title, url, status
    ) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict do nothing
    returning issue_id
  `, [issueId, repository.repository_id, issue.provider, issue.number, issue.title, issue.url, issue.status]);
  if (inserted.rows[0]) return inserted.rows[0].issue_id;

  const updated = await client.query<{ issue_id: string }>(`
    update hcp.harness_issue
    set title = $4,
        url = $5,
        status = $6,
        updated_at = now()
    where repository_id = $1 and provider = $2 and issue_number = $3
    returning issue_id
  `, [repository.repository_id, issue.provider, issue.number, issue.title, issue.url, issue.status]);
  const row = updated.rows[0];
  if (!row) throw new RegistryPolicyError(`Issue registry collision could not be recovered: ${issueId}`);
  return row.issue_id;
}

async function reserveWorkGroupAllocation(
  client: DbClient,
  repositoryId: DbId,
  issueNumber: number,
  issuePolicy: WorkGroupIssuePolicy,
  allocationKey: string,
  requestFingerprint: string,
  issueId: string,
  repositoryKey: string
): Promise<AllocationRow> {
  const result = await client.query<AllocationRow>(`
    with next_sequence as (
      insert into hcp.harness_work_group_counter (
        repository_id, registration_issue_number, issue_policy, last_sequence
      ) values ($1, $2, $3, 1)
      on conflict (repository_id, registration_issue_number) do update
      set last_sequence = hcp.harness_work_group_counter.last_sequence + 1,
          updated_at = now()
      where hcp.harness_work_group_counter.issue_policy = excluded.issue_policy
      returning last_sequence
    )
    insert into hcp.harness_id_allocation (
      allocation_key, request_fingerprint, entity_type, repository_id,
      issue_id, issue_number, issue_sequence, entity_id, status
    )
    select $4, $5, 'work_group', $1, $6, $2, next_sequence.last_sequence,
           'WG-' || $7 || '-' || $2::text || '-' || lpad(next_sequence.last_sequence::text, 3, '0'),
           'reserved'
    from next_sequence
    returning allocation_key, request_fingerprint, entity_type, repository_id,
              issue_id, issue_number, issue_sequence, entity_id, status
  `, [repositoryId, issueNumber, issuePolicy, allocationKey, requestFingerprint, issueId, repositoryKey]);
  const row = result.rows[0];
  if (!row) {
    throw new RegistryPolicyError("registration Issue policy is already bound and cannot be changed");
  }
  return row;
}

async function reserveTaskAllocation(
  client: DbClient,
  repositoryId: DbId,
  issueNumber: number,
  issuePolicy: TaskIssuePolicy,
  allocationKey: string,
  requestFingerprint: string,
  issueId: string,
  repositoryKey: string
): Promise<AllocationRow> {
  const result = await client.query<AllocationRow>(`
    with next_sequence as (
      insert into hcp.harness_task_counter (
        repository_id, execution_issue_number, issue_policy, last_sequence
      ) values ($1, $2, $3, 1)
      on conflict (repository_id, execution_issue_number) do update
      set last_sequence = hcp.harness_task_counter.last_sequence + 1,
          updated_at = now()
      where hcp.harness_task_counter.issue_policy = excluded.issue_policy
      returning last_sequence
    )
    insert into hcp.harness_id_allocation (
      allocation_key, request_fingerprint, entity_type, repository_id,
      issue_id, issue_number, issue_sequence, entity_id, status
    )
    select $4, $5, 'task', $1, $6, $2, next_sequence.last_sequence,
           'TSK-' || $7 || '-' || $2::text || '-' || lpad(next_sequence.last_sequence::text, 3, '0'),
           'reserved'
    from next_sequence
    returning allocation_key, request_fingerprint, entity_type, repository_id,
              issue_id, issue_number, issue_sequence, entity_id, status
  `, [repositoryId, issueNumber, issuePolicy, allocationKey, requestFingerprint, issueId, repositoryKey]);
  const row = result.rows[0];
  if (!row) {
    throw new RegistryPolicyError("execution Issue policy is already bound and cannot be changed");
  }
  return row;
}

async function reuseWorkGroupAllocation(
  client: DbClient,
  allocationKey: string,
  requestFingerprint: string
): Promise<WorkGroupAllocation | undefined> {
  const allocation = await readAllocation(client, allocationKey, requestFingerprint, "work_group");
  if (!allocation) return undefined;
  const result = await client.query<WorkGroupRow>(`
    select work_group_id, repository_id, registration_issue_id, issue_sequence, allocation_key, issue_policy
    from hcp.harness_work_group
    where work_group_id = $1
  `, [allocation.entity_id]);
  const row = result.rows[0];
  if (!row) throw new RegistryPolicyError(`allocated WG row is missing: ${allocation.entity_id}`);
  return mapWorkGroup(row, true);
}

async function reuseTaskAllocation(
  client: DbClient,
  allocationKey: string,
  requestFingerprint: string
): Promise<RegistryTaskAllocation | undefined> {
  const allocation = await readAllocation(client, allocationKey, requestFingerprint, "task");
  if (!allocation) return undefined;
  const result = await client.query<TaskRow>(`
    select task_id, repository_id, work_group_id, execution_issue_id,
           issue_sequence, allocation_key, issue_policy
    from hcp.harness_task
    where task_id = $1
  `, [allocation.entity_id]);
  const row = result.rows[0];
  if (!row) throw new RegistryPolicyError(`allocated Task row is missing: ${allocation.entity_id}`);
  return mapTask(row, true);
}

async function readAllocation(
  client: DbClient,
  allocationKey: string,
  requestFingerprint: string,
  entityType: "work_group" | "task"
): Promise<AllocationRow | undefined> {
  const result = await client.query<AllocationRow>(`
    select allocation_key, request_fingerprint, entity_type, repository_id,
           issue_id, issue_number, issue_sequence, entity_id, status
    from hcp.harness_id_allocation
    where allocation_key = $1
  `, [allocationKey]);
  const row = result.rows[0];
  if (!row) return undefined;
  if (row.entity_type !== entityType || row.request_fingerprint !== requestFingerprint) {
    throw new RegistryPolicyError("allocationKey is already bound to a different immutable request fingerprint");
  }
  if (row.status === "tombstoned") {
    throw new RegistryPolicyError(`allocationKey is tombstoned and cannot be reused: ${allocationKey}`);
  }
  if (row.status !== "allocated") {
    throw new RegistryPolicyError(`allocationKey has unresolved reservation status: ${row.status}`);
  }
  return row;
}

async function finalizeAllocation(
  client: DbClient,
  allocationKey: string,
  status: "allocated" | "tombstoned",
  failureReason?: string
): Promise<void> {
  const result = await client.query<{ allocation_key: string }>(`
    update hcp.harness_id_allocation
    set status = $2,
        failure_reason = $3,
        finalized_at = now(),
        updated_at = now()
    where allocation_key = $1 and status = 'reserved'
    returning allocation_key
  `, [allocationKey, status, failureReason?.slice(0, 2000) ?? null]);
  if (!result.rows[0]) throw new Error(`allocation finalization failed: ${allocationKey}`);
}

async function acquireAllocationLock(client: DbClient, lockKey: string): Promise<void> {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
}

function allocationFingerprint(input: Record<string, string | number>): string {
  const canonical = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function assertIssueCoordinate(repository: RepositoryRow, issue: Required<ExternalIssueEvidence>): void {
  const expected = `https://github.com/${repository.repository_full_name}/issues/${issue.number}`.toLowerCase();
  const actual = issue.url.replace(/\/$/, "").toLowerCase();
  if (actual !== expected) {
    throw new RegistryPolicyError(`Issue URL must match registered repository coordinate: ${expected}`);
  }
}

async function linkIssueRole(
  client: DbClient,
  issueId: string,
  ownerType: "work_group" | "task",
  ownerId: string,
  issueRole: "registration" | "execution"
): Promise<void> {
  await client.query(`
    insert into hcp.harness_issue_role (issue_id, owner_type, owner_id, issue_role)
    values ($1, $2, $3, $4)
    on conflict (issue_id, owner_type, owner_id, issue_role) do nothing
  `, [issueId, ownerType, ownerId, issueRole]);
}

async function countRows(client: DbClient, sql: string, values: unknown[]): Promise<number> {
  const result = await client.query<{ count: number | string }>(sql, values);
  const count = Number(result.rows[0]?.count ?? 0);
  if (!Number.isInteger(count) || count < 0) throw new Error("invalid registry row count");
  return count;
}

function resolveWorkGroupAllocationKey(
  input: WorkGroupAllocationRequest,
  repositoryKey: string,
  issueNumber: number,
  issuePolicy: WorkGroupIssuePolicy
): string {
  if (input.allocationKey?.trim()) return input.allocationKey.trim();
  if (issuePolicy === "shared_registration") {
    throw new RegistryPolicyError("shared_registration requires an explicit allocationKey");
  }
  return `wg:${repositoryKey}:${issueNumber}`;
}

function resolveTaskAllocationKey(
  input: RegistryTaskAllocationRequest,
  repositoryKey: string,
  issueNumber: number,
  issuePolicy: TaskIssuePolicy
): string {
  if (input.allocationKey?.trim()) return input.allocationKey.trim();
  if (issuePolicy === "shared_umbrella") {
    throw new RegistryPolicyError("shared_umbrella requires an explicit allocationKey");
  }
  return `task:${repositoryKey}:${issueNumber}`;
}

function mapRepository(row: RepositoryRow, reused: boolean): RegistryRepository {
  return {
    repositoryId: row.repository_id,
    repositoryKey: row.repository_key,
    provider: row.provider,
    repositoryFullName: row.repository_full_name,
    canonicalUrl: row.canonical_url,
    lifecyclePolicy: row.lifecycle_policy,
    status: row.status,
    reused
  };
}

function mapWorkGroup(row: WorkGroupRow, reused: boolean): WorkGroupAllocation {
  return {
    workGroupId: row.work_group_id,
    repositoryId: row.repository_id,
    registrationIssueId: row.registration_issue_id,
    issueSequence: Number(row.issue_sequence),
    allocationKey: row.allocation_key,
    issuePolicy: row.issue_policy,
    reused
  };
}

function mapTask(row: TaskRow, reused: boolean): RegistryTaskAllocation {
  return {
    taskId: row.task_id,
    repositoryId: row.repository_id,
    workGroupId: row.work_group_id,
    executionIssueId: row.execution_issue_id,
    issueSequence: Number(row.issue_sequence),
    allocationKey: row.allocation_key,
    issuePolicy: row.issue_policy,
    reused
  };
}

function requiredText(value: string, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryPolicyError(`${label} is required`);
  return normalized;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new RegistryPolicyError(`${label} must be a positive integer`);
  return value;
}

function formatSequence(sequence: number): string {
  return String(positiveInteger(sequence, "issue-local sequence")).padStart(3, "0");
}
