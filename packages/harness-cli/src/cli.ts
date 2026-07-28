#!/usr/bin/env node

import { checkGate, type HarnessAction, type HarnessTag } from "./gates/check-gate.ts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createBacklogDocument, findBacklogDocumentByMarker } from "./docs/backlog-document.ts";
import { hasBacklogIndexEntry, parseBacklogIndex } from "./docs/backlog-index.ts";
import { parseRetrospectiveDetail } from "./docs/retrospective-detail.ts";
import { parseLatestRetrospective } from "./docs/retrospective-index.ts";
import { readInternalGitStatus } from "./git/git-status.ts";
import { resolveRepositoryRoot } from "./git/repo-root.ts";
import { pullRequestMergeMatchesDevTarget } from "./github/pr-dev-relationship.ts";
import { readGitHubOpenStatus } from "./github/github-status.ts";
import { runDbCheck } from "./db/db-check.ts";
import { runDbMigrate } from "./db/db-migrate.ts";
import { runDbBaseline } from "./db/db-baseline.ts";
import { runDbValidate } from "./db/db-validate.ts";
import { runDictionaryList } from "./db/dictionary.ts";
import { buildLifecycleReport } from "./flows/lifecycle-flow.ts";
import { beginSessionCloseState, buildSessionCloseReport, completeSessionCloseState, enrichSessionCloseInputWithAutoStatus, enrichSessionCloseInputWithHcpState, executeSessionClose, parseSessionCloseArgs } from "./flows/session-close.ts";
import { buildSessionStartReport } from "./flows/session-start.ts";
import { readProjectPreflight } from "./flows/project-preflight.ts";
import { buildTaskCloseReport, executeTaskClose, parseTaskCloseArgs, parseTaskCloseBlock, readTaskCloseGitSummary } from "./flows/task-close.ts";
import { buildTaskProcessReport, parseTaskProcessArgs, type TaskProcessInput } from "./flows/task-process.ts";
import { buildTaskPromoteReport, executeTaskPromote, parseTaskPromoteArgs, readTaskPromoteBranchStatus } from "./flows/task-promote.ts";
import { buildTaskStartReport, buildTaskStartStateRegistrationRecovery, executeTaskStart, parseTaskStartArgs, parseTaskStartBlock } from "./flows/task-start.ts";
import { checkProjectAccess, loadProjectProfile, resolveProjectLocalPath } from "./projects/project-profile.ts";
import { createReportDocument } from "./reports/create-report.ts";
import { checkRequiredEnv } from "./security/env-check.ts";
import { buildSessionPlan } from "./session/session-plan.ts";
import { approveLoopCondition, beginLoopWorkItemImplementation, buildRollbackReport, completeLoopWorkItemImplementation, createLoopCheckpoint, createLoopRun, executeApprovedRollback, listLoopRuns, recoverStaleLoopLeases, restoreLoop, reviseLoopAnalysis, runNextLoopWorkItem, selectLoopCandidates, softDeleteLoop, transitionLoop, validateWorkItems, type LoopWorkItemDefinition } from "./state/loop-state.ts";
import {
  addHcpBacklog,
  addHcpWorkItem,
  applyPendingHcpWorkFeedback,
  addHcpTask,
  buildHcpWorkItemGraph,
  buildHcpWorkItemMermaid,
  buildHcpWorkChangeResponse,
  buildHcpStateSummary,
  cleanupArchivedSessions,
  createHcpSession,
  deleteHcpBacklog,
  deleteHcpTask,
  evaluateHcpTaskCloseReadiness,
  readSessionById,
  linkHcpTaskLoop,
  recordHcpTaskProcessEvidence,
  recordHcpTaskRecoveryEvidence,
  recordHcpLifecyclePolicyEvidence,
  recordHcpWorkFeedback,
  requireHcpWorkChangeSetAfter,
  resolveActiveSession,
  resolveHcpSourceBacklogs,
  syncHcpSessionWorkItems,
  transitionHcpTaskPhase,
  updateHcpTaskBranch,
  updateHcpTaskPullRequest,
  updateHcpBacklog,
  updateHcpSession,
  updateHcpTask,
  updateHcpTaskRelations,
  updateHcpTaskTitle,
  updateHcpWorkItem,
  type HcpWorkItemStatus
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
  jkadh project preflight <project_id>
  jkadh session close [--execute --verified-issue <number> --reuse-open-pr]
  jkadh task start [--execute --issue-title <title> --branch <branch>]
  jkadh task process [--execute --session-id <id> --task-id <id>]
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
  jkadh hcp work add|update|graph
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

  if (scope === "project" && command === "preflight") {
    const projectId = firstArg ?? "jkadh";
    let profile;
    try {
      profile = await loadProjectProfile(projectId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "ProjectProfile load failed";
      console.log(`# Project target preflight\n\n- project: ${projectId}\n- status: blocked\n\n## Blockers\n\n- ${detail}\n`);
      return 2;
    }
    const access = checkProjectAccess(profile);
    if (access.status === "blocked") {
      console.log(`# Project target preflight\n\n- project: ${profile.project_id}\n- status: blocked\n- access: ${access.reason}\n`);
      return 2;
    }
    const repositoryRoot = resolveGitRoot(process.cwd());
    const report = readProjectPreflight(profile, repositoryRoot);
    console.log(report.markdown);
    return report.status === "blocked" ? 2 : 0;
  }

  if (scope === "session" && command === "start") {
    const sessionStartOptions = parseSessionStartOptions(expandBlockOption(argv.slice(2), parseSessionStartBlockArgs));
    const projectId = sessionStartOptions.projectId;
    const profile = await loadProjectProfile(projectId);
    const repositoryRoot = resolveGitRoot(process.cwd());
    const projectPath = resolveProjectLocalPath(profile, repositoryRoot);
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

    const retrospective = readLatestRetrospective(projectPath);
    const retrospectiveDetail = retrospective ? readRetrospectiveDetail(projectPath, retrospective.path) : undefined;
    const github = readGitHubOpenStatus(profile.repo_full_name, projectPath);
    const relatedIssue = findRelatedIssue(github.issues, retrospectiveDetail?.recommendedStartPoint);

    const report = buildSessionStartReport({
      branchStatus: readInternalGitStatus(projectPath),
      backlog: {
        candidates: readBacklogCandidates(projectPath)
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
        const session = createHcpSession(projectPath, {
          agentId: sessionStartOptions.agentId,
          sessionNumber: sessionStartOptions.sessionNumber,
          sessionName
        });
        console.log(buildHcpStateMarkdown(buildHcpStateSummary(projectPath, session.sessionId)));
      } catch (error) {
        console.log(buildHcpStateMarkdown(
          buildHcpStateSummary(projectPath),
          error instanceof Error ? error.message : "HCP session creation failed"
        ));
        return 2;
      }
    }
    return 0;
  }

  if (scope === "session" && command === "close") {
    const repoRoot = resolveGitRoot(process.cwd());
    const input = enrichSessionCloseInputWithAutoStatus(
      enrichSessionCloseInputWithHcpState(parseSessionCloseArgs(argv.slice(2)), repoRoot),
      repoRoot
    );
    const report = buildSessionCloseReport(input);
    if (input.execution?.enabled && input.sessionId) recordHcpLifecyclePolicyEvidence(repoRoot, {
      sessionId: input.sessionId,
      stage: "session_close",
      outcome: report.status === "ready" ? "passed" : "blocked",
      evaluatedPolicies: report.json.policyResults
    });
    console.log(report.markdown);
    if (input.execution?.enabled) {
      const sessionState = beginSessionCloseState(input, repoRoot);
      if (sessionState.status === "blocked") {
        console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, input.sessionId), sessionState.detail));
        return 2;
      }
      const execution = executeSessionClose(sessionState.executionInput, repoRoot);
      console.log(execution.markdown);
      completeSessionCloseState(repoRoot, sessionState.sessionId, execution.status, execution.recovery);
      if (sessionState.sessionId) {
        console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, sessionState.sessionId)));
      }
      return execution.status === "executed" ? 0 : 2;
    }
    return 0;
  }

  if (scope === "task" && command === "start") {
    const repoRoot = resolveGitRoot(process.cwd());
    const taskStartArgs = argv.slice(2);
    const blockIndex = taskStartArgs.indexOf("--block");
    const input = blockIndex >= 0 && taskStartArgs[blockIndex + 1]
      ? parseTaskStartBlock(taskStartArgs[blockIndex + 1])
      : parseTaskStartArgs(taskStartArgs);
    const report = buildTaskStartReport(input);
    console.log(report.markdown);
    if (input.execution?.enabled) {
      const evidenceSessionId = input.sessionId ?? resolveActiveSession(repoRoot, undefined, input.agentId).sessionId;
      const execution = executeTaskStart(input, repoRoot);
      console.log(execution.markdown);
      if (execution.status !== "executed") recordHcpLifecyclePolicyEvidence(repoRoot, {
        sessionId: evidenceSessionId,
        stage: "task_start",
        outcome: "blocked",
        evaluatedPolicies: report.json.policyResults
      });
      if (execution.status === "executed") {
        try {
          const task = addHcpTask(repoRoot, {
            agentId: input.agentId,
            sessionId: input.sessionId,
            taskName: input.taskName ?? input.scope ?? input.workOrderId ?? "Harness task",
            issueNumber: input.issueNumber ?? parseIssueNumberFromText(execution.markdown),
            branchName: parseBranchNameFromText(execution.markdown),
            scope: input.scope,
            outOfScope: input.outOfScope,
            completionCriteria: input.completionCriteria,
            verificationMethod: input.verificationMethod
            ,sourceBacklogIds: input.sourceBacklogIds
          });
          console.log(buildHcpStateMarkdown(
            buildHcpStateSummary(repoRoot, input.sessionId),
            `작업 단계: 준비단계 완료; 구현상태: 구현 대기; registered task: ${task.taskId}`
          ));
          applyPendingHcpWorkFeedback(repoRoot, input.sessionId ?? evidenceSessionId);
          const previousWorkChangeCount = readSessionById(repoRoot, input.sessionId ?? evidenceSessionId).workChangeSets?.length ?? 0;
          syncHcpSessionWorkItems(repoRoot, {
            sessionId: input.sessionId ?? evidenceSessionId,
            sourceCommand: "task_start",
            sourceTaskId: task.taskId,
            items: [{ title: task.taskName, status: "ready", reason: "task start response automatically registered" }],
            excludedSuggestions: ["issue and branch creation commands"]
          });
          const workChange = requireHcpWorkChangeSetAfter(repoRoot, input.sessionId ?? evidenceSessionId, "task_start", previousWorkChangeCount, task.taskId);
          console.log(buildHcpWorkChangeResponse(readSessionById(repoRoot, input.sessionId ?? evidenceSessionId), workChange));
          recordHcpLifecyclePolicyEvidence(repoRoot, {
            sessionId: evidenceSessionId,
            taskId: task.taskId,
            stage: "task_start",
            outcome: "passed",
            evaluatedPolicies: report.json.policyResults
          });
        } catch (error) {
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, input.sessionId), error instanceof Error ? error.message : "HCP task state registration failed"));
          console.log(buildTaskStartStateRegistrationRecovery(execution, input.sessionId, error));
          return 2;
        }
      }
      return execution.status === "executed" ? 0 : 2;
    }
    return 0;
  }

  if (scope === "task" && command === "process") {
    const repoRoot = resolveGitRoot(process.cwd());
    const input = enrichTaskProcessInput(parseTaskProcessArgs(argv.slice(2)), repoRoot);
    const report = buildTaskProcessReport(input);
    console.log(report.markdown);
    if (input.execution?.enabled) {
      if (input.sessionId && input.taskId) {
        recordHcpTaskProcessEvidence(repoRoot, {
          sessionId: input.sessionId,
          taskId: input.taskId,
          status: report.json.remediation.status,
          iterations: report.json.remediation.iterations,
          nextAction: report.json.remediation.nextAction
        });
        recordHcpLifecyclePolicyEvidence(repoRoot, {
          sessionId: input.sessionId,
          taskId: input.taskId,
          stage: "task_process",
          outcome: report.status === "ready" ? "passed" : "blocked",
          evaluatedPolicies: report.json.policyResults
        });
        if (report.status === "ready") transitionHcpTaskPhase(repoRoot, input.sessionId, input.taskId, "implementing");
        if (report.status === "ready") {
          const session = readSessionById(repoRoot, input.sessionId);
          const task = session.tasks.find((candidate) => candidate.taskId === input.taskId);
          if (task) {
            applyPendingHcpWorkFeedback(repoRoot, input.sessionId);
            const previousWorkChangeCount = readSessionById(repoRoot, input.sessionId).workChangeSets?.length ?? 0;
            syncHcpSessionWorkItems(repoRoot, {
              sessionId: input.sessionId,
              sourceCommand: "task_process",
              sourceTaskId: task.taskId,
              items: [{ title: task.taskName, status: "active", reason: "task process response automatically registered" }],
              excludedSuggestions: ["status checks and code discovery commands"]
            });
            const workChange = requireHcpWorkChangeSetAfter(repoRoot, input.sessionId, "task_process", previousWorkChangeCount, task.taskId);
            console.log(buildHcpWorkChangeResponse(readSessionById(repoRoot, input.sessionId), workChange));
          }
        }
      }
      console.log(report.status === "ready"
        ? "# Task process execution\n\n- [pass] implementation boundary: ready; task remains active\n"
        : "# Task process execution\n\n- [blocked] implementation boundary: run #태스크시작 or select the active task before modifying files\n");
    }
    return report.status === "ready" ? 0 : 2;
  }

  if (scope === "task" && command === "close") {
    const repoRoot = resolveGitRoot(process.cwd());
    const taskCloseArgs = argv.slice(2);
    const blockIndex = taskCloseArgs.indexOf("--block");
    const input = blockIndex >= 0 && taskCloseArgs[blockIndex + 1]
      ? parseTaskCloseBlock(taskCloseArgs[blockIndex + 1])
      : parseTaskCloseArgs(taskCloseArgs);
    if (input.execution?.enabled) {
      const taskSelection = applyTaskIdFromHcpState(input, "active", "#태스크정리", repoRoot);
      if (taskSelection.status === "blocked") {
        console.log(taskSelection.markdown);
        return 2;
      }
      const selectedTask = readSessionById(repoRoot, input.sessionId!).tasks.find((task) => task.taskId === input.taskId);
      if (!selectedTask) throw new Error(`HCP task not found: ${input.taskId}`);
      const closeReadiness = evaluateHcpTaskCloseReadiness(selectedTask);
      if (!closeReadiness.ready) {
        console.log(`# Task close blocked by completion discovery\n\n${closeReadiness.reasons.map((reason) => `- ${reason}`).join("\n")}\n`);
        return 2;
      }
      const loopBlockers = listLoopRuns(repoRoot, input.taskId, true).filter((loop) => !["completed", "deleted"].includes(loop.status));
      const deletedRequired = listLoopRuns(repoRoot, input.taskId, true).filter((loop) => loop.status === "deleted" && loop.required && !loop.deletion?.replacementLoopId && !loop.deletion?.exclusionApproved);
      if (loopBlockers.length || deletedRequired.length) {
        console.log(`# Task close blocked by loops\n\n${[...loopBlockers, ...deletedRequired].map((loop) => `- ${loop.loopId}: ${loop.status}`).join("\n")}\n`);
        return 2;
      }
    }
    const report = buildTaskCloseReport({
      ...input,
      gitSummary: readTaskCloseGitSummary(repoRoot)
    });
    console.log(report.markdown);
    if (input.execution?.enabled) {
      if (input.sessionId) recordHcpLifecyclePolicyEvidence(repoRoot, {
        sessionId: input.sessionId,
        taskId: input.taskId,
        stage: "task_close",
        outcome: report.status === "ready" ? "passed" : "blocked",
        evaluatedPolicies: report.json.policyResults
      });
      const execution = executeTaskClose(input, repoRoot);
      console.log(execution.markdown);
      if (execution.status === "blocked" && execution.recovery && input.sessionId && input.taskId) {
        recordHcpTaskRecoveryEvidence(repoRoot, {
          sessionId: input.sessionId,
          taskId: input.taskId,
          failedAction: execution.recovery.failedAction,
          completedActions: execution.recovery.completedActions,
          category: execution.recovery.category,
          retryable: execution.recovery.retryable,
          failure: execution.recovery.failure,
          recoveryAction: execution.recovery.recovery
        });
      }
      if (execution.status === "executed") {
        try {
          const task = updateHcpTask(repoRoot, {
            agentId: input.agentId,
            sessionId: input.sessionId,
            taskId: input.taskId,
            expectedStatus: "active",
            status: "closed",
            pullRequestNumber: parsePullRequestNumberFromText(execution.markdown),
            pullRequestUrl: parsePullRequestUrlFromText(execution.markdown),
            closeEvidence: {
              source: "task_close",
              outcome: "passed",
              completionSummary: input.completionSummary ?? "",
              verificationResult: input.verificationResult ?? "",
              outOfScope: input.outOfScope ?? "",
              remainingWork: input.remainingWork ?? ""
            }
          });
          if (task.sourceBacklogIds?.length) resolveHcpSourceBacklogs(repoRoot, {
            sourceBacklogIds: task.sourceBacklogIds,
            taskId: task.taskId,
            issueNumber: task.issueNumber,
            verificationResult: input.verificationResult ?? ""
          });
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, input.sessionId), `closed task: ${task.taskId}`));
          applyPendingHcpWorkFeedback(repoRoot, session.sessionId);
          const previousWorkChangeCount = readSessionById(repoRoot, input.sessionId!).workChangeSets?.length ?? 0;
          syncHcpSessionWorkItems(repoRoot, {
            sessionId: input.sessionId!,
            sourceCommand: "task_process",
            sourceTaskId: task.taskId,
            items: [{ title: task.taskName, status: "done", reason: "task close response automatically completed" }]
          });
          const workChange = requireHcpWorkChangeSetAfter(repoRoot, input.sessionId!, "task_process", previousWorkChangeCount, task.taskId);
          console.log(buildHcpWorkChangeResponse(readSessionById(repoRoot, input.sessionId!), workChange));
        } catch (error) {
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, input.sessionId), error instanceof Error ? error.message : "HCP task close state update failed"));
          return 2;
        }
      }
      return execution.status === "executed" ? 0 : 2;
    }
    return 0;
  }

  if (scope === "task" && command === "promote") {
    const repoRoot = resolveGitRoot(process.cwd());
    const input = parseTaskPromoteArgs(argv.slice(2));
    if (input.execution?.enabled) {
      const taskSelection = applyTaskIdFromHcpState(input, "closed", "#태스크승급", repoRoot);
      if (taskSelection.status === "blocked") {
        console.log(taskSelection.markdown);
        return 2;
      }
    }
    const reportInput = {
      ...input,
      ...(input.execution?.enabled
        ? readTaskPromoteHcpPolicyInput(repoRoot, input.sessionId, input.taskId, input.targetCommit)
        : {}),
      branchStatus: readTaskPromoteBranchStatus(input, repoRoot)
    };
    const report = buildTaskPromoteReport(reportInput);
    console.log(report.markdown);
    if (input.execution?.enabled) {
      if (input.sessionId) recordHcpLifecyclePolicyEvidence(repoRoot, {
        sessionId: input.sessionId,
        taskId: input.taskId,
        stage: "task_promote",
        outcome: report.status === "ready" ? "passed" : "blocked",
        evaluatedPolicies: report.json.policyResults
      });
      const execution = executeTaskPromote(reportInput, repoRoot);
      console.log(execution.markdown);
      if (execution.status === "executed") {
        try {
          const task = updateHcpTask(repoRoot, {
            agentId: input.agentId,
            sessionId: input.sessionId,
            taskId: input.taskId,
            expectedStatus: "closed",
            status: "promoted"
          });
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, input.sessionId), `promoted task: ${task.taskId}`));
        } catch (error) {
          console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, input.sessionId), error instanceof Error ? error.message : "HCP task promote state update failed"));
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

  if (scope === "loop" && command) {
    return runLoopCommand(command, argv.slice(2));
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

function runHcpCommand(command: string | undefined, args: string[]): number {
  const [target, action] = [command, args[0]];
  const options = parseKeyValueArgs(args.slice(1));
  const repoRoot = resolveGitRoot(process.cwd());
  try {
    if (target === "session" && action === "update") {
      const session = updateHcpSession(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        sessionName: options["session-name"],
        linkedIssueNumber: options.issue ? Number(options.issue.replace(/^#/, "")) : undefined,
        linkedIssueUrl: options["issue-url"]
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, session.sessionId), `updated session: ${session.sessionId}`));
      return 0;
    }
    if (target === "task" && action === "update") {
      const task = updateHcpTaskTitle(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        taskId: requiredOption(options, "task-id"),
        taskName: requiredOption(options, "task-name")
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, options["session-id"]), `updated task: ${task.taskId}`));
      return 0;
    }
    if (target === "branch" && action === "update") {
      const task = updateHcpTaskBranch(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        taskId: requiredOption(options, "task-id"),
        branchName: requiredOption(options, "branch-name")
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, options["session-id"]), `updated branch: ${task.taskId} ${task.branchName ?? ""}`));
      return 0;
    }
    if (target === "issue" && action === "update") {
      const issueNumber = Number(requiredOption(options, "issue").replace(/^#/, ""));
      const title = options.title;
      if (title && !options["state-only"]) {
        runExternal("gh", ["issue", "edit", String(issueNumber), "--title", title], repoRoot);
      }
      const session = updateHcpSession(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        linkedIssueNumber: issueNumber,
        linkedIssueTitle: title
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, session.sessionId), `updated issue: #${issueNumber}`));
      return 0;
    }
    if (target === "pr" && action === "update") {
      const prNumber = Number(requiredOption(options, "pr").replace(/^#/, ""));
      const title = options.title;
      if (title && !options["state-only"]) {
        runExternal("gh", ["pr", "edit", String(prNumber), "--title", title], repoRoot);
      }
      const task = updateHcpTaskPullRequest(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        taskId: options["task-id"],
        pullRequestNumber: prNumber,
        pullRequestTitle: title
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, options["session-id"]), `updated pr: ${task.taskId} #${prNumber}`));
      return 0;
    }
    if (target === "task" && action === "delete") {
      const task = deleteHcpTask(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        taskId: requiredOption(options, "task-id"),
        reason: options.reason
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, options["session-id"]), `deleted task: ${task.taskId}`));
      return 0;
    }
    if (target === "backlog" && action === "add") {
      if (options.document || !options["session-id"]) {
        const title = requiredOption(options, "title");
        let session: ReturnType<typeof readSessionById> | undefined;
        try {
          session = options["session-id"] ? readSessionById(repoRoot, options["session-id"]) : resolveActiveSession(repoRoot);
        } catch {
          // Document Backlog can be created outside an active HCP session.
        }
        const responseMarker = session ? `HCP response-backlog:${session.sessionId}:${title.trim().toLowerCase().replace(/\s+/g, " ")}` : undefined;
        const recovered = responseMarker ? findBacklogDocumentByMarker(repoRoot, responseMarker) : undefined;
        const created = recovered ? undefined : createBacklogDocument(repoRoot, {
          title,
          marker: responseMarker,
          status: options.status,
          type: options.type,
          date: options.date,
          timing: options.timing,
          priority: options.priority,
          dependency: options.dependency,
          source: options.source,
          content: options.content,
          background: options.background,
          expectedEffect: options["expected-effect"],
          criteria: options.criteria
        });
        const result = created ?? {
          ...recovered!,
          title,
          gate: { status: "pass" as const, detail: `reused backlog after HCP response-link retry: ${recovered!.filePath}` }
        };
        console.log([
          "# Harness CLI backlog add",
          "",
          "Document Backlog created and indexed.",
          "",
          "## Checks",
          "",
          `- [pass] backlog id: ${result.backlogId}`,
          `- [pass] document path: ${result.filePath}`,
          `- [pass] backlog index: ${result.indexPath}`,
          `- [${result.gate.status}] ${result.gate.detail}`
        ].join("\n") + "\n");
        if (session) {
          applyPendingHcpWorkFeedback(repoRoot, session.sessionId);
          const previousWorkChangeCount = readSessionById(repoRoot, session.sessionId).workChangeSets?.length ?? 0;
          syncHcpSessionWorkItems(repoRoot, {
            sessionId: session.sessionId,
            sourceCommand: "backlog_add",
            items: [{ title: `Backlog 등록: ${result.title}`, status: "done", reason: "backlog add response automatically registered", detail: `${result.backlogId} ${result.filePath}` }]
          });
          const workChange = requireHcpWorkChangeSetAfter(repoRoot, session.sessionId, "backlog_add", previousWorkChangeCount);
          console.log(buildHcpWorkChangeResponse(readSessionById(repoRoot, session.sessionId), workChange));
        }
        return 0;
      }
      const item = addHcpBacklog(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        title: requiredOption(options, "title"),
        backlogId: options["backlog-id"],
        path: options.path,
        note: options.note
      });
      console.log(buildHcpStateMarkdown(
        buildHcpStateSummary(repoRoot, options["session-id"]),
        `added backlog: ${item.hcpBacklogId}; ${buildBacklogIndexSyncDetail(repoRoot, item)}`
      ));
      const sessionId = requiredOption(options, "session-id");
      applyPendingHcpWorkFeedback(repoRoot, sessionId);
      const previousWorkChangeCount = readSessionById(repoRoot, sessionId).workChangeSets?.length ?? 0;
      syncHcpSessionWorkItems(repoRoot, {
        sessionId,
        sourceCommand: "backlog_add",
        items: [{ title: `Backlog 등록: ${item.title}`, status: "done", reason: "hcp backlog add response automatically registered", detail: item.backlogId ?? item.hcpBacklogId }]
      });
      const workChange = requireHcpWorkChangeSetAfter(repoRoot, sessionId, "backlog_add", previousWorkChangeCount);
      console.log(buildHcpWorkChangeResponse(readSessionById(repoRoot, sessionId), workChange));
      return 0;
    }
    if (target === "backlog" && action === "update") {
      const item = updateHcpBacklog(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        hcpBacklogId: requiredOption(options, "hcp-backlog-id"),
        title: options.title,
        status: options.status === "closed" ? "closed" : options.status === "open" ? "open" : undefined,
        backlogId: options["backlog-id"],
        path: options.path,
        note: options.note
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, options["session-id"]), `updated backlog: ${item.hcpBacklogId}`));
      return 0;
    }
    if (target === "backlog" && action === "delete") {
      const item = deleteHcpBacklog(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        hcpBacklogId: requiredOption(options, "hcp-backlog-id"),
        reason: options.reason
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, options["session-id"]), `deleted backlog: ${item.hcpBacklogId}`));
      return 0;
    }
    if (target === "task" && action === "relate") {
      const task = updateHcpTaskRelations(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        taskId: requiredOption(options, "task-id"),
        parentTaskId: options["parent-task-id"],
        derivedFromTaskId: options["derived-from-task-id"],
        dependsOnTaskIds: options["depends-on-task"] ? splitList(options["depends-on-task"]) : undefined,
        reason: requiredOption(options, "reason")
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, options["session-id"]), `updated task relations: ${task.taskId}`));
      return 0;
    }
    if (target === "work" && action === "add") {
      const item = addHcpWorkItem(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        title: requiredOption(options, "title"),
        status: parseWorkItemStatus(options.status),
        sourceTaskId: options["source-task-id"],
        parentId: options["parent-id"],
        derivedFromId: options["derived-from-id"],
        dependsOnIds: options["depends-on"] ? splitList(options["depends-on"]) : [],
        reason: options.reason,
        detail: options.detail
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, options["session-id"]), `added work item: ${item.workItemId} ${item.displayId}`));
      return 0;
    }
    if (target === "work" && action === "update") {
      const item = updateHcpWorkItem(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        workItemId: requiredOption(options, "work-item-id"),
        title: options.title,
        status: parseWorkItemStatus(options.status),
        parentId: options["parent-id"],
        derivedFromId: options["derived-from-id"],
        dependsOnIds: options["depends-on"] ? splitList(options["depends-on"]) : undefined,
        reason: options.reason,
        detail: options.detail,
        resolutionTaskId: options["resolution-task-id"],
        backlogId: options["backlog-id"],
        backlogPath: options["backlog-path"]
      });
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, options["session-id"]), `updated work item: ${item.workItemId} [${item.status}]`));
      return 0;
    }
    if (target === "work" && action === "decide") {
      const sessionId = requiredOption(options, "session-id");
      const workItemId = requiredOption(options, "work-item-id");
      const decision = requiredOption(options, "decision");
      const reason = requiredOption(options, "reason");
      const session = readSessionById(repoRoot, sessionId);
      const item = (session.workItems ?? []).find((candidate) => candidate.workItemId === workItemId);
      if (!item) throw new Error(`HCP work item not found: ${workItemId}`);
      if (decision === "cancel") {
        updateHcpWorkItem(repoRoot, { sessionId, workItemId, status: "cancelled", reason, detail: options.detail });
      } else if (decision === "task") {
        const resolutionTaskId = requiredOption(options, "resolution-task-id");
        const resolutionTask = session.tasks.find((task) => task.taskId === resolutionTaskId);
        if (!resolutionTask) throw new Error(`HCP resolution task not found: ${resolutionTaskId}`);
        updateHcpWorkItem(repoRoot, {
          sessionId,
          workItemId,
          status: resolutionTask.status === "promoted" ? "done" : "deferred",
          resolutionTaskId,
          reason,
          detail: resolutionTask.status === "promoted" ? "linked task promoted" : "linked task must be promoted before completion"
        });
      } else if (decision === "backlog") {
        const marker = `HCP ${item.backlogCandidateId ?? `candidate:${item.workItemId}`}`;
        const existing = findBacklogDocumentByMarker(repoRoot, marker);
        const backlog = existing ?? createBacklogDocument(repoRoot, {
          title: options.title ?? item.title,
          source: marker,
          content: options.content ?? `${item.title}을 Work Item ${item.workItemId}에서 승인된 Backlog로 전환한다.`,
          dependency: item.sourceTaskId ?? "-"
        });
        if ("gate" in backlog && backlog.gate.status !== "pass") throw new Error(backlog.gate.detail);
        updateHcpWorkItem(repoRoot, {
          sessionId,
          workItemId,
          status: "backlogged",
          backlogId: backlog.backlogId,
          backlogPath: backlog.filePath,
          reason,
          detail: existing ? "reused existing backlog evidence" : "created and verified backlog document and index"
        });
      } else {
        throw new Error(`invalid work item decision: ${decision}`);
      }
      const resolved = readSessionById(repoRoot, sessionId).workItems?.find((candidate) => candidate.workItemId === workItemId);
      console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot, sessionId), `decided work item: ${workItemId} -> ${resolved?.status}`));
      return 0;
    }
    if (target === "work" && action === "graph") {
      const session = readSessionById(repoRoot, requiredOption(options, "session-id"));
      console.log(`${buildHcpWorkItemGraph(session)}\n\n${buildHcpWorkItemMermaid(session)}\n`);
      return 0;
    }
    if (target === "work" && action === "sync") {
      const sessionId = requiredOption(options, "session-id");
      const sourceCommand = requiredOption(options, "source-command");
      if (!["task_start", "task_process", "backlog_add"].includes(sourceCommand)) throw new Error(`invalid work sync source: ${sourceCommand}`);
      const previousWorkChangeCount = readSessionById(repoRoot, sessionId).workChangeSets?.length ?? 0;
      syncHcpSessionWorkItems(repoRoot, {
        sessionId,
        sourceCommand: sourceCommand as "task_start" | "task_process" | "backlog_add",
        sourceTaskId: options["task-id"],
        sourceTurnId: options["turn-id"],
        items: parseResponseWorkItems(requiredOption(options, "items")),
        excludedSuggestions: options.excluded ? options.excluded.split("||").map((value) => value.trim()).filter(Boolean) : []
      });
      const workChange = requireHcpWorkChangeSetAfter(
        repoRoot,
        sessionId,
        sourceCommand as "task_start" | "task_process" | "backlog_add",
        previousWorkChangeCount,
        options["task-id"]
      );
      console.log(buildHcpWorkChangeResponse(readSessionById(repoRoot, sessionId), workChange));
      return 0;
    }
    if (target === "work" && action === "feedback") {
      const feedback = recordHcpWorkFeedback(repoRoot, {
        sessionId: requiredOption(options, "session-id"),
        workItemId: requiredOption(options, "work-item-id"),
        title: options.title,
        status: parseWorkItemStatus(options.status),
        parentId: options["parent-id"],
        dependsOnIds: options["depends-on"] ? splitList(options["depends-on"]) : undefined,
        reason: requiredOption(options, "reason")
      });
      console.log(`# Session work feedback\n\n- feedback id: ${feedback.feedbackId}\n- status: pending\n- apply timing: next HCP task start, task process, or backlog add execution\n`);
      return 0;
    }
    if (target === "archived" && action === "cleanup") {
      const result = cleanupArchivedSessions(repoRoot, {
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
    console.log(buildHcpStateMarkdown(buildHcpStateSummary(repoRoot), error instanceof Error ? error.message : "HCP command failed"));
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

function parseWorkItemStatus(value?: string): HcpWorkItemStatus | undefined {
  if (!value) return undefined;
  const statuses: HcpWorkItemStatus[] = ["candidate", "ready", "active", "done", "blocked", "deferred", "cancelled", "backlogged"];
  if (!statuses.includes(value as HcpWorkItemStatus)) throw new Error(`invalid work item status: ${value}`);
  return value as HcpWorkItemStatus;
}

function parseResponseWorkItems(value: string): Array<{ title: string; status: HcpWorkItemStatus; reason: string }> {
  return value.split("||").map((entry) => {
    const [statusValue, titleValue] = entry.split("::", 2).map((part) => part?.trim());
    const status = parseWorkItemStatus(statusValue);
    if (!status || !titleValue) throw new Error(`invalid response work item: ${entry}`);
    return { title: titleValue, status, reason: "response work item automatically synchronized" };
  });
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

  if (tag === "task_process") {
    return mode === "execute" ? ["task", "process", "--execute", ...args] : ["task", "process", ...args];
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
  const loopCommands: Record<string, string> = {
    "#루프분석": "analyze", "#루프실행": "execute", "#루프상태": "status", "#루프보완": "remediate",
    "#루프중단": "stop", "#루프삭제": "delete", "#루프롤백": "rollback", "#루프복원": "restore", "#루프승인": "approve"
  };
  if (loopCommands[token]) {
    return ["loop", loopCommands[token], ...(command.includes(".보고") ? ["--report"] : []), ...blockArgs];
  }
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
    "루프id": "--loop-id",
    "loopid": "--loop-id",
    "선택토큰": "--selection-token",
    "selectiontoken": "--selection-token",
    "대체루프id": "--replacement-loop-id",
    "replacementloopid": "--replacement-loop-id",
    "제외승인": "--exclusion-approved",
    "exclusionapproved": "--exclusion-approved",
    "목표": "--objective",
    "objective": "--objective",
    "완료조건": "--completion",
    "completion": "--completion",
    "정상결과": "--expected-results",
    "expectedresults": "--expected-results",
    "오류케이스": "--error-cases",
    "errorcases": "--error-cases",
    "허용경로": "--allowed-paths",
    "allowedpaths": "--allowed-paths",
    "검증방법": "--verification",
    "verification": "--verification",
    "레지스트리경로": "--registry-path",
    "registrypath": "--registry-path",
    "구현요약": "--implementation-summary",
    "implementationsummary": "--implementation-summary",
    "작업항목": "--work-item-id",
    "workitemid": "--work-item-id",
    "롤백승인경로": "--approved-paths",
    "approvedpaths": "--approved-paths",
    "승인조건": "--condition-value",
    "conditionvalue": "--condition-value",
    "승인자": "--approved-by",
    "approvedby": "--approved-by",
    "문서": "--document",
    "document": "--document",
    "유형": "--type",
    "type": "--type",
    "상태": "--status",
    "status": "--status",
    "처리시점": "--timing",
    "timing": "--timing",
    "우선순위": "--priority",
    "priority": "--priority",
    "의존대상": "--dependency",
    "dependency": "--dependency",
    "출처": "--source",
    "source": "--source",
    "내용": "--content",
    "content": "--content",
    "배경": "--background",
    "background": "--background",
    "기대효과": "--expected-effect",
    "expectedeffect": "--expected-effect",
    "처리기준": "--criteria",
    "criteria": "--criteria",
    "날짜": "--date",
    "date": "--date",
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

function enrichTaskProcessInput(input: TaskProcessInput, repoRoot: string): TaskProcessInput {
  const currentBranch = runExternal("git", ["branch", "--show-current"], repoRoot);
  try {
    const session = input.sessionId
      ? readSessionById(repoRoot, input.sessionId)
      : resolveActiveSession(repoRoot, undefined, input.agentId);
    const activeTasks = session.tasks.filter((task) => task.status === "active");
    const task = input.taskId
      ? activeTasks.find((candidate) => candidate.taskId === input.taskId)
      : activeTasks.length === 1 ? activeTasks[0] : undefined;
    return {
      ...input,
      sessionId: session.sessionId,
      taskId: task?.taskId,
      scope: input.scope ?? task?.taskName,
      currentBranch,
      registeredBranch: task?.branchName,
      activeSession: session.status === "active",
      activeTask: Boolean(task) && activeTasks.length === 1
    };
  } catch {
    return {
      ...input,
      currentBranch,
      activeSession: false,
      activeTask: false
    };
  }
}

function runLoopCommand(command: string, args: string[]): number {
  const repoRoot = resolveGitRoot(process.cwd());
  recoverStaleLoopLeases(repoRoot);
  const options = parseKeyValueArgs(args);
  const reportOnly = args.includes("--report");
  if (command === "status") {
    console.log(formatLoopList(listLoopRuns(repoRoot, options["task-id"], options.all === "true")));
    return 0;
  }
  if (command === "analyze" && !options["loop-id"]) {
    const registryResult = options["registry-path"] ? loadLoopRegistry(repoRoot, options["registry-path"]) : undefined;
    const registry = registryResult?.registry;
    const required = registry ? ["session-id", "task-id"] : ["session-id", "task-id", "title", "objective", "completion", "expected-results", "error-cases", "allowed-paths", "verification"];
    const missing = required.filter((key) => !options[key]);
    const errors = registryResult?.errors ?? [];
    if (missing.length || errors.length || reportOnly) {
      console.log(["# Loop analysis report", "", `- status: ${missing.length || errors.length ? "blocked" : "ready"}`, `- missing: ${missing.join(", ") || "none"}`, `- registry errors: ${errors.join("; ") || "none"}`, "- write actions: loop creation blocked in report mode"].join("\n"));
      return missing.length || errors.length ? 2 : 0;
    }
    const targetErrors = validateLoopAnalysisTarget(repoRoot, options["session-id"], options["task-id"]);
    if (targetErrors.length) {
      console.log(["# Loop analysis report", "", "- status: blocked", "- missing: none", "- registry errors: none", `- target errors: ${targetErrors.join("; ")}`, "- write actions: loop creation blocked"].join("\n"));
      return 2;
    }
    const workItems = registry?.workItems ?? [buildSingleLoopWorkItem(options)];
    const loop = createLoopRun(repoRoot, {
      sessionId: options["session-id"], taskId: options["task-id"], title: registry?.title ?? options.title,
      objective: registry?.objective ?? options.objective, workItems
    });
    linkHcpTaskLoop(repoRoot, loop.sessionId, loop.taskId, loop.loopId);
    console.log(`# Loop analysis\n\n- loop id: ${loop.loopId}\n- status: ${loop.status}\n- analysis version: ${loop.analysisVersion}\n`);
    return 0;
  }
  const candidates = selectLoopCandidates(repoRoot, command, options["task-id"]);
  const selectionToken = createHash("sha256").update(candidates.map((loop) => `${loop.loopId}:${loop.status}:${loop.updatedAt}`).join("|")).digest("hex").slice(0, 16);
  if (options["selection-token"] && options["selection-token"] !== selectionToken) {
    console.log(`${formatLoopList(candidates)}\n\n- selection token expired: ${selectionToken}`); return 2;
  }
  const selected = options["loop-id"] ? candidates.find((loop) => loop.loopId === options["loop-id"]) : candidates.length === 1 ? candidates[0] : undefined;
  if (!selected) {
    console.log(formatLoopList(candidates));
    console.log(`\n- selection required: specify loopId and selectionToken=${selectionToken}`);
    return 2;
  }
  if (reportOnly) {
    const rollback = command === "rollback" ? buildRollbackReport(repoRoot, selected.loopId) : undefined;
    const detail = rollback?.detail ?? `${command} would target ${selected.loopId}`;
    console.log(`# Loop ${command} report\n\n- loop id: ${selected.loopId}\n- status: ${selected.status}\n- detail: ${detail}${rollback ? `\n- removable files: ${rollback.removableFiles.join(", ") || "none"}\n- blocked files: ${rollback.blockedFiles.join(", ") || "none"}` : ""}\n`);
    return 0;
  }
  if (command === "execute") {
    if (selected.status !== "running") { createLoopCheckpoint(repoRoot, selected.loopId, "before"); transitionLoop(repoRoot, selected.loopId, "running"); }
    const current = listLoopRuns(repoRoot).find((loop) => loop.loopId === selected.loopId)!;
    if (current.workItems.some((item) => item.status === "implementing")) {
      if (!options["implementation-summary"]) throw new Error("--implementation-summary is required to complete implementation handoff");
      const completed = completeLoopWorkItemImplementation(repoRoot, selected.loopId, options["implementation-summary"]);
      if (completed.status === "running") runNextLoopWorkItem(repoRoot, selected.loopId);
    } else if (current.workItems.some((item) => item.status === "implementation_complete")) runNextLoopWorkItem(repoRoot, selected.loopId);
    else if (current.workItems.some((item) => item.status === "ready")) beginLoopWorkItemImplementation(repoRoot, selected.loopId);
  } else if (command === "remediate" || command === "analyze") {
    reviseLoopAnalysis(repoRoot, selected.loopId, {
      ...(options.completion ? { completionConditions: splitList(options.completion) } : {}),
      ...(options["expected-results"] ? { expectedResults: splitList(options["expected-results"]) } : {}),
      ...(options["error-cases"] ? { errorCases: splitList(options["error-cases"]) } : {}),
      ...(options["allowed-paths"] ? { allowedPaths: splitList(options["allowed-paths"]) } : {}),
      ...(options.verification ? { verificationCommands: splitList(options.verification) } : {})
    }, new Date(), options["work-item-id"]);
  } else if (command === "stop") transitionLoop(repoRoot, selected.loopId, "paused");
  else if (command === "approve") {
    if (!options["work-item-id"] || !options["condition-value"] || !options["approved-by"]) throw new Error("--work-item-id, --condition-value and --approved-by are required");
    approveLoopCondition(repoRoot, selected.loopId, options["work-item-id"], options["condition-value"], options["approved-by"]);
  }
  else if (command === "delete") softDeleteLoop(repoRoot, selected.loopId, options.reason ?? "deleted by loop command", new Date(), options["replacement-loop-id"], options["exclusion-approved"] === "true");
  else if (command === "restore") restoreLoop(repoRoot, selected.loopId);
  else if (command === "rollback") {
    const plan = buildRollbackReport(repoRoot, selected.loopId);
    if (!options["approved-paths"]) {
      console.log(`# Loop rollback\n\n- ${plan.detail}\n- removable files: ${plan.removableFiles.join(", ") || "none"}\n- blocked files: ${plan.blockedFiles.join(", ") || "none"}\n- file changes: not applied; --approved-paths is required\n`);
      return plan.ready ? 2 : 3;
    }
    executeApprovedRollback(repoRoot, selected.loopId, splitList(options["approved-paths"]));
  }
  const updated = listLoopRuns(repoRoot, undefined, true).find((loop) => loop.loopId === selected.loopId);
  console.log(`# Loop ${command}\n\n- loop id: ${selected.loopId}\n- status: ${updated?.status ?? "unknown"}\n`);
  return 0;
}

function buildSingleLoopWorkItem(options: Record<string, string>): LoopWorkItemDefinition {
  return {
    id: "work_001", title: options.title, dependencies: [],
    completionConditions: splitList(options.completion), expectedResults: splitList(options["expected-results"]),
    errorCases: splitList(options["error-cases"]), allowedPaths: splitList(options["allowed-paths"]),
    verificationCommands: splitList(options.verification)
  };
}

function loadLoopRegistry(repoRoot: string, registryPath: string): { registry?: { title: string; objective: string; workItems: LoopWorkItemDefinition[] }; errors: string[] } {
  const absolute = resolve(repoRoot, registryPath); const rootReal = realpathSync(repoRoot);
  const rel = relative(rootReal, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) return { errors: ["registry path must stay inside repository"] };
  if (!existsSync(absolute)) return { errors: ["registry file not found"] };
  let registryReal: string;
  try { registryReal = realpathSync(absolute); } catch { return { errors: ["registry file cannot be resolved"] }; }
  const realRel = relative(rootReal, registryReal);
  if (realRel.startsWith("..") || isAbsolute(realRel)) return { errors: ["registry real path must stay inside repository"] };
  if (!lstatSync(registryReal).isFile()) return { errors: ["registry path must reference a regular file"] };
  let value: unknown;
  try { value = JSON.parse(readFileSync(absolute, "utf8")); } catch { return { errors: ["registry JSON is invalid"] }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { errors: ["registry root must be an object"] };
  const candidate = value as { title?: unknown; objective?: unknown; workItems?: unknown };
  const errors: string[] = [];
  if (typeof candidate.title !== "string" || !candidate.title.trim()) errors.push("registry title missing");
  if (typeof candidate.objective !== "string" || !candidate.objective.trim()) errors.push("registry objective missing");
  if (!Array.isArray(candidate.workItems) || candidate.workItems.length === 0) errors.push("registry workItems missing");
  if (errors.length) return { errors };
  const shapeErrors = validateLoopRegistryWorkItemShapes(candidate.workItems as unknown[]);
  if (shapeErrors.length) return { errors: shapeErrors };
  const workItems = candidate.workItems as LoopWorkItemDefinition[];
  errors.push(...validateWorkItems(workItems));
  return errors.length ? { errors } : { registry: { title: candidate.title as string, objective: candidate.objective as string, workItems }, errors: [] };
}

function validateLoopRegistryWorkItemShapes(items: unknown[]): string[] {
  const errors: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const value = items[index]; const label = `workItems[${index}]`;
    if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${label}: must be an object`); continue; }
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id.trim()) errors.push(`${label}: id missing`);
    if (typeof item.title !== "string" || !item.title.trim()) errors.push(`${label}: title missing`);
    for (const field of ["dependencies", "completionConditions", "expectedResults", "errorCases", "allowedPaths", "verificationCommands"]) {
      if (!Array.isArray(item[field])) errors.push(`${label}: ${field} must be an array`);
    }
    for (const field of ["completionConditions", "expectedResults", "errorCases", "allowedPaths", "verificationCommands"]) {
      if (Array.isArray(item[field]) && item[field].length === 0) errors.push(`${label}: ${field} must not be empty`);
    }
    if (Array.isArray(item.dependencies) && item.dependencies.some((entry) => typeof entry !== "string")) errors.push(`${label}: dependencies must contain strings`);
    for (const field of ["expectedResults", "errorCases", "allowedPaths", "verificationCommands"]) {
      if (Array.isArray(item[field]) && item[field].some((entry) => typeof entry !== "string")) errors.push(`${label}: ${field} must contain strings`);
    }
  }
  return errors;
}

function validateLoopAnalysisTarget(repoRoot: string, sessionId: string, taskId: string): string[] {
  try {
    const session = readSessionById(repoRoot, sessionId);
    if (session.status !== "active") return ["session must be active"];
    const task = session.tasks.find((candidate) => candidate.taskId === taskId);
    if (!task) return ["task does not belong to session"];
    if (task.status !== "active") return ["task must be active"];
    return [];
  } catch { return ["session not found"]; }
}

function splitList(value: string): string[] { return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean); }
function formatLoopList(loops: Array<{ loopId: string; title: string; status: string; analysisVersion: number; workItems: Array<{ status: string }>; outcomeEvidence?: { stopReason: string; resultCounts: Partial<Record<string, number>> } }>): string {
  return ["# Loop list", "", `- candidates: ${loops.length}`, ...loops.map((loop, index) => {
    const outcomes = loop.outcomeEvidence
      ? Object.entries(loop.outcomeEvidence.resultCounts).map(([result, count]) => `${result}=${count}`).join(",") || "none"
      : "pending";
    return `${index + 1}. ${loop.loopId} | ${loop.status} | analysis v${loop.analysisVersion} | ${loop.workItems.filter((item) => item.status === "completed").length}/${loop.workItems.length} | stop=${loop.outcomeEvidence?.stopReason ?? "pending"} | results=${outcomes} | ${loop.title}`;
  })].join("\n");
}

function resolveGitRoot(cwd: string): string {
  return resolveRepositoryRoot(cwd);
}

function applyTaskIdFromHcpState(
  input: { agentId?: string; sessionId?: string; taskId?: string },
  expectedStatus: "active" | "closed",
  tag: string,
  repoRoot: string
): { status: "ready" | "blocked"; markdown?: string } {
  if (input.taskId) {
    return { status: "ready" };
  }
  try {
    const session = input.sessionId
      ? readSessionById(repoRoot, input.sessionId)
      : resolveActiveSession(repoRoot, undefined, input.agentId);
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

function readTaskPromoteHcpPolicyInput(
  repoRoot: string,
  sessionId?: string,
  taskId?: string,
  targetCommit?: string
): {
  enforceHcpPolicies: true;
  closeEvidence?: ReturnType<typeof readSessionById>["tasks"][number]["closeEvidence"];
  pullRequestLinked: boolean;
  pullRequestMergedToDev: boolean;
  devContainsTarget: boolean;
} {
  try {
    if (!sessionId || !taskId) {
      return { enforceHcpPolicies: true, pullRequestLinked: false, pullRequestMergedToDev: false, devContainsTarget: false };
    }
    const task = readSessionById(repoRoot, sessionId).tasks.find((candidate) => candidate.taskId === taskId);
    let devContainsTarget = false;
    let pullRequestMergedToDev = false;
    if (targetCommit) {
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", targetCommit, "origin/dev"], {
          cwd: repoRoot,
          stdio: "ignore"
        });
        devContainsTarget = true;
      } catch {
        devContainsTarget = false;
      }
    }
    if (targetCommit && task?.pullRequest?.number) {
      try {
        const metadata = JSON.parse(execFileSync("gh", ["pr", "view", String(task.pullRequest.number), "--json", "state,baseRefName,mergeCommit"], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"]
        })) as { state?: string; baseRefName?: string; mergeCommit?: { oid?: string } };
        pullRequestMergedToDev = pullRequestMergeMatchesDevTarget(metadata, targetCommit, devContainsTarget);
      } catch {
        pullRequestMergedToDev = false;
      }
    }
    return {
      enforceHcpPolicies: true,
      closeEvidence: task?.closeEvidence,
      pullRequestLinked: Boolean(task?.pullRequest?.number || task?.pullRequest?.url),
      pullRequestMergedToDev,
      devContainsTarget
    };
  } catch {
    return { enforceHcpPolicies: true, pullRequestLinked: false, pullRequestMergedToDev: false, devContainsTarget: false };
  }
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
