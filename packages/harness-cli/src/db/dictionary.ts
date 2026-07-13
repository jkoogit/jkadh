import { createReportDocument } from "../reports/create-report.ts";
import { createDbClient } from "./db-client.ts";
import { loadDbConfig } from "./db-config.ts";

export async function runDictionaryList(repoRoot: string): Promise<{ status: "listed" | "blocked"; markdown: string }> {
  const loaded = loadDbConfig(repoRoot);
  if (loaded.status === "blocked" || !loaded.config) {
    const report = createReportDocument({
      title: "Harness CLI dictionary list",
      summary: "List dictionary terms from PostgreSQL.",
      checks: [
        { name: "config", status: "blocked", detail: `missing: ${loaded.missing.join(", ")}` }
      ]
    });
    return { status: "blocked", markdown: report.markdown };
  }

  const client = await createDbClient(loaded.config);
  try {
    const result = await client.query<{
      domain_key: string;
      term_key: string;
      ko_label: string | null;
      en_label: string | null;
    }>(`
      select d.domain_key, t.term_key,
        max(l.label) filter (where l.language_code = 'ko') as ko_label,
        max(l.label) filter (where l.language_code = 'en') as en_label
      from dictionary.term t
      join dictionary.domain d on d.domain_id = t.domain_id
      left join dictionary.term_label l on l.term_id = t.term_id
      group by d.domain_key, t.term_key
      order by d.domain_key, t.term_key
    `);
    const detail = result.rows.length === 0
      ? "no terms"
      : result.rows.map((row) => `${row.domain_key}.${row.term_key} | ${row.ko_label ?? "-"} | ${row.en_label ?? "-"}`).join("; ");
    const report = createReportDocument({
      title: "Harness CLI dictionary list",
      summary: "List dictionary terms from PostgreSQL.",
      checks: [
        { name: "terms", status: result.rows.length > 0 ? "pass" : "info", detail }
      ]
    });
    return { status: "listed", markdown: report.markdown };
  } finally {
    await client.end();
  }
}
