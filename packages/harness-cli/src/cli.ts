#!/usr/bin/env node

import { checkGate, type HarnessAction, type HarnessTag } from "./gates/check-gate.ts";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasBacklogIndexEntry, parseBacklogIndex } from "./docs/backlog-index.ts";
import { parseRetrospectiveDetail } from "./docs/retrospective-detail.ts";
import { parseLatestRetrospective } from "./docs/retrospective-index.ts";
import { readInternalGitStatus } from "./git/git-status.ts";
import { readGitHubOpenStatus } from "./github/github-status.ts";
import { runDbCheck } from "./db/db-check.ts";
import { runDbMigrate } from "./db/db-migrate.ts";
import { runDbBaseline } from "./db/db-baseline.ts";
import { runDbValidate } from "./db/db-validate.ts";
import { runDictionaryList } from "./db/dictionary.ts";
import { buildLifecycleReport } from "./flows/lifecycle-flow.ts";
import { buildSessionCloseReport, enrichSessionCloseInputWithAutoStatus, enrichSessionCloseInputWithHcpState, executeSessionClose, parseSessionCloseArgs } from "./flows/session-close.ts";
import { buildSessionStartReport } from "./flows/session-start.ts";
import { buildTaskCloseReport, executeTaskClose, parseTaskCloseArgs, parseTaskCloseBlock, readTaskCloseGitSummary } from "./flows/task-close.ts";
import { buildTaskPromoteReport, executeTaskPromote, parseTaskPromoteArgs, readTaskPromoteBranchStatus } from "./flows/task-promote.ts";
import { buildTaskStartReport, executeTaskStart, parseTaskStartArgs, parseTaskStartBlock } from "./flows/task-start.ts";
import { checkProjectAccess, loadProjectProfile } from "./projects/project-profile.ts";
import { createReportDocument } from "./reports/create-report.ts";
import { checkRequiredEnv } from "./security/env-check.ts";
import { buildSessionPlan } from "./session/session-plan.ts";
import {
  addHcpBacklog,
  addHcpTask,
  buildHcpStateSummary,
  cleanupArchivedSessions,
  createHcpSession,
  deleteHcpBacklog,
  deleteHcpTask,
  readSessionById,
  resolveActiveSession,
  transitionHcpSessionStatus,
  updateHcpTaskBranch,
  updateHcpTaskPullRequest,
  updateHcpBacklog,
  updateHcpSession,
  updateHcpTask,
  updateHcpTaskTitle
} from "./state/session-state.ts";
import { buildHarnessTagExecutionOrder, formatHarnessTagExecutionOrder, parseHarnessTagCommand } from "./tags/tag-adapter.ts";

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
  jkadh session close [--execute --verified-issue <number> --reuse-open-pr]
  jkadh task start [--execute --issue-title <title> --branch <branch>]
  jkadh task close [--execute --path <path> --message <message> --pr-title <title> --base dev]
  jkadh task promote [--target-commit <sha> --target-branches stg,main --execute]
  jkadh tag <#세션시작|#태스크시작|#태스크정리|#태스크승급|#세션정리>[.보고|.PR재사용]
  jkadh gate check <tag> <action>
  jkadh hcp session update --session-id <id> --session-name <name>
  jkadh hcp task update --session-id <id> --task-id <id> --task-name <name>
  jkadh hcp task delete --session-id <id> --task-id <id>
  jkadh hcp issue update --session-id <id> --issue <number> --title <title>
  jkadh hcp pr update --session-id <id> --task-id <id> --pr <number> --title <title>
  jkadh hcp branch update --session-id <id> --task-id <id> --branch-name <name>
  jkadh hcp backlog add|update|delete
  jkadh hcp archived cleanup [--older-than-days 90 --keep 20 --dry-run]
  jkadh db check
  jkadh db migrate [--dry-run|--execute]
  jkadh db init [--dry-run|--execute]
  jkadh db reset [--dry-run|--execute]
  jkadh db validate
  jkadh dictionary list
  jkadh report create
`);
}

async function run(argv: string[]): Promise<number> {
  const [scope, command, firstArg, secondArg] = argv;

  if (scope === "session" && command === "start") {
    const sessionStartOptions = parseSessionStartOptions(expandBlockOption(argv.slice(2), parseSessionStartBlockArgs));
    const projectId = sessionStartOptions.projectId;
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
    if (report.status === "ready" && sessionStartOptions.writeState) {
      const sessionName = sessionStartOptions.sessionName;
      if (!sessionName) {
        console.log(buildSessionStartOrder(sessionStartOptions.sessionNumber, report.json.sessionPlan?.initialSessionName));
        return 2;
      }
      try {
        const session = createHcpSession(profile.local_path, {
          agentId: sessionStartOptions.agentId,
          sessionNumber: sessionStartOptions.sessionNumber,
          sessionName
        });
        console.log(buildHcpStateMarkdown(buildHcpStateSummary(profile.local_path, session.sessionId)));
      } catch (error) {
        console.log(buildHcpStateMarkdown(
          buildHcpStateSummary(profile.local_path),
          error instanceof Error ? error.message : "HCP session creation failed"
        ));
        return 2;
      }
    }
    return 0;
  }

  if (scope === "session" && command === "close") {
    const input = enrichSessionCloseInputWithAutoStatus(
      enrichSessionCloseInputWithHcpState(parseSessionCloseArgs(argv.slice(2)), process.cwd()),
      process.cwd()
    );
    const report = buildSessionCloseReport(input);
    console.log(report.markdown);
    if (input.execution?.enabled) {
      const sessionState = beginSessionCloseState(process.cwd(), input.sessionId, input.agentId);
      if (sessionState.status === "blocked") {
        console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), input.sessionId), sessionState.detail));
        return 2;
      }
      const executionInput = sessionState.sessionId
        ? enrichSessionCloseInputWithHcpState({ ...input, sessionId: sessionState.sessionId }, process.cwd())
        : input;
      const execution = executeSessionClose(executionInput, process.cwd());
      console.log(execution.markdown);
      completeSessionCloseState(process.cwd(), sessionState.sessionId, execution.status);
      if (sessionState.sessionId) {
        console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), sessionState.sessionId)));
      }
      return execution.status === "executed" ? 0 : 2;
    }
    return 0;
  }

  if (scope === "task" && command === "start") {
    const taskStartArgs = argv.slice(2);
    const blockIndex = taskStartArgs.indexOf("--block");
    const input = blockIndex >= 0 && taskStartArgs[blockIndex + 1]
      ? parseTaskStartBlock(taskStartArgs[blockIndex + 1])
      : parseTaskStartArgs(taskStartArgs);
    const report = buildTaskStartReport(input);
    console.log(report.markdown);
    if (input.execution?.enabled) {
      const execution = executeTaskStart(input, process.cwd());
      console.log(execution.markdown);
      if (execution.status === "executed") {
        try {
          const task = addHcpTask(process.cwd(), {
            agentId: input.agentId,
            sessionId: input.sessionId,
            taskName: input.taskName ?? input.scope ?? input.workOrderId ?? "Harness task",
            issueNumber: input.issueNumber ?? parseIssueNumberFromText(execution.markdown),
            branchName: parseBranchNameFromText(execution.markdown)
          });
          console.log(buildHcpStateMarkdown(
            buildHcpStateSummary(process.cwd(), input.sessionId),
            `작업 단계: 준비단계 완료; 구현상태: 구현 대기; registered task: ${task.taskId}`
          ));
        } catch (error) {
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), input.sessionId), error instanceof Error ? error.message : "HCP task state registration failed"));
          return 2;
        }
      }
      return execution.status === "executed" ? 0 : 2;
    }
    return 0;
  }

  if (scope === "task" && command === "close") {
    const taskCloseArgs = argv.slice(2);
    const blockIndex = taskCloseArgs.indexOf("--block");
    const input = blockIndex >= 0 && taskCloseArgs[blockIndex + 1]
      ? parseTaskCloseBlock(taskCloseArgs[blockIndex + 1])
      : parseTaskCloseArgs(taskCloseArgs);
    if (input.execution?.enabled) {
      const taskSelection = applyTaskIdFromHcpState(input, "active", "#태스크정리");
      if (taskSelection.status === "blocked") {
        console.log(taskSelection.markdown);
        return 2;
      }
    }
    const report = buildTaskCloseReport({
      ...input,
      gitSummary: readTaskCloseGitSummary(process.cwd())
    });
    console.log(report.markdown);
    if (input.execution?.enabled) {
      const execution = executeTaskClose(input, process.cwd());
      console.log(execution.markdown);
      if (execution.status === "executed") {
        try {
          const task = updateHcpTask(process.cwd(), {
            agentId: input.agentId,
            sessionId: input.sessionId,
            taskId: input.taskId,
            expectedStatus: "active",
            status: "closed",
            pullRequestNumber: parsePullRequestNumberFromText(execution.markdown),
            pullRequestUrl: parsePullRequestUrlFromText(execution.markdown)
          });
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), input.sessionId), `closed task: ${task.taskId}`));
        } catch (error) {
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), input.sessionId), error instanceof Error ? error.message : "HCP task close state update failed"));
          return 2;
        }
      }
      return execution.status === "executed" ? 0 : 2;
    }
    return 0;
  }

  if (scope === "task" && command === "promote") {
    const input = parseTaskPromoteArgs(argv.slice(2));
    if (input.execution?.enabled) {
      const taskSelection = applyTaskIdFromHcpState(input, "closed", "#태스크승급");
      if (taskSelection.status === "blocked") {
        console.log(taskSelection.markdown);
        return 2;
      }
    }
    const reportInput = {
      ...input,
      branchStatus: readTaskPromoteBranchStatus(input, process.cwd())
    };
    const report = buildTaskPromoteReport(reportInput);
    console.log(report.markdown);
    if (input.execution?.enabled) {
      const execution = executeTaskPromote(reportInput, process.cwd());
      console.log(execution.markdown);
      if (execution.status === "executed") {
        try {
          const task = updateHcpTask(process.cwd(), {
            agentId: input.agentId,
            sessionId: input.sessionId,
            taskId: input.taskId,
            expectedStatus: "closed",
            status: "promoted"
          });
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), input.sessionId), `promoted task: ${task.taskId}`));
        } catch (error) {
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), input.sessionId), error instanceof Error ? error.message : "HCP task promote state update failed"));
          return 2;
        }
      }
      return execution.status === "executed" ? 0 : 2;
    }
    return 0;
  }

  if (scope === "tag" && command) {
    const aliasArgs = tagAliasCommandArgs(command, argv.slice(2));
    if (aliasArgs) {
      return run(aliasArgs);
    }
    const parsed = parseHarnessTagCommand(command);
    if (!parsed) {
      console.error(`Unsupported Harness tag: ${command}`);
      return 1;
    }
    console.log(formatHarnessTagExecutionOrder(buildHarnessTagExecutionOrder(parsed)));
    return run(tagCommandArgs(parsed.tag, parsed.mode, inlineTagArgs(command, argv.slice(2))));
  }

  if (scope === "hcp") {
    return runHcpCommand(command, argv.slice(2));
  }

  if (scope === "db" && command === "check") {
    try {
      const result = await runDbCheck(process.cwd());
      console.log(result.markdown);
      return result.status === "connected" ? 0 : 2;
    } catch (error) {
      console.log(buildDbErrorMarkdown("Harness CLI db check", error));
      return 2;
    }
  }

  if (scope === "db" && command === "migrate") {
    try {
      const options = parseDbMigrateArgs(argv.slice(2));
      const result = await runDbMigrate(process.cwd(), options);
      console.log(result.markdown);
      return result.status === "blocked" ? 2 : 0;
    } catch (error) {
      console.log(buildDbErrorMarkdown("Harness CLI db migrate", error));
      return 2;
    }
  }

  if (scope === "db" && (command === "init" || command === "reset")) {
    try {
      const options = parseDbBaselineArgs(command, argv.slice(2));
      const result = await runDbBaseline(process.cwd(), options);
      console.log(result.markdown);
      return result.status === "blocked" ? 2 : 0;
    } catch (error) {
      console.log(buildDbErrorMarkdown(`Harness CLI db ${command}`, error));
      return 2;
    }
  }

  if (scope === "db" && command === "validate") {
    try {
      const result = await runDbValidate(process.cwd());
      console.log(result.markdown);
      return result.status === "valid" ? 0 : 2;
    } catch (error) {
      console.log(buildDbErrorMarkdown("Harness CLI db validate", error));
      return 2;
    }
  }

  if (scope === "dictionary" && command === "list") {
    try {
      const result = await runDictionaryList(process.cwd());
      console.log(result.markdown);
      return result.status === "listed" ? 0 : 2;
    } catch (error) {
      console.log(buildDbErrorMarkdown("Harness CLI dictionary list", error));
      return 2;
    }
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
  const markdown = readFileSync(backlogIndexReadmePath(repoRoot), "utf8");
  return parseBacklogIndex(markdown);
}

function buildBacklogIndexSyncDetail(repoRoot: string, item: { backlogId?: string; path?: string }): string {
  const readmePath = backlogIndexReadmePath(repoRoot);
  if (!existsSync(readmePath)) {
    return "backlog index: missing README";
  }
  if (!item.backlogId && !item.path) {
    return "backlog index: not verifiable; backlog-id or path required";
  }
  const markdown = readFileSync(readmePath, "utf8");
  return hasBacklogIndexEntry(markdown, item)
    ? "backlog index: reflected"
    : "backlog index: missing entry; update docs/15.로그/backlog/README.md";
}

function backlogIndexReadmePath(repoRoot: string): string {
  return join(repoRoot, "docs", "15.\uB85C\uADF8", "backlog", "README.md");
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

function parseSessionStartOptions(args: string[]): {
  projectId: string;
  agentId?: string;
  sessionNumber?: string;
  sessionName?: string;
  writeState: boolean;
} {
  const options: {
    projectId: string;
    agentId?: string;
    sessionNumber?: string;
    sessionName?: string;
    writeState: boolean;
  } = { projectId: "jkadh", writeState: true };

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key) {
      continue;
    }
    if (key === "--no-state") {
      options.writeState = false;
      continue;
    }
    if (!key.startsWith("--") && options.projectId === "jkadh") {
      options.projectId = key;
      continue;
    }
    const value = args[index + 1];
    if (!value) {
      continue;
    }
    if (key === "--project") {
      options.projectId = value;
      index += 1;
    }
    if (key === "--agent-id") {
      options.agentId = value;
      index += 1;
    }
    if (key === "--session-number") {
      options.sessionNumber = value;
      index += 1;
    }
    if (key === "--session-name") {
      options.sessionName = value;
      index += 1;
    }
  }

  return options;
}

function parseSessionStartBlockArgs(block: string): string[] {
  const body = block.match(/#세션시작\s*\{([\s\S]*)\}/)?.[1] ?? block;
  const args: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "}") {
      continue;
    }
    const match = line.match(/^([^:=]+)\s*[:=]\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = normalizeSessionStartBlockKey(match[1]);
    const value = match[2].trim();
    if (key && value) {
      args.push(key, value);
    }
  }
  return args;
}

function normalizeSessionStartBlockKey(key: string): string | undefined {
  const normalized = key.replace(/\s+/g, "").toLowerCase();
  const aliases: Record<string, string> = {
    "세션번호": "--session-number",
    "번호": "--session-number",
    "n": "--session-number",
    "sessionnumber": "--session-number",
    "세션명": "--session-name",
    "이름": "--session-name",
    "name": "--session-name",
    "sessionname": "--session-name",
    "에이전트": "--agent-id",
    "agent": "--agent-id",
    "agentid": "--agent-id",
    "프로젝트": "--project",
    "project": "--project"
  };
  return aliases[normalized];
}

function expandBlockOption(args: string[], parser: (block: string) => string[]): string[] {
  const blockIndex = args.indexOf("--block");
  if (blockIndex >= 0 && args[blockIndex + 1]) {
    return [...args.slice(0, blockIndex), ...parser(args[blockIndex + 1]), ...args.slice(blockIndex + 2)];
  }
  if (args[0]?.includes("{")) {
    return [...parser(args[0]), ...args.slice(1)];
  }
  return args;
}

function buildHcpStateMarkdown(summary: ReturnType<typeof buildHcpStateSummary>, extraDetail?: string): string {
  const selected = summary.selectedSession;
  return [
    "# HCP state",
    "",
    `- ${summary.detail}`,
    ...(selected ? [
      `- session id: ${selected.sessionId}`,
      `- session name: ${selected.sessionName || "(empty)"}`,
      `- session status: ${selected.status}`,
      `- tasks: ${selected.tasks.length}`
    ] : []),
    ...(extraDetail ? [`- ${extraDetail}`] : [])
  ].join("\n") + "\n";
}

function buildSessionStartOrder(sessionNumber?: string, recommendedSessionName?: string): string {
  return [
    "# HCP session start order required",
    "",
    "Session name is required before creating an HCP session state file.",
    "",
    "```text",
    "#세션시작{",
    `세션번호: ${sessionNumber ?? ""}`,
    `세션명: ${recommendedSessionName ?? ""}`,
    "에이전트: codex",
    "}",
    "```"
  ].join("\n") + "\n";
}

function parseIssueNumberFromText(value: string): number | undefined {
  const match = value.match(/issue #(\d+)/i);
  const number = match ? Number(match[1]) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function parseBranchNameFromText(value: string): string | undefined {
  return value.match(/checked out ([^\s]+) from /)?.[1];
}

function parsePullRequestUrlFromText(value: string): string | undefined {
  return value.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
}

function parsePullRequestNumberFromText(value: string): number | undefined {
  const url = parsePullRequestUrlFromText(value);
  const match = url?.match(/\/pull\/(\d+)/) ?? value.match(/pull request #(\d+)|PR #(\d+)/i);
  const raw = match?.[1] ?? match?.[2];
  const number = raw ? Number(raw) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function beginSessionCloseState(cwd: string, sessionId?: string, agentId?: string): {
  status: "updated" | "skipped" | "blocked";
  sessionId?: string;
  detail: string;
} {
  try {
    const session = resolveActiveSession(cwd, sessionId, agentId);
    transitionHcpSessionStatus(cwd, session.sessionId, "closing");
    return {
      status: "updated",
      sessionId: session.sessionId,
      detail: `session ${session.sessionId} moved to closing`
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "HCP session close state update unavailable";
    if (detail.startsWith("No active HCP session found")) {
      return { status: "skipped", detail };
    }
    return { status: "blocked", detail };
  }
}

function completeSessionCloseState(cwd: string, sessionId: string | undefined, executionStatus: "executed" | "blocked" | "skipped"): void {
  if (!sessionId) {
    return;
  }
  if (executionStatus === "executed") {
    transitionHcpSessionStatus(cwd, sessionId, "complete");
    return;
  }
  if (executionStatus === "blocked") {
    transitionHcpSessionStatus(cwd, sessionId, "blocked");
    return;
  }
  transitionHcpSessionStatus(cwd, sessionId, "failed");
}

function runHcpCommand(command: string | undefined, args: string[]): number {
  const [target, action] = [command, args[0]];
  const options = parseKeyValueArgs(args.slice(1));
  try {
    if (target === "session" && action === "update") {
      const session = updateHcpSession(process.cwd(), {
        sessionId: requiredOption(options, "session-id"),
        sessionName: options["session-name"],
        linkedIssueNumber: options.issue ? Number(options.issue.replace(/^#/, "")) : undefined,
        linkedIssueUrl: options["issue-url"]
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), session.sessionId), `updated session: ${session.sessionId}`));
      return 0;
    }
    if (target === "task" && action === "update") {
      const task = updateHcpTaskTitle(process.cwd(), {
        sessionId: requiredOption(options, "session-id"),
        taskId: requiredOption(options, "task-id"),
        taskName: requiredOption(options, "task-name")
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), options["session-id"]), `updated task: ${task.taskId}`));
      return 0;
    }
    if (target === "branch" && action === "update") {
      const task = updateHcpTaskBranch(process.cwd(), {
        sessionId: requiredOption(options, "session-id"),
        taskId: requiredOption(options, "task-id"),
        branchName: requiredOption(options, "branch-name")
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), options["session-id"]), `updated branch: ${task.taskId} ${task.branchName ?? ""}`));
      return 0;
    }
    if (target === "issue" && action === "update") {
      const issueNumber = Number(requiredOption(options, "issue").replace(/^#/, ""));
      const title = options.title;
      if (title && !options["state-only"]) {
        runExternal("gh", ["issue", "edit", String(issueNumber), "--title", title], process.cwd());
      }
      const session = updateHcpSession(process.cwd(), {
        sessionId: requiredOption(options, "session-id"),
        linkedIssueNumber: issueNumber,
        linkedIssueTitle: title
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), session.sessionId), `updated issue: #${issueNumber}`));
      return 0;
    }
    if (target === "pr" && action === "update") {
      const prNumber = Number(requiredOption(options, "pr").replace(/^#/, ""));
      const title = options.title;
      if (title && !options["state-only"]) {
        runExternal("gh", ["pr", "edit", String(prNumber), "--title", title], process.cwd());
      }
      const task = updateHcpTaskPullRequest(process.cwd(), {
        sessionId: requiredOption(options, "session-id"),
        taskId: options["task-id"],
        pullRequestNumber: prNumber,
        pullRequestTitle: title
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), options["session-id"]), `updated pr: ${task.taskId} #${prNumber}`));
      return 0;
    }
    if (target === "task" && action === "delete") {
      const task = deleteHcpTask(process.cwd(), {
        sessionId: requiredOption(options, "session-id"),
        taskId: requiredOption(options, "task-id"),
        reason: options.reason
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), options["session-id"]), `deleted task: ${task.taskId}`));
      return 0;
    }
    if (target === "backlog" && action === "add") {
      const item = addHcpBacklog(process.cwd(), {
        sessionId: requiredOption(options, "session-id"),
        title: requiredOption(options, "title"),
        backlogId: options["backlog-id"],
        path: options.path,
        note: options.note
      });
      console.log(buildHcpStateMarkdown(
        buildHcpStateSummary(process.cwd(), options["session-id"]),
        `added backlog: ${item.hcpBacklogId}; ${buildBacklogIndexSyncDetail(process.cwd(), item)}`
      ));
      return 0;
    }
    if (target === "backlog" && action === "update") {
      const item = updateHcpBacklog(process.cwd(), {
        sessionId: requiredOption(options, "session-id"),
        hcpBacklogId: requiredOption(options, "hcp-backlog-id"),
        title: options.title,
        status: options.status === "closed" ? "closed" : options.status === "open" ? "open" : undefined,
        backlogId: options["backlog-id"],
        path: options.path,
        note: options.note
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), options["session-id"]), `updated backlog: ${item.hcpBacklogId}`));
      return 0;
    }
    if (target === "backlog" && action === "delete") {
      const item = deleteHcpBacklog(process.cwd(), {
        sessionId: requiredOption(options, "session-id"),
        hcpBacklogId: requiredOption(options, "hcp-backlog-id"),
        reason: options.reason
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd(), options["session-id"]), `deleted backlog: ${item.hcpBacklogId}`));
      return 0;
    }
    if (target === "archived" && action === "cleanup") {
      const result = cleanupArchivedSessions(process.cwd(), {
        olderThanDays: options["older-than-days"] ? Number(options["older-than-days"]) : undefined,
        keep: options.keep ? Number(options.keep) : undefined,
        dryRun: Boolean(options["dry-run"])
      });
      console.log([
        "# HCP archived cleanup",
        "",
        `- deleted: ${result.deleted.length}`,
        `- kept: ${result.kept.length}`,
        ...(options["dry-run"] ? ["- mode: dry-run"] : [])
      ].join("\n") + "\n");
      return 0;
    }
  } catch (error) {
    console.log(buildHcpStateMarkdown(buildHcpStateSummary(process.cwd()), error instanceof Error ? error.message : "HCP command failed"));
    return 2;
  }

  printUsage();
  return 1;
}

function parseKeyValueArgs(args: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (key?.startsWith("--") && (!value || value.startsWith("--"))) {
      values[key.slice(2)] = "true";
      continue;
    }
    if (key?.startsWith("--") && value) {
      values[key.slice(2)] = value;
      index += 1;
    }
  }
  return values;
}

function requiredOption(options: Record<string, string>, key: string): string {
  const value = options[key];
  if (!value) {
    throw new Error(`missing required option: --${key}`);
  }
  return value;
}

function parseDbMigrateArgs(args: string[]): { execute?: boolean } {
  return {
    execute: args.includes("--execute")
  };
}

function parseDbBaselineArgs(mode: "init" | "reset", args: string[]): { mode: "init" | "reset"; execute?: boolean } {
  return {
    mode,
    execute: args.includes("--execute")
  };
}

function buildDbErrorMarkdown(title: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : "unknown error";
  const report = createReportDocument({
    title,
    summary: "Database command failed.",
    checks: [
      { name: "error", status: "blocked", detail }
    ]
  });
  return report.markdown;
}

export function tagCommandArgs(tag: HarnessTag, mode: "execute" | "report" | "merge", args: string[]): string[] {
  if (tag === "session_start") {
    const normalizedArgs = expandBlockOption(normalizeSessionNumberTagArgs(args), parseSessionStartBlockArgs);
    return mode === "execute" ? ["session", "start", ...normalizedArgs] : ["session", "start", "--no-state", ...normalizedArgs];
  }
  if (tag === "task_start") {
    return mode === "execute" ? ["task", "start", "--execute", ...args] : ["task", "start", ...args];
  }
  if (tag === "task_close") {
    return mode === "execute" || mode === "merge" ? ["task", "close", "--execute", ...args] : ["task", "close", ...args];
  }
  if (tag === "task_promote") {
    return mode === "execute" ? ["task", "promote", "--execute", ...args] : ["task", "promote", ...args];
  }
  if (tag === "session_close") {
    const normalizedArgs = normalizeSessionNumberTagArgs(args);
    if (mode === "reuse") {
      return ["session", "close", "--execute", "--reuse-open-pr", ...normalizedArgs];
    }
    return mode === "execute" ? ["session", "close", "--execute", ...normalizedArgs] : ["session", "close", ...normalizedArgs];
  }
  return ["report", "create"];
}

function inlineTagArgs(command: string, args: string[]): string[] {
  return command.includes("{") ? [command, ...args] : args;
}

function tagAliasCommandArgs(command: string, args: string[]): string[] | undefined {
  const token = command.trim().split(/\s+/)[0]?.replace(/\.보고$/, "").replace(/\{[\s\S]*$/, "");
  const blockArgs = command.includes("{") ? parseGenericHcpBlockArgs(command) : args;
  if (token === "#세션현행화") {
    return ["hcp", "session", "update", ...blockArgs];
  }
  if (token === "#태스크현행화") {
    return ["hcp", "task", "update", ...blockArgs];
  }
  if (token === "#백로그추가") {
    return ["hcp", "backlog", "add", ...blockArgs];
  }
  if (token === "#백로그수정") {
    return ["hcp", "backlog", "update", ...blockArgs];
  }
  if (token === "#백로그삭제") {
    return ["hcp", "backlog", "delete", ...blockArgs];
  }
  if (token === "#브랜치현행화") {
    return ["hcp", "branch", "update", ...blockArgs];
  }
  return undefined;
}

function parseGenericHcpBlockArgs(block: string): string[] {
  const body = block.match(/#[^\s{]+\s*\{([\s\S]*)\}/)?.[1] ?? block;
  const args: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "}") {
      continue;
    }
    const match = line.match(/^([^:=]+)\s*[:=]\s*(.*)$/);
    if (!match) {
      continue;
    }
    const option = normalizeHcpAliasBlockKey(match[1]);
    const value = match[2].trim();
    if (option && value) {
      args.push(option, value);
    }
  }
  return args;
}

function normalizeHcpAliasBlockKey(key: string): string | undefined {
  const normalized = key.replace(/\s+/g, "").toLowerCase();
  const aliases: Record<string, string> = {
    "세션id": "--session-id",
    "sessionid": "--session-id",
    "sid": "--session-id",
    "태스크id": "--task-id",
    "taskid": "--task-id",
    "tid": "--task-id",
    "세션명": "--session-name",
    "sessionname": "--session-name",
    "태스크명": "--task-name",
    "taskname": "--task-name",
    "백로그id": "--hcp-backlog-id",
    "hcpbacklogid": "--hcp-backlog-id",
    "제목": "--title",
    "title": "--title",
    "상태": "--status",
    "status": "--status",
    "브랜치명": "--branch-name",
    "branchname": "--branch-name",
    "이슈": "--issue",
    "issue": "--issue",
    "pr": "--pr",
    "피알": "--pr",
    "경로": "--path",
    "path": "--path",
    "메모": "--note",
    "note": "--note",
    "사유": "--reason",
    "reason": "--reason"
  };
  return aliases[normalized];
}

function applyTaskIdFromHcpState(
  input: { agentId?: string; sessionId?: string; taskId?: string },
  expectedStatus: "active" | "closed",
  tag: string
): { status: "ready" | "blocked"; markdown?: string } {
  if (input.taskId) {
    return { status: "ready" };
  }
  try {
    const session = input.sessionId
      ? readSessionById(process.cwd(), input.sessionId)
      : resolveActiveSession(process.cwd(), undefined, input.agentId);
    const candidates = session.tasks.filter((task) => task.status === expectedStatus);
    if (candidates.length === 1) {
      input.sessionId = session.sessionId;
      input.taskId = candidates[0].taskId;
      return { status: "ready" };
    }
    return {
      status: "blocked",
      markdown: buildTaskIdOrder(tag, session.sessionId, candidates, expectedStatus)
    };
  } catch (error) {
    return {
      status: "blocked",
      markdown: [
        "# HCP task id required",
        "",
        error instanceof Error ? error.message : "HCP task state lookup failed"
      ].join("\n") + "\n"
    };
  }
}

function buildTaskIdOrder(
  tag: string,
  sessionId: string,
  candidates: { taskId: string; taskName: string; status: string }[],
  expectedStatus: string
): string {
  return [
    "# HCP task id order required",
    "",
    `Expected task status: ${expectedStatus}`,
    `Candidate count: ${candidates.length}`,
    "",
    ...(candidates.length > 0 ? candidates.map((task) => `- ${task.taskId}: ${task.taskName}`) : ["- no candidate"]),
    "",
    "```text",
    `${tag}{`,
    `sessionId: ${sessionId}`,
    "taskId: ",
    "}",
    "```"
  ].join("\n") + "\n";
}

function runExternal(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function normalizeSessionNumberTagArgs(args: string[]): string[] {
  const [firstArg, ...rest] = args;
  if (firstArg && /^\d{1,3}$/.test(firstArg)) {
    return ["--session-number", firstArg.padStart(3, "0"), ...rest];
  }
  return args;
}
