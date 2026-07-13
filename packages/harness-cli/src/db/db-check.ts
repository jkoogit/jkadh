import { createReportDocument } from "../reports/create-report.ts";
import { createDbClient } from "./db-client.ts";
import { loadDbConfig } from "./db-config.ts";

export interface DbCheckResult {
  status: "connected" | "blocked";
  markdown: string;
}

export async function runDbCheck(repoRoot: string): Promise<DbCheckResult> {
  const loaded = loadDbConfig(repoRoot);
  if (loaded.status === "blocked" || !loaded.config) {
    const report = createReportDocument({
      title: "Harness CLI db check",
      summary: "Check PostgreSQL connection settings.",
      checks: [
        { name: "config", status: "blocked", detail: `missing: ${loaded.missing.join(", ")}` }
      ]
    });
    return { status: "blocked", markdown: report.markdown };
  }

  const client = await createDbClient(loaded.config);
  try {
    const result = await client.query<{
      db: string;
      user_name: string;
      server_addr: string;
      server_port: number;
      version: string;
    }>(`
      select
        current_database() as db,
        current_user as user_name,
        inet_server_addr()::text as server_addr,
        inet_server_port() as server_port,
        version() as version
    `);
    const row = result.rows[0];
    const migrationVersion = await readMigrationVersion(client);
    const report = createReportDocument({
      title: "Harness CLI db check",
      summary: "Check PostgreSQL connection settings.",
      checks: [
        { name: "environment", status: "info", detail: loaded.config.env },
        { name: "connection", status: "pass", detail: `${loaded.config.host}:${loaded.config.port}/${loaded.config.database}` },
        { name: "database", status: "pass", detail: row.db },
        { name: "user", status: "pass", detail: row.user_name },
        { name: "server", status: "pass", detail: `${row.server_addr}:${row.server_port}` },
        { name: "version", status: "info", detail: row.version.split(" on ")[0] },
        { name: "migration", status: migrationVersion ? "pass" : "info", detail: migrationVersion ?? "not initialized" }
      ]
    });
    return { status: "connected", markdown: report.markdown };
  } finally {
    await client.end();
  }
}

async function readMigrationVersion(client: Awaited<ReturnType<typeof createDbClient>>): Promise<string | null> {
  try {
    const result = await client.query<{ migration_version: string | null }>(`
      select max(version)::text as migration_version
      from harness_meta.schema_migration
    `);
    return result.rows[0]?.migration_version ?? null;
  } catch {
    return null;
  }
}
