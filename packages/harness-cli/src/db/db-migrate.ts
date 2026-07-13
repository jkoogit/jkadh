import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createReportDocument } from "../reports/create-report.ts";
import { createDbClient, type DbClient } from "./db-client.ts";
import { loadDbConfig } from "./db-config.ts";

export interface MigrationFile {
  version: number;
  name: string;
  path: string;
  checksum: string;
  sql: string;
}

export interface DbMigrateInput {
  execute?: boolean;
  migrationsDir?: string;
}

export interface DbMigrateResult {
  status: "planned" | "executed" | "blocked";
  markdown: string;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const defaultMigrationsDir = join(moduleDir, "../../migrations");

export async function runDbMigrate(repoRoot: string, input: DbMigrateInput = {}): Promise<DbMigrateResult> {
  const loaded = loadDbConfig(repoRoot);
  if (loaded.status === "blocked" || !loaded.config) {
    const report = createReportDocument({
      title: "Harness CLI db migrate",
      summary: "Plan or apply PostgreSQL migrations.",
      checks: [
        { name: "config", status: "blocked", detail: `missing: ${loaded.missing.join(", ")}` }
      ]
    });
    return { status: "blocked", markdown: report.markdown };
  }

  const migrations = readMigrationFiles(input.migrationsDir ?? defaultMigrationsDir);
  const client = await createDbClient(loaded.config);
  try {
    await ensureMigrationTable(client);
    const applied = await readAppliedVersions(client);
    const pending = migrations.filter((migration) => !applied.has(migration.version));
    const changed = migrations.filter((migration) => {
      const appliedChecksum = applied.get(migration.version);
      return appliedChecksum && appliedChecksum !== migration.checksum;
    });

    if (changed.length > 0) {
      const report = createReportDocument({
        title: "Harness CLI db migrate",
        summary: "Plan or apply PostgreSQL migrations.",
        checks: [
          { name: "checksum", status: "blocked", detail: changed.map((migration) => migration.name).join("; ") }
        ]
      });
      return { status: "blocked", markdown: report.markdown };
    }

    const executed = input.execute ? [...pending] : [];
    if (input.execute) {
      for (const migration of pending) {
        await applyMigration(client, migration);
      }
    }
    const remaining = input.execute ? [] : pending;

    const report = createReportDocument({
      title: "Harness CLI db migrate",
      summary: input.execute ? "Apply pending PostgreSQL migrations." : "Plan pending PostgreSQL migrations.",
      checks: [
        { name: "migration directory", status: "pass", detail: input.migrationsDir ?? defaultMigrationsDir },
        { name: "known migrations", status: migrations.length > 0 ? "pass" : "blocked", detail: String(migrations.length) },
        { name: "applied migrations", status: "info", detail: String(applied.size + executed.length) },
        { name: "executed migrations", status: input.execute ? "pass" : "info", detail: executed.length > 0 ? executed.map((migration) => migration.name).join("; ") : "none" },
        { name: "pending migrations", status: remaining.length > 0 ? "pass" : "info", detail: remaining.length > 0 ? remaining.map((migration) => migration.name).join("; ") : "none" },
        { name: "mode", status: input.execute ? "pass" : "info", detail: input.execute ? "execute" : "dry-run" }
      ]
    });
    return { status: input.execute ? "executed" : "planned", markdown: report.markdown };
  } finally {
    await client.end();
  }
}

export function readMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!existsSync(migrationsDir)) {
    return [];
  }
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{3}_.+\.sql$/.test(entry.name))
    .map((entry) => {
      const path = join(migrationsDir, entry.name);
      const sql = readFileSync(path, "utf8");
      return {
        version: Number(entry.name.slice(0, 3)),
        name: entry.name,
        path,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql
      };
    })
    .sort((left, right) => left.version - right.version);
}

async function ensureMigrationTable(client: DbClient): Promise<void> {
  await client.query(`
    create schema if not exists harness_meta;
    create table if not exists harness_meta.schema_migration (
      version integer primary key,
      name text not null unique,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

async function readAppliedVersions(client: DbClient): Promise<Map<number, string>> {
  const result = await client.query<{ version: number; checksum: string }>(`
    select version, checksum
    from harness_meta.schema_migration
    order by version
  `);
  return new Map(result.rows.map((row) => [row.version, row.checksum]));
}

async function applyMigration(client: DbClient, migration: MigrationFile): Promise<void> {
  await client.query("begin");
  try {
    await client.query(migration.sql);
    await client.query(
      `insert into harness_meta.schema_migration (version, name, checksum)
       values ($1, $2, $3)`,
      [migration.version, migration.name, migration.checksum]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
