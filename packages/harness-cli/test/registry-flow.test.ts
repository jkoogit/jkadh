import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { DbClient, DbQueryResult } from "../src/db/db-client.ts";
import { runRegistryCli } from "../src/flows/registry-flow.ts";

function configuredRepoRoot(env = "local", database = "jkadh_dev"): string {
  const root = mkdtempSync(join(tmpdir(), "jkadh-registry-flow-"));
  writeFileSync(join(root, ".env"), [
    `JKADH_ENV=${env}`, "JKADH_DB_HOST=localhost", "JKADH_DB_PORT=5432",
    `JKADH_DB_NAME=${database}`, "JKADH_DB_USER=test", "JKADH_DB_PASSWORD=test"
  ].join("\n"));
  return root;
}

class FlowDbClient implements DbClient {
  private readonly closeError?: Error;
  constructor(closeError?: Error) {
    this.closeError = closeError;
  }
  async query<Row = Record<string, unknown>>(sql: string): Promise<DbQueryResult<Row>> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.includes("from hcp.harness_repository") && normalized.includes("status = 'active'")) {
      return { rows: [{
        repository_id: 7, repository_key: "JKADH", provider: "github", repository_full_name: "jkoogit/jkadh",
        canonical_url: "https://github.com/jkoogit/jkadh", lifecycle_policy: "dev->stg->main", status: "active"
      }] as Row[] };
    }
    if (["begin", "commit", "rollback"].includes(normalized) || normalized.startsWith("select pg_advisory_xact_lock")) {
      return { rows: [] };
    }
    if (normalized.includes("from hcp.harness_id_allocation")) return { rows: [] };
    if (normalized.includes("where repository_key = $1") || normalized.includes("where provider = $1 and repository_full_name = $2")) {
      return { rows: [] };
    }
    if (normalized.startsWith("insert into hcp.harness_repository")) {
      return { rows: [{
        repository_id: 7, repository_key: "JKADH", provider: "github", repository_full_name: "jkoogit/jkadh",
        canonical_url: "https://github.com/jkoogit/jkadh", lifecycle_policy: "dev->stg->main", status: "active"
      }] as Row[] };
    }
    throw new Error(`unexpected query: ${normalized}`);
  }
  async end(): Promise<void> {
    if (this.closeError) throw this.closeError;
  }
}

class FailingQueryFlowDbClient implements DbClient {
  async query<Row = Record<string, unknown>>(sql: string): Promise<DbQueryResult<Row>> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized === "begin") return { rows: [] };
    if (normalized === "rollback") throw new Error("rollback connection lost");
    throw new Error("registry query connection lost");
  }

  async end(): Promise<void> {}
}

class StatefulWorkGroupFlowDbClient implements DbClient {
  private allocation: Record<string, unknown> | undefined;
  private readonly workGroup = {
    work_group_id: "WG-JKADH-181-001", repository_id: 7, registration_issue_id: "github:JKADH:181",
    issue_sequence: 1, allocation_key: "wg:JKADH:181", issue_policy: "dedicated"
  };
  repositoryActive = true;

  async query<Row = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<DbQueryResult<Row>> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (["begin", "commit", "rollback"].includes(normalized) || normalized.startsWith("savepoint ")
      || normalized.startsWith("release savepoint ") || normalized.startsWith("select pg_advisory_xact_lock")) {
      return { rows: [] };
    }
    if (normalized.includes("from hcp.harness_id_allocation")) {
      return { rows: (this.allocation ? [this.allocation] : []) as Row[] };
    }
    if (normalized.includes("from hcp.harness_repository") && normalized.includes("status = 'active'")) {
      return { rows: (this.repositoryActive ? [{
        repository_id: 7, repository_key: "JKADH", provider: "github", repository_full_name: "jkoogit/jkadh",
        canonical_url: "https://github.com/jkoogit/jkadh", lifecycle_policy: "dev->stg->main", status: "active"
      }] : []) as Row[] };
    }
    if (normalized.startsWith("insert into hcp.harness_issue")) return { rows: [{ issue_id: "github:JKADH:181" }] as Row[] };
    if (normalized.includes("select count(*)::int as count")) return { rows: [{ count: 0 }] as Row[] };
    if (normalized.startsWith("with next_sequence as") && normalized.includes("harness_work_group_counter")) {
      this.allocation = {
        allocation_key: values[3], request_fingerprint: values[4], entity_type: "work_group",
        repository_id: 7, issue_id: "github:JKADH:181", issue_number: 181, issue_sequence: 1,
        entity_id: this.workGroup.work_group_id, status: "reserved"
      };
      return { rows: [this.allocation] as Row[] };
    }
    if (normalized.startsWith("insert into hcp.harness_work_group")) return { rows: [this.workGroup] as Row[] };
    if (normalized.startsWith("insert into hcp.harness_issue_role")) return { rows: [] };
    if (normalized.startsWith("update hcp.harness_id_allocation")) {
      this.allocation = { ...this.allocation, status: values[1] };
      return { rows: [{ allocation_key: values[0] }] as Row[] };
    }
    if (normalized.includes("from hcp.harness_work_group") && normalized.includes("where work_group_id")) {
      return { rows: [this.workGroup] as Row[] };
    }
    throw new Error(`unexpected query: ${normalized}`);
  }

  async end(): Promise<void> {}
}

test("registry repository command is report-only without --execute", async () => {
  const result = await runRegistryCli(process.cwd(), "repository", [
    "register",
    "--repository-key", "JKADH",
    "--repository-full-name", "jkoogit/jkadh",
    "--lifecycle-policy", "dev->stg->main"
  ]);

  assert.equal(result.status, "planned");
  assert.match(result.markdown, /report-only/);
  assert.match(result.markdown, /immutable Repository registry row/);
});

test("shared registration command requires an explicit approval flag", async () => {
  const result = await runRegistryCli(process.cwd(), "work-group", [
    "bootstrap",
    "--repository-key", "JKADH",
    "--issue", "181",
    "--issue-title", "PLAN-REGISTRY",
    "--issue-url", "https://github.com/jkoogit/jkadh/issues/181",
    "--title", "PLAN-REGISTRY",
    "--issue-policy", "shared_registration"
  ]);

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /shared-registration-approved/);
});

test("execute mode verifies that the GitHub Issue is open before DB allocation", async () => {
  const result = await runRegistryCli(configuredRepoRoot(), "work-group", [
    "bootstrap", "--execute", "--repository-key", "JKADH", "--issue", "181",
    "--issue-title", "PLAN-REGISTRY", "--issue-url", "https://github.com/jkoogit/jkadh/issues/181",
    "--title", "PLAN-REGISTRY"
  ], {
    createClient: async () => new FlowDbClient(),
    commandRunner: {
      run: () => JSON.stringify({
        number: 181, state: "CLOSED", title: "PLAN-REGISTRY",
        url: "https://github.com/jkoogit/jkadh/issues/181"
      })
    }
  });
  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /must be OPEN/);
});

test("GitHub lookup failure blocks without starting a mutation transaction", async () => {
  const client = new FlowDbClient();
  const result = await runRegistryCli(configuredRepoRoot(), "task", [
    "allocate", "--execute", "--repository-key", "JKADH", "--work-group-id", "WG-JKADH-181-001",
    "--issue", "999", "--issue-title", "missing", "--issue-url", "https://github.com/jkoogit/jkadh/issues/999",
    "--session-id", "codex_ses_026_20260731_001", "--task-name", "missing"
  ], {
    createClient: async () => client,
    commandRunner: { run: () => { throw new Error("issue not found"); } }
  });
  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /issue not found/);
});

test("GitHub timeout fails closed for a new allocation", async () => {
  const result = await runRegistryCli(configuredRepoRoot(), "work-group", [
    "bootstrap", "--execute", "--repository-key", "JKADH", "--issue", "181",
    "--issue-title", "PLAN-REGISTRY", "--issue-url", "https://github.com/jkoogit/jkadh/issues/181",
    "--title", "PLAN-REGISTRY"
  ], {
    createClient: async () => new FlowDbClient(),
    commandRunner: { run: () => { throw new Error("GitHub command timed out after 15000ms"); } }
  });
  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /timed out after 15000ms/);
});

test("DB connection failure returns a structured fail-closed result", async () => {
  const result = await runRegistryCli(configuredRepoRoot(), "repository", [
    "register", "--execute", "--repository-key", "JKADH", "--repository-full-name", "jkoogit/jkadh",
    "--lifecycle-policy", "dev->stg->main"
  ], {
    createClient: async () => { throw new Error("database unavailable"); }
  });
  assert.equal(result.status, "paused");
  assert.deepEqual(result.recovery, {
    failureKind: "db_unavailable",
    operationKey: "repository:JKADH",
    lastConfirmedBoundary: "db_config_validated",
    transactionResult: "not_started",
    retryAllowed: false,
    primaryStatus: "paused"
  });
  assert.match(result.markdown, /database unavailable/);
  assert.match(result.markdown, /read-only DB check/);
  assert.match(result.markdown, /JSON fallback.*not attempted/s);
});

test("DB query and rollback failure preserves the original mutation error", async () => {
  const result = await runRegistryCli(configuredRepoRoot(), "work-group", [
    "bootstrap", "--execute", "--repository-key", "JKADH", "--issue", "181",
    "--issue-title", "PLAN-REGISTRY", "--issue-url", "https://github.com/jkoogit/jkadh/issues/181",
    "--title", "PLAN-REGISTRY"
  ], {
    createClient: async () => new FailingQueryFlowDbClient(),
    commandRunner: { run: () => { throw new Error("GitHub must not run after DB failure"); } }
  });
  assert.equal(result.status, "paused");
  assert.match(result.markdown, /registry query connection lost/);
  assert.doesNotMatch(result.markdown, /rollback connection lost/);
});

test("unknown allocation commit result requires same-key recovery before retry", async () => {
  class UnknownCommitClient extends StatefulWorkGroupFlowDbClient {
    private commitCount = 0;

    override async query<Row = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<DbQueryResult<Row>> {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized === "commit" && ++this.commitCount === 2) {
        throw new Error("connection lost while waiting for commit response");
      }
      return super.query<Row>(sql, values);
    }
  }

  const result = await runRegistryCli(configuredRepoRoot(), "work-group", [
    "bootstrap", "--execute", "--repository-key", "JKADH", "--issue", "181",
    "--issue-title", "PLAN-REGISTRY", "--issue-url", "https://github.com/jkoogit/jkadh/issues/181",
    "--title", "PLAN-REGISTRY", "--allocation-key", "wg:JKADH:181"
  ], {
    createClient: async () => new UnknownCommitClient(),
    commandRunner: { run: () => JSON.stringify({
      number: 181, state: "OPEN", title: "PLAN-REGISTRY",
      url: "https://github.com/jkoogit/jkadh/issues/181"
    }) }
  });

  assert.equal(result.status, "recovery_required");
  assert.equal(result.recovery?.failureKind, "operation_result_unknown");
  assert.equal(result.recovery?.operationKey, "wg:JKADH:181");
  assert.equal(result.recovery?.transactionResult, "unknown");
  assert.equal(result.recovery?.retryAllowed, false);
  assert.match(result.markdown, /operation_result_unknown/);
  assert.match(result.markdown, /operationKey=wg:JKADH:181/);
  assert.match(result.markdown, /query the same operationKey/);
});

test("allocated replay returns DB result before repository and GitHub lifecycle checks", async () => {
  const client = new StatefulWorkGroupFlowDbClient();
  let githubCalls = 0;
  const args = [
    "bootstrap", "--execute", "--repository-key", "JKADH", "--issue", "181",
    "--issue-title", "PLAN-REGISTRY", "--issue-url", "https://github.com/jkoogit/jkadh/issues/181",
    "--title", "PLAN-REGISTRY"
  ];
  const first = await runRegistryCli(configuredRepoRoot(), "work-group", args, {
    createClient: async () => client,
    commandRunner: { run: () => {
      githubCalls += 1;
      return JSON.stringify({
        number: 181, state: "OPEN", title: "PLAN-REGISTRY",
        url: "https://github.com/jkoogit/jkadh/issues/181"
      });
    } }
  });
  assert.equal(first.status, "executed");
  client.repositoryActive = false;

  const replay = await runRegistryCli(configuredRepoRoot(), "work-group", args, {
    createClient: async () => client,
    commandRunner: { run: () => { throw new Error("GitHub must not run for allocated replay"); } }
  });
  assert.equal(replay.status, "executed");
  assert.match(replay.markdown, /"reused":true/);
  assert.equal(githubCalls, 1);
});

test("DB connection close failure returns a structured idempotent retry blocker", async () => {
  const result = await runRegistryCli(configuredRepoRoot(), "repository", [
    "register", "--execute", "--repository-key", "JKADH", "--repository-full-name", "jkoogit/jkadh",
    "--lifecycle-policy", "dev->stg->main"
  ], {
    createClient: async () => new FlowDbClient(new Error("socket close failed"))
  });
  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /"repositoryKey":"JKADH"/);
  assert.match(result.markdown, /committed/);
  assert.match(result.markdown, /confirm DB health before reusing the same idempotent request/);
  assert.match(result.markdown, /socket close failed/);
  assert.equal(result.recovery?.failureKind, "db_close_failed");
  assert.equal(result.recovery?.primaryStatus, "executed");
  assert.equal(result.recovery?.transactionResult, "committed");
  assert.equal(result.recovery?.closeFailure, "socket close failed");
});

test("execute mode blocks registry mutations outside local/dev jkadh_dev", async () => {
  let clientCreated = false;
  const result = await runRegistryCli(configuredRepoRoot("prd", "jkadh_prd"), "repository", [
    "register", "--execute", "--repository-key", "JKADH", "--repository-full-name", "jkoogit/jkadh",
    "--lifecycle-policy", "dev->stg->main"
  ], {
    createClient: async () => {
      clientCreated = true;
      return new FlowDbClient();
    }
  });

  assert.equal(result.status, "blocked");
  assert.equal(clientCreated, false);
  assert.equal(result.recovery?.failureKind, "db_config_blocked");
  assert.equal(result.recovery?.transactionResult, "not_started");
  assert.match(result.markdown, /local or dev.*jkadh_dev/s);
});
