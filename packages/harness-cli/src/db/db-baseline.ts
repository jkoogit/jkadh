import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createReportDocument } from "../reports/create-report.ts";
import { createDbClient, type DbClient } from "./db-client.ts";
import { loadDbConfig, type DbConfig } from "./db-config.ts";
import { defaultMigrationsDir, readMigrationFiles } from "./db-migrate.ts";

export interface BaselineFile {
  name: string;
  path: string;
  sql: string;
  checksum: string;
}

export interface DbBaselineInput {
  execute?: boolean;
  mode: "init" | "reset";
  baselineDir?: string;
  migrationsDir?: string;
}

export interface DbBaselineResult {
  status: "planned" | "executed" | "blocked";
  markdown: string;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const defaultBaselineDir = join(moduleDir, "../../baseline");

export async function runDbBaseline(repoRoot: string, input: DbBaselineInput): Promise<DbBaselineResult> {
  const loaded = loadDbConfig(repoRoot);
  if (loaded.status === "blocked" || !loaded.config) {
    const report = createReportDocument({
      title: `Harness CLI db ${input.mode}`,
      summary: "Initialize or reset PostgreSQL baseline schema.",
      checks: [
        { name: "config", status: "blocked", detail: `missing: ${loaded.missing.join(", ")}` }
      ]
    });
    return { status: "blocked", markdown: report.markdown };
  }

  const baseline = readBaselineFiles(input.baselineDir ?? defaultBaselineDir);
  const migrations = readMigrationFiles(input.migrationsDir ?? defaultMigrationsDir);
  const destructiveAllowed = isResetAllowed(loaded.config);
  if (input.mode === "reset" && input.execute && !destructiveAllowed) {
    const report = createReportDocument({
      title: "Harness CLI db reset",
      summary: "Initialize or reset PostgreSQL baseline schema.",
      checks: [
        { name: "environment", status: "blocked", detail: `${loaded.config.env}: reset is allowed only in local or dev` }
      ]
    });
    return { status: "blocked", markdown: report.markdown };
  }

  if (input.execute) {
    const client = await createDbClient(loaded.config);
    try {
      if (input.mode === "reset") {
        await dropKnownSchemas(client);
      }
      for (const file of baseline) {
        await client.query(file.sql);
      }
      await recordMigrationFiles(client, migrations);
    } finally {
      await client.end();
    }
  }

  const report = createReportDocument({
    title: `Harness CLI db ${input.mode}`,
    summary: input.execute ? "Apply PostgreSQL baseline schema." : "Plan PostgreSQL baseline schema application.",
    checks: [
      { name: "environment", status: "info", detail: loaded.config.env },
      { name: "baseline directory", status: "pass", detail: input.baselineDir ?? defaultBaselineDir },
      { name: "baseline files", status: baseline.length > 0 ? "pass" : "blocked", detail: baseline.map((file) => file.name).join("; ") || "none" },
      { name: "migration records", status: migrations.length > 0 ? "pass" : "info", detail: `${migrations.length} migration(s)` },
      { name: "destructive reset", status: input.mode === "reset" ? destructiveAllowed ? "pass" : "blocked" : "info", detail: input.mode === "reset" ? (destructiveAllowed ? "allowed" : "blocked outside local/dev") : "not requested" },
      { name: "mode", status: input.execute ? "pass" : "info", detail: input.execute ? "execute" : "dry-run" }
    ]
  });
  return { status: input.execute ? "executed" : "planned", markdown: report.markdown };
}

export function readBaselineFiles(baselineDir: string): BaselineFile[] {
  if (!existsSync(baselineDir)) {
    return [];
  }
  return readdirSync(baselineDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{3}_.+\.sql$/.test(entry.name))
    .map((entry) => {
      const path = join(baselineDir, entry.name);
      const sql = readFileSync(path, "utf8");
      return {
        name: entry.name,
        path,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex")
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function isResetAllowed(config: DbConfig): boolean {
  return ["local", "dev"].includes(config.env);
}

async function dropKnownSchemas(client: DbClient): Promise<void> {
  await client.query(`
    drop schema if exists harness_meta cascade;
    drop schema if exists dictionary cascade;
    drop schema if exists meta cascade;
    drop schema if exists dict cascade;
    drop schema if exists hcp cascade;
  `);
}

async function recordMigrationFiles(client: DbClient, migrations: ReturnType<typeof readMigrationFiles>): Promise<void> {
  await client.query(`
    create schema if not exists meta;
    create table if not exists meta.schema_migration (
      version integer primary key,
      name text not null unique,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);
  for (const migration of migrations) {
    await client.query(
      `insert into meta.schema_migration (version, name, checksum)
       values ($1, $2, $3)
       on conflict (version) do update
       set name = excluded.name,
           checksum = excluded.checksum,
           applied_at = now()`,
      [migration.version, migration.name, migration.checksum]
    );
  }
}
