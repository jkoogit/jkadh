export type CheckStatus = "pass" | "fail" | "blocked" | "info";

export interface ReportCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface ReportInput {
  title: string;
  summary: string;
  checks: ReportCheck[];
}

export interface ReportDocument {
  markdown: string;
  json: ReportInput;
}

export function createReportDocument(input: ReportInput): ReportDocument {
  const lines = [
    `# ${input.title}`,
    "",
    input.summary,
    "",
    "## Checks",
    "",
    ...input.checks.map((check) => `- [${check.status}] ${check.name}: ${check.detail}`)
  ];

  return {
    markdown: `${lines.join("\n")}\n`,
    json: {
      title: input.title,
      summary: input.summary,
      checks: input.checks.map((check) => ({ ...check }))
    }
  };
}
