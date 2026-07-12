#!/usr/bin/env node

import { checkGate, type HarnessAction, type HarnessTag } from "./gates/check-gate.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBacklogIndex } from "./docs/backlog-index.ts";
import { parseRetrospectiveDetail } from "./docs/retrospective-detail.ts";
import { parseLatestRetrospective } from "./docs/retrospective-index.ts";
import { readInternalGitStatus } from "./git/git-status.ts";
import { readGitHubOpenStatus } from "./github/github-status.ts";
import { buildLifecycleReport } from "./flows/lifecycle-flow.ts";
import { buildSessionStartReport } from "./flows/session-start.ts";
import { checkProjectAccess, loadProjectProfile } from "./projects/project-profile.ts";
import { createReportDocument } from "./reports/create-report.ts";
import { checkRequiredEnv } from "./security/env-check.ts";
import { buildSessionPlan } from "./session/session-plan.ts";
import { parseHarnessTag } from "./tags/tag-adapter.ts";

const requiredEnvNames = [
  "GITHUB_TOKEN",
  "OPENAI_API_KEY",
  "JKADH_TARGET_REPO",
  "JKADH_TARGET_PROJECT",
  "JKADH_ENV"
];

function printUsage(): void {
  console.log(`Usage:
  jkadh session start [project_id]
  jkadh session close
  jkadh task start
  jkadh task close
  jkadh task promote
  jkadh tag <#세션시작|#태스크시작|#태스크정리|#태스크승급|#세션정리>
  jkadh gate check <tag> <action>
  jkadh report create
`);
}

async function run(argv: string[]): Promise<number> {
  const [scope, command, firstArg, secondArg] = argv;

  if (scope === "session" && command === "start") {
    const projectId = firstArg ?? "jkadh";
    const profile = await loadProjectProfile(projectId);
    const access = checkProjectAccess(profile);
    if (access.status === "blocked") {
      const report = createReportDocument({
        title: "Harness CLI session start",
        summary: "Project access blocked before repository checks",
        checks: [
          { name: "project", status: "info", detail: profile.project_id },
          { name: "access mode", status: "blocked", detail: `${profile.access_mode}: ${access.reason}` }
        ]
      });
      console.log(report.markdown);
      return 2;
    }

    const retrospective = readLatestRetrospective(profile.local_path);
    const retrospectiveDetail = retrospective ? readRetrospectiveDetail(profile.local_path, retrospective.path) : undefined;
    const github = readGitHubOpenStatus(profile.repo_full_name, profile.local_path);
    const relatedIssue = findRelatedIssue(github.issues, retrospectiveDetail?.recommendedStartPoint);

    const report = buildSessionStartReport({
      branchStatus: readInternalGitStatus(profile.local_path),
      backlog: {
        candidates: readBacklogCandidates(profile.local_path)
      },
      credentials: {
        required: checkRequiredEnv(requiredEnvNames)
      },
      retrospective,
      retrospectiveDetail,
      github,
      sessionPlan: buildSessionPlan({
        detail: retrospectiveDetail ?? { referenceDocs: [] },
        issueNumber: relatedIssue?.number,
        issueTitle: relatedIssue?.title
      })
    });
    console.log(report.markdown);
    return 0;
  }

  if (scope === "session" && command === "close") {
    console.log(buildLifecycleReport("session_close").markdown);
    return 0;
  }

  if (scope === "task" && command === "start") {
    console.log(buildLifecycleReport("task_start").markdown);
    return 0;
  }

  if (scope === "task" && command === "close") {
    console.log(buildLifecycleReport("task_close").markdown);
    return 0;
  }

  if (scope === "task" && command === "promote") {
    console.log(buildLifecycleReport("task_promote").markdown);
    return 0;
  }

  if (scope === "tag" && command) {
    const tag = parseHarnessTag(command);
    if (!tag) {
      console.error(`Unsupported Harness tag: ${command}`);
      return 1;
    }
    if (tag === "session_start") {
      return run(["session", "start"]);
    }
    console.log(buildLifecycleReport(tag).markdown);
    return 0;
  }

  if (scope === "gate" && command === "check") {
    if (!firstArg || !secondArg) {
      printUsage();
      return 1;
    }
    const result = checkGate({
      mode: "read-check-report",
      tag: firstArg as HarnessTag,
      requestedAction: secondArg as HarnessAction
    });
    console.log(JSON.stringify(result, null, 2));
    return result.allowed ? 0 : 2;
  }

  if (scope === "report" && command === "create") {
    const report = createReportDocument({
      title: "Harness CLI report",
      summary: "Read/check/report dry-run report",
      checks: [
        { name: "mode", status: "info", detail: "read-check-report" },
        { name: "write actions", status: "blocked", detail: "not implemented in initial scope" }
      ]
    });
    console.log(report.markdown);
    return 0;
  }

  printUsage();
  return 1;
}

const exitCode = await run(process.argv.slice(2));
process.exitCode = exitCode;

function readBacklogCandidates(repoRoot: string) {
  const markdown = readFileSync(join(repoRoot, "docs/15.로그/backlog/README.md"), "utf8");
  return parseBacklogIndex(markdown);
}

function readLatestRetrospective(repoRoot: string) {
  const markdown = readFileSync(join(repoRoot, "docs/12.회고/README.md"), "utf8");
  return parseLatestRetrospective(markdown);
}

function readRetrospectiveDetail(repoRoot: string, retrospectivePath: string) {
  const normalizedPath = retrospectivePath.replace(/^\.\//, "");
  const markdown = readFileSync(join(repoRoot, "docs/12.회고", normalizedPath), "utf8");
  return parseRetrospectiveDetail(markdown);
}

function findRelatedIssue(issues: { number: number; title: string }[], recommendedStartPoint?: string) {
  if (!recommendedStartPoint) {
    return undefined;
  }

  const normalizedStartPoint = normalizeKoreanSearchText(recommendedStartPoint);
  return issues.find((issue) => normalizedStartPoint.includes("harness cli")
    && normalizeKoreanSearchText(issue.title).includes("harness cli"));
}

function normalizeKoreanSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ");
}
