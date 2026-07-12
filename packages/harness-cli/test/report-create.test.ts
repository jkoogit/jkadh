import assert from "node:assert/strict";
import { test } from "node:test";

import { createReportDocument } from "../src/reports/create-report.ts";

test("report create renders markdown and json payload", () => {
  const report = createReportDocument({
    title: "Harness CLI read/check/report",
    summary: "Minimal dry-run report",
    checks: [
      { name: "branch alignment", status: "pass", detail: "dev/stg/main aligned" },
      { name: "write actions", status: "blocked", detail: "not in initial scope" }
    ]
  });

  assert.match(report.markdown, /^# Harness CLI read\/check\/report/m);
  assert.match(report.markdown, /- \[pass\] branch alignment: dev\/stg\/main aligned/);
  assert.deepEqual(report.json.checks[1], {
    name: "write actions",
    status: "blocked",
    detail: "not in initial scope"
  });
});
