import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createDbClient, type DbClient } from "../src/db/db-client.ts";
import { loadDbConfig } from "../src/db/db-config.ts";
import {
  acquireRegistryTestRunLock,
  cleanupRegistryTestDatabase,
  markRegistryTestDatabaseCreated,
  recoverPendingRegistryTestDatabase,
  releaseRegistryTestRunLock,
  reserveRegistryTestDatabase,
  resolveRegistryTestRecoveryFile
} from "../src/db/registry-test-recovery.ts";
import {
  isSupportedRegistryPostgresqlVersion,
  validateRegistryDevelopmentDbConfig
} from "../src/db/registry-verification-policy.ts";
import {
  allocateRegistryTask,
  bootstrapWorkGroup,
  registerRepository,
  type ExternalIssueEvidence
} from "../src/db/work-registry.ts";

const enabled = process.env.JKADH_RUN_DB_INTEGRATION === "true";
const repoRoot = join(import.meta.dirname, "../../..");
const preRegistryBaselineFiles = [
  "packages/harness-cli/baseline/001_init_schema.sql",
  "packages/harness-cli/baseline/002_seed_core_dictionary.sql"
];
const registryBaselineFile = "packages/harness-cli/baseline/003_create_hcp_registry.sql";
const pendingMigrationFiles = [
  "packages/harness-cli/migrations/008_create_hcp_task_tables.sql",
  "packages/harness-cli/migrations/009_create_hcp_pr_backlog_tables.sql",
  "packages/harness-cli/migrations/010_create_hcp_issue_branch_tables.sql",
  "packages/harness-cli/migrations/011_create_hcp_registry_tables.sql"
];

test("production registry DDL and services preserve concurrent issue-local allocation invariants", { skip: !enabled }, async (context) => {
  const loaded = loadDbConfig(repoRoot);
  assert.ok(loaded.config, `configured development DB blocked: ${loaded.missing.join(", ")}`);
  const config = loaded.config;
  assert.deepEqual(validateRegistryDevelopmentDbConfig(config, "registry PostgreSQL integration"), []);
  const databaseName = `jkadh_registry_it_${randomUUID().replace(/-/g, "")}`;
  assert.match(databaseName, /^[a-z0-9_]+$/);
  const recoveryFile = resolveRegistryTestRecoveryFile(repoRoot);
  const runLock = acquireRegistryTestRunLock(recoveryFile);
  let admin: DbClient | undefined;
  const clients: DbClient[] = [];
  let databaseReserved = false;
  const openClient = async (): Promise<DbClient> => {
    const client = await createDbClient({ ...config, database: databaseName });
    clients.push(client);
    return client;
  };

  try {
    admin = await createDbClient(config);
    const serverVersion = await admin.query<{ server_version: string }>("show server_version");
    const version = serverVersion.rows[0]?.server_version ?? "unknown";
    context.diagnostic(`postgresql-version: ${version}`);
    const recoveredDatabase = await recoverPendingRegistryTestDatabase(admin, config, recoveryFile);
    if (recoveredDatabase) context.diagnostic(`temporary-database-recovered: ${recoveredDatabase}`);
    assert.equal(isSupportedRegistryPostgresqlVersion(version), true, `unsupported PostgreSQL version: ${version}`);
    reserveRegistryTestDatabase(recoveryFile, config, databaseName);
    databaseReserved = true;
    context.diagnostic(`temporary-database-reserved: ${databaseName}`);
    await admin.query(`create database ${databaseName} template template0`);
    markRegistryTestDatabaseCreated(recoveryFile, config, databaseName);
    context.diagnostic(`temporary-database-created: ${databaseName}`);
    const setup = await openClient();
    for (const relativePath of preRegistryBaselineFiles) {
      await setup.query(readFileSync(join(repoRoot, relativePath), "utf8"));
    }
    await setup.query("begin");
    try {
      for (const relativePath of pendingMigrationFiles) {
        await setup.query(readFileSync(join(repoRoot, relativePath), "utf8"));
      }
      const migrated = await setup.query<{ registry_table: string | null; counter_table: string | null }>(`
        select to_regclass('hcp.harness_repository')::text as registry_table,
               to_regclass('hcp.harness_work_group_counter')::text as counter_table
      `);
      assert.deepEqual(migrated.rows[0], {
        registry_table: "hcp.harness_repository",
        counter_table: "hcp.harness_work_group_counter"
      });
      await setup.query("rollback");
    } catch (error) {
      await setup.query("rollback");
      throw error;
    }
    const rolledBack = await setup.query<{ registry_table: string | null }>(`
      select to_regclass('hcp.harness_repository')::text as registry_table
    `);
    assert.equal(rolledBack.rows[0]?.registry_table, null);
    await setup.query(readFileSync(join(repoRoot, registryBaselineFile), "utf8"));

    await registerRepository(setup, {
      repositoryKey: "JKADHIT",
      repositoryFullName: "jkoogit/jkadh",
      lifecyclePolicy: "dev->stg->main"
    });

    const left = await openClient();
    const right = await openClient();
    const sharedWorkGroups = await Promise.all([
      bootstrapWorkGroup(left, {
        repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(181), title: "shared-left",
        issuePolicy: "shared_registration", sharedRegistrationApproved: true, allocationKey: "wg:shared:left"
      }),
      bootstrapWorkGroup(right, {
        repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(181), title: "shared-right",
        issuePolicy: "shared_registration", sharedRegistrationApproved: true, allocationKey: "wg:shared:right"
      })
    ]);
    assert.deepEqual(sharedWorkGroups.map((item) => item.issueSequence).sort((a, b) => a - b), [1, 2]);

    const dedicatedResults = await Promise.allSettled([
      bootstrapWorkGroup(left, {
        repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(182), title: "dedicated-left",
        allocationKey: "wg:dedicated:left"
      }),
      bootstrapWorkGroup(right, {
        repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(182), title: "dedicated-right",
        allocationKey: "wg:dedicated:right"
      })
    ]);
    assert.equal(dedicatedResults.filter((item) => item.status === "fulfilled").length, 1);
    await assert.rejects(() => setup.query(`
      insert into hcp.harness_issue_role (issue_id, owner_type, owner_id, issue_role)
      values ('github:JKADHIT:182', 'work_group', $1, 'registration')
    `, [sharedWorkGroups[0].workGroupId]), /harness_issue_role_registration_owner_uidx/);

    const mixedPolicyResults = await Promise.allSettled([
      bootstrapWorkGroup(left, {
        repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(183), title: "mixed-dedicated",
        allocationKey: "wg:mixed:dedicated"
      }),
      bootstrapWorkGroup(right, {
        repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(183), title: "mixed-shared",
        issuePolicy: "shared_registration", sharedRegistrationApproved: true, allocationKey: "wg:mixed:shared"
      })
    ]);
    assert.equal(mixedPolicyResults.filter((item) => item.status === "fulfilled").length, 1);

    await setup.query(`
      create or replace function hcp.fail_marked_registry_entity()
      returns trigger language plpgsql as $$
      begin
        if tg_table_name = 'harness_work_group' then
          if new.title = 'FORCE_REGISTRY_FAILURE' then
            raise exception 'forced registry integration failure';
          end if;
        elsif tg_table_name = 'harness_task' then
          if new.task_name = 'FORCE_REGISTRY_FAILURE' then
            raise exception 'forced registry integration failure';
          end if;
        end if;
        return new;
      end;
      $$;
      create trigger harness_work_group_integration_failure
      before insert on hcp.harness_work_group
      for each row execute function hcp.fail_marked_registry_entity();
      create trigger harness_task_integration_failure
      before insert on hcp.harness_task
      for each row execute function hcp.fail_marked_registry_entity();
    `);

    await assert.rejects(() => bootstrapWorkGroup(left, {
      repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(184), title: "FORCE_REGISTRY_FAILURE",
      issuePolicy: "shared_registration", sharedRegistrationApproved: true, allocationKey: "wg:failure:one"
    }), /tombstoned after allocation failure/);
    const workGroupAfterFailure = await bootstrapWorkGroup(right, {
      repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(184), title: "after-failure",
      issuePolicy: "shared_registration", sharedRegistrationApproved: true, allocationKey: "wg:failure:two"
    });
    assert.equal(workGroupAfterFailure.issueSequence, 2);
    const failedWorkGroupAllocation = await setup.query<{ issue_sequence: number; status: string }>(`
      select issue_sequence, status from hcp.harness_id_allocation where allocation_key = 'wg:failure:one'
    `);
    assert.deepEqual(failedWorkGroupAllocation.rows[0], { issue_sequence: 1, status: "tombstoned" });

    const canceledWorkGroup = await bootstrapWorkGroup(left, {
      repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(185), title: "cancel-me",
      issuePolicy: "shared_registration", sharedRegistrationApproved: true, allocationKey: "wg:cancel:one"
    });
    await setup.query("update hcp.harness_work_group set status = 'canceled' where work_group_id = $1", [canceledWorkGroup.workGroupId]);
    const workGroupAfterCancel = await bootstrapWorkGroup(right, {
      repositoryKey: "JKADHIT", registrationIssue: verifiedIssue(185), title: "after-cancel",
      issuePolicy: "shared_registration", sharedRegistrationApproved: true, allocationKey: "wg:cancel:two"
    });
    assert.equal(workGroupAfterCancel.issueSequence, 2);

    const taskWorkGroup = sharedWorkGroups[0];
    const sharedTasks = await Promise.all([
      allocateRegistryTask(left, {
        repositoryKey: "JKADHIT", workGroupId: taskWorkGroup.workGroupId, executionIssue: verifiedIssue(281),
        sessionId: "integration-session-left", taskName: "shared-task-left",
        issuePolicy: "shared_umbrella", sharedUmbrellaApproved: true, allocationKey: "task:shared:left"
      }),
      allocateRegistryTask(right, {
        repositoryKey: "JKADHIT", workGroupId: taskWorkGroup.workGroupId, executionIssue: verifiedIssue(281),
        sessionId: "integration-session-right", taskName: "shared-task-right",
        issuePolicy: "shared_umbrella", sharedUmbrellaApproved: true, allocationKey: "task:shared:right"
      })
    ]);
    assert.deepEqual(sharedTasks.map((item) => item.issueSequence).sort((a, b) => a - b), [1, 2]);

    const dedicatedTaskResults = await Promise.allSettled([
      allocateRegistryTask(left, {
        repositoryKey: "JKADHIT", workGroupId: taskWorkGroup.workGroupId, executionIssue: verifiedIssue(282),
        sessionId: "integration-session-left", taskName: "dedicated-task-left", allocationKey: "task:dedicated:left"
      }),
      allocateRegistryTask(right, {
        repositoryKey: "JKADHIT", workGroupId: taskWorkGroup.workGroupId, executionIssue: verifiedIssue(282),
        sessionId: "integration-session-right", taskName: "dedicated-task-right", allocationKey: "task:dedicated:right"
      })
    ]);
    assert.equal(dedicatedTaskResults.filter((item) => item.status === "fulfilled").length, 1);
    const dedicatedTask = dedicatedTaskResults.find((item) => item.status === "fulfilled");
    assert.ok(dedicatedTask && dedicatedTask.status === "fulfilled");
    await assert.rejects(() => setup.query(`
      insert into hcp.harness_issue_role (issue_id, owner_type, owner_id, issue_role)
      values ('github:JKADHIT:281', 'task', $1, 'execution')
    `, [dedicatedTask.value.taskId]), /harness_issue_role_execution_owner_uidx/);

    const mixedTaskPolicyResults = await Promise.allSettled([
      allocateRegistryTask(left, {
        repositoryKey: "JKADHIT", workGroupId: taskWorkGroup.workGroupId, executionIssue: verifiedIssue(284),
        sessionId: "integration-session-mixed-dedicated", taskName: "mixed-task-dedicated",
        allocationKey: "task:mixed:dedicated"
      }),
      allocateRegistryTask(right, {
        repositoryKey: "JKADHIT", workGroupId: taskWorkGroup.workGroupId, executionIssue: verifiedIssue(284),
        sessionId: "integration-session-mixed-shared", taskName: "mixed-task-shared",
        issuePolicy: "shared_umbrella", sharedUmbrellaApproved: true, allocationKey: "task:mixed:shared"
      })
    ]);
    assert.equal(mixedTaskPolicyResults.filter((item) => item.status === "fulfilled").length, 1);

    await assert.rejects(() => allocateRegistryTask(left, {
      repositoryKey: "JKADHIT", workGroupId: taskWorkGroup.workGroupId, executionIssue: verifiedIssue(283),
      sessionId: "integration-session-failure", taskName: "FORCE_REGISTRY_FAILURE",
      issuePolicy: "shared_umbrella", sharedUmbrellaApproved: true, allocationKey: "task:failure:one"
    }), /tombstoned after allocation failure/);
    const taskAfterFailure = await allocateRegistryTask(right, {
      repositoryKey: "JKADHIT", workGroupId: taskWorkGroup.workGroupId, executionIssue: verifiedIssue(283),
      sessionId: "integration-session-after-failure", taskName: "after-failure",
      issuePolicy: "shared_umbrella", sharedUmbrellaApproved: true, allocationKey: "task:failure:two"
    });
    assert.equal(taskAfterFailure.issueSequence, 2);

    const replayWorkGroupInput = {
      repositoryKey: "JKADHIT",
      registrationIssue: verifiedIssue(186),
      title: "replay-work-group",
      allocationKey: "wg:replay"
    } as const;
    const replayWorkGroup = await bootstrapWorkGroup(left, replayWorkGroupInput);
    const replayTaskInput = {
      repositoryKey: "JKADHIT",
      workGroupId: replayWorkGroup.workGroupId,
      executionIssue: verifiedIssue(286),
      sessionId: "integration-session-replay",
      taskName: "replay-task",
      allocationKey: "task:replay"
    } as const;
    const replayTask = await allocateRegistryTask(left, replayTaskInput);
    await setup.query("update hcp.harness_work_group set status = 'completed' where work_group_id = $1", [replayWorkGroup.workGroupId]);
    await setup.query("update hcp.harness_repository set status = 'deprecated' where repository_key = 'JKADHIT'");
    const closedEvidence = (issue: ExternalIssueEvidence): ExternalIssueEvidence => ({
      ...issue, status: "closed", verifiedAt: "2020-01-01T00:00:00.000Z"
    });
    const replayedWorkGroup = await bootstrapWorkGroup(right, {
      ...replayWorkGroupInput, registrationIssue: closedEvidence(replayWorkGroupInput.registrationIssue)
    });
    const replayedTask = await allocateRegistryTask(right, {
      ...replayTaskInput, executionIssue: closedEvidence(replayTaskInput.executionIssue)
    });
    assert.equal(replayedWorkGroup.workGroupId, replayWorkGroup.workGroupId);
    assert.equal(replayedWorkGroup.reused, true);
    assert.equal(replayedTask.taskId, replayTask.taskId);
    assert.equal(replayedTask.reused, true);
    await assert.rejects(() => bootstrapWorkGroup(right, {
      ...replayWorkGroupInput,
      registrationIssue: closedEvidence(replayWorkGroupInput.registrationIssue),
      title: "different immutable request"
    }), /different immutable request fingerprint/);
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()));
    try {
      if (databaseReserved && admin) {
        await cleanupRegistryTestDatabase(admin, config, recoveryFile, databaseName);
        context.diagnostic(`temporary-database-cleanup: ${databaseName}`);
      }
    } finally {
      try {
        if (admin) await admin.end();
      } finally {
        releaseRegistryTestRunLock(runLock);
      }
    }
  }
});

function verifiedIssue(number: number): ExternalIssueEvidence {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/jkoogit/jkadh/issues/${number}`,
    status: "open",
    verificationSource: "github",
    verifiedAt: new Date().toISOString()
  };
}
