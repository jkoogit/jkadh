import { createReportDocument } from "../reports/create-report.ts";
import { createDbClient } from "./db-client.ts";
import { loadDbConfig } from "./db-config.ts";

export async function runDbValidate(repoRoot: string): Promise<{ status: "valid" | "blocked"; markdown: string }> {
  const loaded = loadDbConfig(repoRoot);
  if (loaded.status === "blocked" || !loaded.config) {
    const report = createReportDocument({
      title: "Harness CLI db validate",
      summary: "Validate PostgreSQL structural conventions.",
      checks: [
        { name: "config", status: "blocked", detail: `missing: ${loaded.missing.join(", ")}` }
      ]
    });
    return { status: "blocked", markdown: report.markdown };
  }

  const client = await createDbClient(loaded.config);
  try {
    const fkResult = await client.query<{ fk_count: number }>(`
      select count(1)::int as fk_count
      from information_schema.table_constraints
      where constraint_type = 'FOREIGN KEY'
        and table_schema in ('meta', 'dict', 'hcp')
    `);
    const schemaResult = await client.query<{ schema_name: string }>(`
      select schema_name
      from information_schema.schemata
      where schema_name in ('meta', 'dict', 'hcp', 'harness_meta', 'dictionary')
      order by schema_name
    `);
    const legacySchemas = schemaResult.rows
      .map((row) => row.schema_name)
      .filter((schema) => ["harness_meta", "dictionary"].includes(schema));
    const activeSchemas = schemaResult.rows.map((row) => row.schema_name).join(", ") || "none";
    const fkCount = fkResult.rows[0]?.fk_count ?? 0;

    const report = createReportDocument({
      title: "Harness CLI db validate",
      summary: "Validate PostgreSQL structural conventions.",
      checks: [
        { name: "schemas", status: legacySchemas.length === 0 ? "pass" : "blocked", detail: activeSchemas },
        { name: "foreign keys", status: fkCount === 0 ? "pass" : "blocked", detail: String(fkCount) }
      ]
    });
    return { status: legacySchemas.length === 0 && fkCount === 0 ? "valid" : "blocked", markdown: report.markdown };
  } finally {
    await client.end();
  }
}
