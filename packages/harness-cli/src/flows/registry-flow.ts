import { createDbClient } from "../db/db-client.ts";
import { loadDbConfig } from "../db/db-config.ts";
import { validateRegistryDevelopmentDbConfig } from "../db/registry-verification-policy.ts";
import {
  allocateRegistryTask,
  bootstrapWorkGroup,
  readActiveRegistryRepository,
  registerRepository,
  replayRegistryTaskAllocation,
  replayWorkGroupAllocation,
  RegistryOperationResultUnknownError,
  type ExternalIssueEvidence,
  type RegistryRepository,
  type RegistryTaskAllocation,
  type WorkGroupAllocation
} from "../db/work-registry.ts";
import { runBoundedGitHubCommand } from "../process/bounded-command.ts";
import { createReportDocument } from "../reports/create-report.ts";

export interface RegistryCliResult {
  status: "planned" | "executed" | "paused" | "recovery_required" | "blocked";
  markdown: string;
  recovery?: RegistryRecoveryResult;
}

export interface RegistryRecoveryResult {
  failureKind: "db_config_blocked" | "db_unavailable" | "operation_result_unknown" | "registry_operation_blocked" | "db_close_failed";
  operationKey: string;
  lastConfirmedBoundary: string;
  transactionResult: "not_started" | "committed" | "rolled_back" | "unknown";
  retryAllowed: boolean;
  primaryStatus: RegistryCliResult["status"];
  closeFailure?: string;
}

export interface RegistryCommandRunner {
  run(command: string, args: string[], cwd: string): string;
}

export interface RegistryFlowDependencies {
  createClient?: typeof createDbClient;
  commandRunner?: RegistryCommandRunner;
  now?: () => Date;
}

export async function runRegistryCli(
  repoRoot: string,
  target: string | undefined,
  args: string[],
  dependencies: RegistryFlowDependencies = {}
): Promise<RegistryCliResult> {
  const [action, ...optionArgs] = args;
  const options = parseOptions(optionArgs);
  const execute = options.execute === "true";
  if (target === "repository" && action === "register") {
    const missing = missingOptions(options, ["repository-key", "repository-full-name", "lifecycle-policy"]);
    if (missing.length) return blockedReport("repository register", missing);
    if (!execute) return plannedReport("repository register", options, ["create or reuse immutable Repository registry row"]);
    return executeWithClient(repoRoot, "repository register", repositoryOperationKey(options), async (client) => registerRepository(client, {
      repositoryKey: options["repository-key"],
      repositoryFullName: options["repository-full-name"],
      canonicalUrl: options["canonical-url"],
      lifecyclePolicy: options["lifecycle-policy"]
    }), dependencies.createClient);
  }

  if (target === "work-group" && action === "bootstrap") {
    const missing = missingOptions(options, ["repository-key", "issue", "issue-title", "issue-url", "title"]);
    if (missing.length) return blockedReport("work-group bootstrap", missing);
    if (options["issue-policy"] && !["dedicated", "shared_registration"].includes(options["issue-policy"])) {
      return blockedReport("work-group bootstrap", ["--issue-policy must be dedicated or shared_registration"]);
    }
    if (!positiveIssueNumber(options.issue)) return blockedReport("work-group bootstrap", ["--issue must be a positive integer"]);
    const issuePolicy = options["issue-policy"] === "shared_registration" ? "shared_registration" : "dedicated";
    if (issuePolicy === "shared_registration" && options["shared-registration-approved"] !== "true") {
      return blockedReport("work-group bootstrap", ["--shared-registration-approved"]);
    }
    if (!execute) return plannedReport("work-group bootstrap", options, [
      "require pre-created registration Issue evidence",
      "allocate WG ID only inside a DB counter transaction"
    ]);
    return executeWithClient(repoRoot, "work-group bootstrap", workGroupOperationKey(options), async (client) => {
      const replayed = await replayWorkGroupAllocation(client, {
        repositoryKey: options["repository-key"],
        registrationIssue: requestedIssue(options),
        title: options.title,
        issuePolicy,
        sharedRegistrationApproved: options["shared-registration-approved"] === "true",
        allocationKey: options["allocation-key"]
      });
      if (replayed) return replayed;
      const repository = await readActiveRegistryRepository(client, options["repository-key"]);
      const registrationIssue = verifyGitHubIssue(
        repoRoot,
        repository.repositoryFullName,
        options,
        dependencies.commandRunner ?? defaultCommandRunner,
        dependencies.now ?? (() => new Date())
      );
      return bootstrapWorkGroup(client, {
        repositoryKey: options["repository-key"],
        registrationIssue,
        title: options.title,
        issuePolicy,
        sharedRegistrationApproved: options["shared-registration-approved"] === "true",
        allocationKey: options["allocation-key"]
      });
    }, dependencies.createClient);
  }

  if (target === "task" && action === "allocate") {
    const missing = missingOptions(options, [
      "repository-key", "work-group-id", "issue", "issue-title", "issue-url", "session-id", "task-name"
    ]);
    if (missing.length) return blockedReport("task allocate", missing);
    if (options["issue-policy"] && !["dedicated", "shared_umbrella"].includes(options["issue-policy"])) {
      return blockedReport("task allocate", ["--issue-policy must be dedicated or shared_umbrella"]);
    }
    if (!positiveIssueNumber(options.issue)) return blockedReport("task allocate", ["--issue must be a positive integer"]);
    const issuePolicy = options["issue-policy"] === "shared_umbrella" ? "shared_umbrella" : "dedicated";
    if (issuePolicy === "shared_umbrella" && options["shared-umbrella-approved"] !== "true") {
      return blockedReport("task allocate", ["--shared-umbrella-approved"]);
    }
    if (!execute) return plannedReport("task allocate", options, [
      "require pre-created execution Issue evidence",
      "allocate Task ID only inside a DB counter transaction"
    ]);
    return executeWithClient(repoRoot, "task allocate", taskOperationKey(options), async (client) => {
      const replayed = await replayRegistryTaskAllocation(client, {
        repositoryKey: options["repository-key"],
        workGroupId: options["work-group-id"],
        executionIssue: requestedIssue(options),
        sessionId: options["session-id"],
        taskName: options["task-name"],
        issuePolicy,
        sharedUmbrellaApproved: options["shared-umbrella-approved"] === "true",
        allocationKey: options["allocation-key"]
      });
      if (replayed) return replayed;
      const repository = await readActiveRegistryRepository(client, options["repository-key"]);
      const executionIssue = verifyGitHubIssue(
        repoRoot,
        repository.repositoryFullName,
        options,
        dependencies.commandRunner ?? defaultCommandRunner,
        dependencies.now ?? (() => new Date())
      );
      return allocateRegistryTask(client, {
        repositoryKey: options["repository-key"],
        workGroupId: options["work-group-id"],
        executionIssue,
        sessionId: options["session-id"],
        taskName: options["task-name"],
        issuePolicy,
        sharedUmbrellaApproved: options["shared-umbrella-approved"] === "true",
        allocationKey: options["allocation-key"]
      });
    }, dependencies.createClient);
  }

  return blockedReport("registry", ["supported command: repository register | work-group bootstrap | task allocate"]);
}

async function executeWithClient<T extends RegistryRepository | WorkGroupAllocation | RegistryTaskAllocation>(
  repoRoot: string,
  title: string,
  operationKey: string,
  operation: (client: Awaited<ReturnType<typeof createDbClient>>) => Promise<T>,
  clientFactory: typeof createDbClient = createDbClient
): Promise<RegistryCliResult> {
  const loaded = loadDbConfig(repoRoot);
  if (loaded.status === "blocked" || !loaded.config) {
    const outcome = blockedReport(title, loaded.missing.map((item) => `DB config ${item}`));
    outcome.recovery = {
      failureKind: "db_config_blocked",
      operationKey,
      lastConfirmedBoundary: "command_input_validated",
      transactionResult: "not_started",
      retryAllowed: false,
      primaryStatus: outcome.status
    };
    return outcome;
  }
  const environmentBlockers = validateRegistryDevelopmentDbConfig(loaded.config);
  if (environmentBlockers.length > 0) {
    const outcome = blockedReport(title, environmentBlockers);
    outcome.recovery = {
      failureKind: "db_config_blocked",
      operationKey,
      lastConfirmedBoundary: "db_config_loaded",
      transactionResult: "not_started",
      retryAllowed: false,
      primaryStatus: outcome.status
    };
    return outcome;
  }
  let client: Awaited<ReturnType<typeof createDbClient>> | undefined;
  let outcome: RegistryCliResult;
  try {
    client = await clientFactory(loaded.config);
    const result = await operation(client);
    const report = createReportDocument({
      title: `Harness CLI registry ${title}`,
      summary: "Execute fail-closed PLAN-REGISTRY mutation.",
      checks: [
        { name: "DB transaction", status: "pass", detail: "committed" },
        { name: "JSON fallback", status: "pass", detail: "disabled" },
        { name: "result", status: "pass", detail: JSON.stringify(result) }
      ]
    });
    outcome = { status: "executed", markdown: report.markdown };
  } catch (error) {
    const status: RegistryCliResult["status"] = error instanceof RegistryOperationResultUnknownError
      ? "recovery_required"
      : isDatabaseAvailabilityError(error)
        ? "paused"
        : "blocked";
    const report = createReportDocument({
      title: `Harness CLI registry ${title}`,
      summary: status === "paused"
        ? "Pause PLAN-REGISTRY before retrying a database operation."
        : status === "recovery_required"
          ? "Confirm the existing operation result before retrying PLAN-REGISTRY."
          : "Execute fail-closed PLAN-REGISTRY mutation.",
      checks: [
        { name: "DB transaction", status: "blocked", detail: error instanceof Error ? error.message : "registry mutation failed" },
        {
          name: "retry",
          status: "blocked",
          detail: status === "recovery_required"
            ? "query the same operationKey and immutable request fingerprint before any retry"
            : status === "paused"
              ? "preserve the current work and resume only after a read-only DB check"
              : "correct the policy or input failure before retrying"
        },
        { name: "JSON fallback", status: "pass", detail: "not attempted" }
      ]
    });
    const operationUnknown = error instanceof RegistryOperationResultUnknownError;
    const availabilityFailure = isDatabaseAvailabilityError(error);
    outcome = {
      status,
      markdown: report.markdown,
      recovery: {
        failureKind: operationUnknown
          ? "operation_result_unknown"
          : availabilityFailure
            ? "db_unavailable"
            : "registry_operation_blocked",
        operationKey: operationUnknown ? error.operationKey : operationKey,
        lastConfirmedBoundary: operationUnknown
          ? error.lastConfirmedBoundary
          : client
            ? "database_client_connected"
            : "db_config_validated",
        transactionResult: operationUnknown || (availabilityFailure && client) ? "unknown" : "not_started",
        retryAllowed: false,
        primaryStatus: status
      }
    };
  }
  if (client) {
    try {
      await client.end();
    } catch (error) {
      const closeFailure = blockedReport(title, [
        `DB connection close failed; preserve the primary result and confirm DB health before reusing the same idempotent request: ${error instanceof Error ? error.message : "unknown close failure"}`
      ]);
      return {
        status: "blocked",
        markdown: `${outcome.markdown}\n\n${closeFailure.markdown}`,
        recovery: {
          failureKind: "db_close_failed",
          operationKey,
          lastConfirmedBoundary: outcome.status === "executed"
            ? "mutation_result_confirmed"
            : outcome.recovery?.lastConfirmedBoundary ?? "database_client_connected",
          transactionResult: outcome.status === "executed"
            ? "committed"
            : outcome.recovery?.transactionResult ?? "unknown",
          retryAllowed: false,
          primaryStatus: outcome.status,
          closeFailure: error instanceof Error ? error.message : "unknown close failure"
        }
      };
    }
  }
  return outcome;
}

function repositoryOperationKey(options: Record<string, string>): string {
  return `repository:${options["repository-key"].trim().toUpperCase()}`;
}

function workGroupOperationKey(options: Record<string, string>): string {
  return options["allocation-key"]?.trim()
    || `wg:${options["repository-key"].trim().toUpperCase()}:${options.issue.replace(/^#/, "")}`;
}

function taskOperationKey(options: Record<string, string>): string {
  return options["allocation-key"]?.trim()
    || `task:${options["repository-key"].trim().toUpperCase()}:${options.issue.replace(/^#/, "")}`;
}

function plannedReport(title: string, options: Record<string, string>, checks: string[]): RegistryCliResult {
  const report = createReportDocument({
    title: `Harness CLI registry ${title}`,
    summary: "Plan PLAN-REGISTRY mutation without DB or GitHub writes.",
    checks: [
      { name: "input", status: "pass", detail: sanitizedOptions(options) },
      ...checks.map((detail) => ({ name: "boundary", status: "pass" as const, detail })),
      { name: "mode", status: "info", detail: "report-only; add --execute after external Issue creation" }
    ]
  });
  return { status: "planned", markdown: report.markdown };
}

function blockedReport(title: string, missing: string[]): RegistryCliResult {
  const report = createReportDocument({
    title: `Harness CLI registry ${title}`,
    summary: "Validate PLAN-REGISTRY command boundary.",
    checks: [
      { name: "required input", status: "blocked", detail: missing.join("; ") }
    ]
  });
  return { status: "blocked", markdown: report.markdown };
}

function verifyGitHubIssue(
  cwd: string,
  repositoryFullName: string,
  options: Record<string, string>,
  runner: RegistryCommandRunner,
  now: () => Date
): ExternalIssueEvidence {
  const expectedNumber = Number(options.issue.replace(/^#/, ""));
  const output = runner.run("gh", [
    "issue", "view", String(expectedNumber), "--repo", repositoryFullName,
    "--json", "number,state,title,url"
  ], cwd);
  const value = JSON.parse(output) as { number?: number; state?: string; title?: string; url?: string };
  const expectedUrl = `https://github.com/${repositoryFullName}/issues/${expectedNumber}`.toLowerCase();
  if (options["issue-url"].replace(/\/$/, "").toLowerCase() !== expectedUrl) {
    throw new Error("Requested Issue URL does not match the registered repository coordinate and number");
  }
  if (value.number !== expectedNumber || value.url?.replace(/\/$/, "").toLowerCase() !== expectedUrl) {
    throw new Error("GitHub Issue does not match the registered repository coordinate and number");
  }
  if (value.state !== "OPEN") {
    throw new Error(`GitHub Issue must be OPEN before ID allocation: ${value.state ?? "unknown"}`);
  }
  if (value.title !== options["issue-title"]) {
    throw new Error("GitHub Issue title does not match the requested Issue evidence");
  }
  return {
    number: value.number,
    title: value.title,
    url: value.url ?? expectedUrl,
    status: "open",
    verificationSource: "github",
    verifiedAt: now().toISOString()
  };
}

const defaultCommandRunner: RegistryCommandRunner = {
  run(command: string, args: string[], cwd: string): string {
    if (command !== "gh") throw new Error(`unsupported registry command: ${command}`);
    return runBoundedGitHubCommand(cwd, args);
  }
};

function requestedIssue(options: Record<string, string>): {
  number: number;
  title: string;
  url: string;
} {
  return {
    number: Number(options.issue.replace(/^#/, "")),
    title: options["issue-title"],
    url: options["issue-url"]
  };
}

function parseOptions(args: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  const flags = new Set(["--execute", "--shared-registration-approved", "--shared-umbrella-approved"]);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) continue;
    const normalized = key.slice(2);
    if (flags.has(key)) {
      options[normalized] = "true";
      continue;
    }
    const value = args[index + 1];
    if (value && !value.startsWith("--")) {
      options[normalized] = value;
      index += 1;
    }
  }
  return options;
}

function missingOptions(options: Record<string, string>, required: string[]): string[] {
  return required.filter((key) => !options[key]?.trim()).map((key) => `--${key}`);
}

function sanitizedOptions(options: Record<string, string>): string {
  return Object.entries(options)
    .filter(([key]) => !key.toLowerCase().includes("password"))
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function positiveIssueNumber(value: string): boolean {
  const issueNumber = Number(value?.replace(/^#/, ""));
  return Number.isInteger(issueNumber) && issueNumber > 0;
}

function isDatabaseAvailabilityError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /\b(?:EACCES|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ECONNRESET)\b|database unavailable|connection (?:terminated|lost|timeout)/i.test(message);
}
