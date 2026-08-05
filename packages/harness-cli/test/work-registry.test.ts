import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import type { DbClient, DbQueryResult } from "../src/db/db-client.ts";
import {
  RegistryPolicyError,
  allocateRegistryTask,
  bootstrapWorkGroup,
  formatTaskId,
  formatWorkGroupId,
  normalizeRepositoryKey,
  registerRepository
} from "../src/db/work-registry.ts";

type Row = Record<string, unknown>;
type Handler = (sql: string, values: unknown[]) => Row[];

class FakeDbClient implements DbClient {
  readonly calls: { sql: string; values: unknown[] }[] = [];
  private readonly handler: Handler;
  constructor(handler: Handler) {
    this.handler = handler;
  }

  async query<ResultRow = Row>(sql: string, values: unknown[] = []): Promise<DbQueryResult<ResultRow>> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.calls.push({ sql: normalized, values });
    return { rows: this.handler(normalized, values) as ResultRow[] };
  }

  async end(): Promise<void> {}
}

const repositoryRow = {
  repository_id: 7,
  repository_key: "JKADH",
  provider: "github",
  repository_full_name: "jkoogit/jkadh",
  canonical_url: "https://github.com/jkoogit/jkadh",
  lifecycle_policy: "dev->stg->main",
  status: "active"
};

function verifiedIssue(number = 181, title = "PLAN", owner = "jkoogit/jkadh") {
  return {
    number,
    title,
    url: `https://github.com/${owner}/issues/${number}`,
    status: "open" as const,
    verificationSource: "github" as const,
    verifiedAt: new Date().toISOString()
  };
}

function controlQuery(sql: string): boolean {
  return sql === "begin" || sql === "commit" || sql === "rollback"
    || sql.startsWith("savepoint ") || sql.startsWith("release savepoint ")
    || sql.startsWith("rollback to savepoint ") || sql.startsWith("select pg_advisory_xact_lock");
}

test("permanent WG and Task IDs use normalized repository and issue-local sequence", () => {
  assert.equal(normalizeRepositoryKey("jkadh"), "JKADH");
  assert.equal(formatWorkGroupId("jkadh", 181, 1), "WG-JKADH-181-001");
  assert.equal(formatTaskId("JKADH", 181, 12), "TSK-JKADH-181-012");
  assert.throws(() => normalizeRepositoryKey("bad_key"), RegistryPolicyError);
});

test("repository registration validates canonical URL and serializes immutable coordinates", async () => {
  const client = new FakeDbClient((sql) => {
    if (controlQuery(sql)) return [];
    if (sql.includes("where repository_key = $1")) return [];
    if (sql.includes("where provider = $1 and repository_full_name = $2")) return [];
    if (sql.startsWith("insert into hcp.harness_repository")) return [repositoryRow];
    throw new Error(`unexpected query: ${sql}`);
  });

  const result = await registerRepository(client, {
    repositoryKey: "jkadh",
    repositoryFullName: "JKOOGIT/JKADH",
    canonicalUrl: "HTTPS://GITHUB.COM/JKOOGIT/JKADH/",
    lifecyclePolicy: "dev->stg->main"
  });
  assert.equal(result.repositoryKey, "JKADH");
  assert.equal(client.calls.filter((call) => call.sql.startsWith("select pg_advisory_xact_lock")).length, 2);
  await assert.rejects(() => registerRepository(new FakeDbClient(() => []), {
    repositoryKey: "JKADH",
    repositoryFullName: "jkoogit/jkadh",
    canonicalUrl: "https://example.com/jkoogit/jkadh",
    lifecyclePolicy: "dev->stg->main"
  }), /canonical URL/);
});

test("repositoryKey cannot be rebound to another remote coordinate", async () => {
  const client = new FakeDbClient((sql) => {
    if (controlQuery(sql)) return [];
    if (sql.includes("where repository_key = $1")) return [{ ...repositoryRow, repository_full_name: "other/repo" }];
    throw new Error(`unexpected query: ${sql}`);
  });
  await assert.rejects(() => registerRepository(client, {
    repositoryKey: "JKADH",
    repositoryFullName: "jkoogit/jkadh",
    lifecyclePolicy: "dev->stg->main"
  }), /immutable/);
  assert.equal(client.calls.at(-1)?.sql, "rollback");
});

test("WG bootstrap verifies evidence, reserves after Issue, and finalizes allocation", async () => {
  const reservation = {
    allocation_key: "wg:JKADH:181",
    request_fingerprint: "a".repeat(64),
    entity_type: "work_group",
    repository_id: 7,
    issue_id: "github:JKADH:181",
    issue_number: 181,
    issue_sequence: 1,
    entity_id: "WG-JKADH-181-001",
    status: "reserved"
  };
  const client = new FakeDbClient((sql) => {
    if (controlQuery(sql)) return [];
    if (sql.includes("from hcp.harness_repository")) return [repositoryRow];
    if (sql.includes("from hcp.harness_id_allocation") && sql.includes("where allocation_key")) return [];
    if (sql.startsWith("insert into hcp.harness_issue")) return [{ issue_id: reservation.issue_id }];
    if (sql.includes("select count(*)::int as count")) return [{ count: 0 }];
    if (sql.startsWith("with next_sequence as") && sql.includes("harness_work_group_counter")) return [reservation];
    if (sql.startsWith("insert into hcp.harness_work_group")) return [{
      work_group_id: reservation.entity_id,
      repository_id: 7,
      registration_issue_id: reservation.issue_id,
      issue_sequence: 1,
      allocation_key: reservation.allocation_key,
      issue_policy: "dedicated"
    }];
    if (sql.startsWith("insert into hcp.harness_issue_role")) return [];
    if (sql.startsWith("update hcp.harness_id_allocation")) return [{ allocation_key: reservation.allocation_key }];
    throw new Error(`unexpected query: ${sql}`);
  });

  const result = await bootstrapWorkGroup(client, {
    repositoryKey: "JKADH",
    registrationIssue: verifiedIssue(),
    title: "PLAN"
  });
  assert.equal(result.workGroupId, reservation.entity_id);
  const issueIndex = client.calls.findIndex((call) => call.sql.startsWith("insert into hcp.harness_issue"));
  const reserveIndex = client.calls.findIndex((call) => call.sql.startsWith("with next_sequence as"));
  assert.ok(issueIndex >= 0 && issueIndex < reserveIndex);
  assert.match(client.calls[reserveIndex].sql, /insert into hcp\.harness_id_allocation/);
  assert.equal(client.calls.at(-1)?.sql, "commit");
});

test("allocation failure after reservation commits a non-reusable tombstone", async () => {
  const client = new FakeDbClient((sql, values) => {
    if (controlQuery(sql)) return [];
    if (sql.includes("from hcp.harness_repository")) return [repositoryRow];
    if (sql.includes("from hcp.harness_id_allocation")) return [];
    if (sql.startsWith("insert into hcp.harness_issue")) return [{ issue_id: "github:JKADH:181" }];
    if (sql.includes("select count(*)::int as count")) return [{ count: 0 }];
    if (sql.startsWith("with next_sequence as")) return [{
      allocation_key: "wg:JKADH:181", request_fingerprint: "b".repeat(64), entity_type: "work_group",
      repository_id: 7, issue_id: "github:JKADH:181", issue_number: 181, issue_sequence: 2,
      entity_id: "WG-JKADH-181-002", status: "reserved"
    }];
    if (sql.startsWith("insert into hcp.harness_work_group")) throw new Error("entity insert failed");
    if (sql.startsWith("update hcp.harness_id_allocation")) {
      assert.equal(values[1], "tombstoned");
      return [{ allocation_key: "wg:JKADH:181" }];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  await assert.rejects(() => bootstrapWorkGroup(client, {
    repositoryKey: "JKADH", registrationIssue: verifiedIssue(), title: "PLAN"
  }), /tombstoned after allocation failure/);
  assert.equal(client.calls.at(-1)?.sql, "commit");
  assert.ok(client.calls.filter((call) => call.sql === "begin").length >= 3);
  assert.ok(client.calls.some((call) => call.sql === "rollback"));
});

test("unknown reservation commit never allocates another number for the same allocationKey", async () => {
  let allocation: Row | undefined;
  let failCommit = true;
  let counterAllocations = 0;
  const handler: Handler = (sql, values) => {
    if (sql === "commit" && failCommit) {
      failCommit = false;
      throw new Error("connection lost while waiting for commit response");
    }
    if (controlQuery(sql)) return [];
    if (sql.includes("from hcp.harness_id_allocation") && sql.includes("where allocation_key")) {
      return allocation ? [allocation] : [];
    }
    if (sql.includes("from hcp.harness_repository")) return [repositoryRow];
    if (sql.startsWith("insert into hcp.harness_issue")) return [{ issue_id: "github:JKADH:181" }];
    if (sql.includes("select count(*)::int as count")) return [{ count: 0 }];
    if (sql.startsWith("with next_sequence as")) {
      counterAllocations += 1;
      allocation = {
        allocation_key: values[3], request_fingerprint: values[4], entity_type: "work_group",
        repository_id: 7, issue_id: "github:JKADH:181", issue_number: 181, issue_sequence: 1,
        entity_id: "WG-JKADH-181-001", status: "reserved"
      };
      return [allocation];
    }
    throw new Error(`unexpected query: ${sql}`);
  };
  const input = {
    repositoryKey: "JKADH",
    registrationIssue: verifiedIssue(),
    title: "PLAN",
    allocationKey: "wg:JKADH:181"
  };

  await assert.rejects(() => bootstrapWorkGroup(new FakeDbClient(handler), input), /operation_result_unknown.*operationKey=wg:JKADH:181/);
  await assert.rejects(() => bootstrapWorkGroup(new FakeDbClient(handler), input), /unresolved reservation status: reserved/);
  assert.equal(counterAllocations, 1);
});

test("allocationKey reuses only the same immutable request fingerprint", async () => {
  let allocation: Row | undefined;
  const workGroup = {
    work_group_id: "WG-JKADH-181-001", repository_id: 7, registration_issue_id: "github:JKADH:181",
    issue_sequence: 1, allocation_key: "wg:JKADH:181", issue_policy: "dedicated"
  };
  const client = new FakeDbClient((sql, values) => {
    if (controlQuery(sql)) return [];
    if (sql.includes("from hcp.harness_repository")) return [repositoryRow];
    if (sql.includes("from hcp.harness_id_allocation")) return allocation ? [allocation] : [];
    if (sql.startsWith("insert into hcp.harness_issue")) return [{ issue_id: "github:JKADH:181" }];
    if (sql.includes("select count(*)::int as count")) return [{ count: 0 }];
    if (sql.startsWith("with next_sequence as")) {
      allocation = {
        allocation_key: values[3], request_fingerprint: values[4], entity_type: "work_group",
        repository_id: 7, issue_id: "github:JKADH:181", issue_number: 181, issue_sequence: 1,
        entity_id: workGroup.work_group_id, status: "reserved"
      };
      return [allocation];
    }
    if (sql.startsWith("insert into hcp.harness_work_group")) return [workGroup];
    if (sql.startsWith("insert into hcp.harness_issue_role")) return [];
    if (sql.startsWith("update hcp.harness_id_allocation")) {
      allocation = { ...allocation, status: values[1] };
      return [{ allocation_key: values[0] }];
    }
    if (sql.includes("from hcp.harness_work_group") && sql.includes("where work_group_id")) return [workGroup];
    throw new Error(`unexpected query: ${sql}`);
  });

  const first = await bootstrapWorkGroup(client, { repositoryKey: "JKADH", registrationIssue: verifiedIssue(), title: "PLAN" });
  const repositoryQueriesAfterAllocation = client.calls.filter((call) => call.sql.includes("from hcp.harness_repository")).length;
  const replay = await bootstrapWorkGroup(client, {
    repositoryKey: "JKADH",
    registrationIssue: { ...verifiedIssue(), status: "closed", verifiedAt: "2020-01-01T00:00:00.000Z" },
    title: "PLAN"
  });
  assert.equal(first.reused, false);
  assert.equal(replay.reused, true);
  assert.equal(
    client.calls.filter((call) => call.sql.includes("from hcp.harness_repository")).length,
    repositoryQueriesAfterAllocation
  );
  await assert.rejects(() => bootstrapWorkGroup(client, {
    repositoryKey: "JKADH", registrationIssue: verifiedIssue(), title: "DIFFERENT"
  }), /different immutable request fingerprint/);
});

test("shared Issue policies and stale Issue evidence fail closed before DB allocation", async () => {
  const client = new FakeDbClient(() => []);
  await assert.rejects(() => bootstrapWorkGroup(client, {
    repositoryKey: "JKADH", registrationIssue: verifiedIssue(), title: "shared",
    issuePolicy: "shared_registration", allocationKey: "wg:JKADH:181:2"
  }), /explicit approval/);
  await assert.rejects(() => allocateRegistryTask(client, {
    repositoryKey: "JKADH", workGroupId: "WG-JKADH-181-001", executionIssue: verifiedIssue(),
    sessionId: "codex_ses_026_20260731_001", taskName: "shared",
    issuePolicy: "shared_umbrella", allocationKey: "task:JKADH:181:2"
  }), /explicit approval/);
  const stale = { ...verifiedIssue(), verifiedAt: "2020-01-01T00:00:00.000Z" };
  await assert.rejects(() => bootstrapWorkGroup(client, {
    repositoryKey: "JKADH", registrationIssue: stale, title: "PLAN"
  }), /stale or invalid/);
  assert.equal(client.calls.some((call) => call.sql.includes("from hcp.harness_repository")), false);
  assert.equal(client.calls.some((call) => call.sql.startsWith("with next_sequence as")), false);
});

test("tombstoned and unresolved allocation replay never consumes another sequence", async () => {
  const fingerprint = requestFingerprint({
    entityType: "work_group",
    repositoryKey: "JKADH",
    issueProvider: "github",
    issueNumber: 181,
    issueUrl: "https://github.com/jkoogit/jkadh/issues/181",
    title: "PLAN",
    issuePolicy: "dedicated"
  });
  for (const status of ["tombstoned", "reserved"] as const) {
    const client = new FakeDbClient((sql) => {
      if (controlQuery(sql)) return [];
      if (sql.includes("from hcp.harness_id_allocation")) return [{
        allocation_key: "wg:JKADH:181", request_fingerprint: fingerprint, entity_type: "work_group",
        repository_id: 7, issue_id: "github:JKADH:181", issue_number: 181, issue_sequence: 1,
        entity_id: "WG-JKADH-181-001", status
      }];
      throw new Error(`new allocation query must not run for ${status}: ${sql}`);
    });
    await assert.rejects(() => bootstrapWorkGroup(client, {
      repositoryKey: "JKADH", registrationIssue: verifiedIssue(), title: "PLAN"
    }), status === "tombstoned" ? /tombstoned and cannot be reused/ : /unresolved reservation status: reserved/);
    assert.equal(client.calls.some((call) => call.sql.startsWith("with next_sequence as")), false);
  }
});

test("Task allocation binds execution Issue policy and role", async () => {
  const reservation = {
    allocation_key: "task:JKADH:181", request_fingerprint: "c".repeat(64), entity_type: "task",
    repository_id: 7, issue_id: "github:JKADH:181", issue_number: 181, issue_sequence: 1,
    entity_id: "TSK-JKADH-181-001", status: "reserved"
  };
  let allocation: Row | undefined;
  const taskRow = {
    task_id: reservation.entity_id, repository_id: 7, work_group_id: "WG-JKADH-181-001",
    execution_issue_id: reservation.issue_id, issue_sequence: 1,
    allocation_key: reservation.allocation_key, issue_policy: "dedicated"
  };
  const client = new FakeDbClient((sql, values) => {
    if (controlQuery(sql)) return [];
    if (sql.includes("from hcp.harness_repository")) return [repositoryRow];
    if (sql.includes("from hcp.harness_work_group") && sql.includes("status in")) return [{ work_group_id: "WG-JKADH-181-001" }];
    if (sql.includes("from hcp.harness_id_allocation")) return allocation ? [allocation] : [];
    if (sql.startsWith("insert into hcp.harness_issue")) return [{ issue_id: reservation.issue_id }];
    if (sql.includes("select count(*)::int as count")) return [{ count: 0 }];
    if (sql.startsWith("with next_sequence as") && sql.includes("harness_task_counter")) {
      allocation = { ...reservation, allocation_key: values[3], request_fingerprint: values[4] };
      return [allocation];
    }
    if (sql.startsWith("insert into hcp.harness_task (")) return [taskRow];
    if (sql.startsWith("insert into hcp.harness_issue_role")) return [];
    if (sql.startsWith("update hcp.harness_id_allocation")) {
      allocation = { ...allocation, status: values[1] };
      return [{ allocation_key: reservation.allocation_key }];
    }
    if (sql.includes("from hcp.harness_task") && sql.includes("where task_id")) return [taskRow];
    throw new Error(`unexpected query: ${sql}`);
  });
  const result = await allocateRegistryTask(client, {
    repositoryKey: "JKADH", workGroupId: "WG-JKADH-181-001", executionIssue: verifiedIssue(),
    sessionId: "codex_ses_026_20260731_001", taskName: "PLAN"
  });
  assert.equal(result.taskId, reservation.entity_id);
  assert.equal(result.issuePolicy, "dedicated");
  const lifecycleQueriesAfterAllocation = client.calls.filter((call) =>
    call.sql.includes("from hcp.harness_repository") || call.sql.includes("status in ('planned', 'active')")
  ).length;
  const replay = await allocateRegistryTask(client, {
    repositoryKey: "JKADH", workGroupId: "WG-JKADH-181-001",
    executionIssue: { ...verifiedIssue(), status: "closed", verifiedAt: "2020-01-01T00:00:00.000Z" },
    sessionId: "codex_ses_026_20260731_001", taskName: "PLAN"
  });
  assert.equal(replay.reused, true);
  assert.equal(client.calls.filter((call) =>
    call.sql.includes("from hcp.harness_repository") || call.sql.includes("status in ('planned', 'active')")
  ).length, lifecycleQueriesAfterAllocation);
  const reserve = client.calls.find((call) => call.sql.startsWith("with next_sequence as"));
  assert.match(reserve?.sql ?? "", /harness_task_counter[\s\S]*issue_policy/);
});

test("Issue evidence must match the registered repository coordinate", async () => {
  const client = new FakeDbClient((sql) => {
    if (controlQuery(sql)) return [];
    if (sql.includes("from hcp.harness_repository")) return [repositoryRow];
    if (sql.includes("from hcp.harness_id_allocation")) return [];
    throw new Error(`unexpected query: ${sql}`);
  });
  await assert.rejects(() => bootstrapWorkGroup(client, {
    repositoryKey: "JKADH", registrationIssue: verifiedIssue(181, "PLAN", "other/repo"), title: "PLAN"
  }), /registered repository coordinate/);
  assert.equal(client.calls.at(-1)?.sql, "rollback");
});

function requestFingerprint(input: Record<string, string | number>): string {
  const canonical = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
