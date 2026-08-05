import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { createReportDocument } from "../reports/create-report.ts";
import { loadDbConfig } from "./db-config.ts";
import { readRegistryTestRecoveryManifest, resolveRegistryTestRecoveryFile } from "./registry-test-recovery.ts";
import {
  isSupportedRegistryPostgresqlVersion,
  supportedRegistryPostgresqlMajors,
  validateRegistryVerificationConfig
} from "./registry-verification-policy.ts";

export type RegistryVerificationStatus = "verified" | "paused" | "recovery_required" | "blocked";
export type RegistryVerificationStep = "not_started" | "db_check_before" | "unit_tests" | "static_check" | "postgresql_integration" | "db_check_after" | "complete";

export interface RegistryVerificationStepEvidence {
  step: Exclude<RegistryVerificationStep, "not_started" | "complete">;
  status: "completed" | "failed";
  command: string;
  durationMs: number;
}

export interface RegistryVerificationIdentity {
  commitSha: string;
  sourceFingerprint: string;
  ddlChecksums: {
    baseline: string;
    migration: string;
  };
}

export interface RegistryVerificationEvidence {
  schemaVersion: 3;
  planId: "PLAN-REGISTRY";
  status: RegistryVerificationStatus;
  generatedAt: string;
  identity: RegistryVerificationIdentity;
  lastCompletedStep: RegistryVerificationStep;
  operationResult: "not_started" | "confirmed" | "unknown";
  detail: string;
  command: string;
  postgresqlVersion?: string;
  migrationVersionBefore?: string;
  migrationVersionAfter?: string;
  temporaryDatabase?: string;
  recoveredDatabase?: string;
  cleanupStatus: "not_started" | "completed" | "required";
  steps: RegistryVerificationStepEvidence[];
  invalidatedPreviousEvidence?: {
    invalidatedAt: string;
    reason: string;
    previousIdentity?: RegistryVerificationIdentity;
  };
}

export interface RegistryVerificationInput {
  evidenceFile?: string;
}

export interface VerificationCommand {
  step: Exclude<RegistryVerificationStep, "not_started" | "complete">;
  display: string;
  executable: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export interface VerificationCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
  timedOut?: boolean;
}

export interface RegistryVerificationDependencies {
  now?: () => Date;
  readCommitSha?: (repoRoot: string) => string;
  runCommand?: (command: VerificationCommand) => VerificationCommandResult;
  env?: NodeJS.ProcessEnv;
}

export interface RegistryVerificationResult {
  status: RegistryVerificationStatus;
  evidence: RegistryVerificationEvidence;
  evidenceFile: string;
  markdown: string;
}

const baselinePath = "packages/harness-cli/baseline/003_create_hcp_registry.sql";
const migrationPath = "packages/harness-cli/migrations/011_create_hcp_registry_tables.sql";
const sourceRoots = [
  "packages/harness-cli/src",
  "packages/harness-cli/test",
  "packages/harness-cli/baseline",
  "packages/harness-cli/migrations",
  "packages/harness-cli/package.json",
  "packages/harness-cli/package-lock.json"
];

export function runRegistryVerification(
  repoRoot: string,
  input: RegistryVerificationInput = {},
  dependencies: RegistryVerificationDependencies = {}
): RegistryVerificationResult {
  const now = dependencies.now ?? (() => new Date());
  const runCommand = dependencies.runCommand ?? runVerificationCommand;
  const environment = dependencies.env ?? process.env;
  const generatedAt = now().toISOString();
  const initialIdentity = buildVerificationIdentity(repoRoot, dependencies.readCommitSha);
  const evidenceFile = resolveEvidenceFile(repoRoot, input.evidenceFile);
  const previous = readVerificationEvidence(evidenceFile);
  const loaded = loadDbConfig(repoRoot, environment);
  let evidence: RegistryVerificationEvidence;

  if (!loaded.config) {
    evidence = createEvidence(initialIdentity, generatedAt, {
      status: "blocked",
      detail: `DB configuration is incomplete: ${loaded.missing.join(", ")}`
    });
  } else {
    const blockers = validateRegistryVerificationConfig(loaded.config);
    if (blockers.length > 0) {
      evidence = createEvidence(initialIdentity, generatedAt, {
        status: "blocked",
        detail: blockers.join("; ")
      });
    } else {
      evidence = executeVerification(repoRoot, initialIdentity, generatedAt, environment, runCommand);
    }
  }

  const finalIdentity = buildVerificationIdentity(repoRoot, dependencies.readCommitSha);
  if (!identitiesEqual(initialIdentity, finalIdentity)) {
    evidence = createEvidence(finalIdentity, generatedAt, {
      status: "recovery_required",
      lastCompletedStep: evidence.lastCompletedStep,
      operationResult: evidence.operationResult === "not_started" ? "not_started" : "unknown",
      detail: "source identity changed during verification; discard the result and rerun after confirming the current commit and DDL checksums",
      command: evidence.command,
      postgresqlVersion: evidence.postgresqlVersion,
      migrationVersionBefore: evidence.migrationVersionBefore,
      migrationVersionAfter: evidence.migrationVersionAfter,
      temporaryDatabase: evidence.temporaryDatabase,
      recoveredDatabase: evidence.recoveredDatabase,
      steps: evidence.steps,
      cleanupStatus: evidence.cleanupStatus
    });
    evidence.invalidatedPreviousEvidence = {
      invalidatedAt: generatedAt,
      reason: "source identity changed while verification commands were running",
      previousIdentity: initialIdentity
    };
  } else if (previous && !identitiesEqual(previous.identity, finalIdentity)) {
    evidence.invalidatedPreviousEvidence = {
      invalidatedAt: generatedAt,
      reason: "commit SHA, source fingerprint, or DDL checksum changed",
      previousIdentity: previous.identity
    };
  } else if (existsSync(evidenceFile) && !previous) {
    evidence.invalidatedPreviousEvidence = {
      invalidatedAt: generatedAt,
      reason: "malformed or unsupported verification evidence was replaced fail-closed"
    };
  }

  writeEvidenceWithLock(evidenceFile, evidence);
  const report = createReportDocument({
    title: "PLAN-REGISTRY PostgreSQL verification",
    summary: "Verify PLAN-REGISTRY only while the configured development DB is healthy.",
    checks: [
      { name: "status", status: reportStatus(evidence.status), detail: evidence.status },
      { name: "last completed step", status: "info", detail: evidence.lastCompletedStep },
      { name: "operation result", status: evidence.operationResult === "unknown" ? "blocked" : "info", detail: evidence.operationResult },
      { name: "migration invariant", status: evidence.migrationVersionBefore === "7" && evidence.migrationVersionAfter === "7" ? "pass" : "info", detail: `before=${evidence.migrationVersionBefore ?? "unknown"}; after=${evidence.migrationVersionAfter ?? "not-run"}` },
      { name: "commit", status: "info", detail: evidence.identity.commitSha },
      { name: "source fingerprint", status: "info", detail: evidence.identity.sourceFingerprint },
      {
        name: "DDL parity",
        status: evidence.identity.ddlChecksums.baseline === evidence.identity.ddlChecksums.migration ? "pass" : "blocked",
        detail: `baseline=${evidence.identity.ddlChecksums.baseline}; migration=${evidence.identity.ddlChecksums.migration}`
      },
      { name: "cleanup", status: evidence.cleanupStatus === "required" ? "blocked" : "info", detail: evidence.cleanupStatus },
      { name: "detail", status: evidence.status === "verified" ? "pass" : "blocked", detail: evidence.detail },
      { name: "evidence", status: "pass", detail: evidenceFile }
    ]
  });
  return { status: evidence.status, evidence, evidenceFile, markdown: report.markdown };
}

export function buildVerificationIdentity(
  repoRoot: string,
  readCommitSha: (repoRoot: string) => string = defaultReadCommitSha
): RegistryVerificationIdentity {
  return {
    commitSha: readCommitSha(repoRoot),
    sourceFingerprint: hashSourceTree(repoRoot),
    ddlChecksums: {
      baseline: hashFile(join(repoRoot, baselinePath)),
      migration: hashFile(join(repoRoot, migrationPath))
    }
  };
}

function executeVerification(
  repoRoot: string,
  identity: RegistryVerificationIdentity,
  generatedAt: string,
  environment: NodeJS.ProcessEnv,
  runCommand: (command: VerificationCommand) => VerificationCommandResult
): RegistryVerificationEvidence {
  const recoveryFile = resolveRegistryTestRecoveryFile(repoRoot, environment);
  try {
    readRegistryTestRecoveryManifest(recoveryFile);
  } catch (error) {
    return createEvidence(identity, generatedAt, {
      status: "recovery_required",
      detail: error instanceof Error ? error.message : "cleanup_required: unreadable registry test recovery manifest",
      cleanupStatus: "required"
    });
  }

  const commands = verificationCommands(repoRoot, environment, recoveryFile);
  let lastCompletedStep: RegistryVerificationStep = "not_started";
  let postgresqlVersion: string | undefined;
  let migrationVersionBefore: string | undefined;
  let migrationVersionAfter: string | undefined;
  let temporaryDatabase: string | undefined;
  let recoveredDatabase: string | undefined;
  let cleanupStatus: RegistryVerificationEvidence["cleanupStatus"] = "not_started";
  const steps: RegistryVerificationStepEvidence[] = [];

  for (const command of commands) {
    const result = runCommand(command);
    const output = `${result.stdout}\n${result.stderr}`.trim();
    postgresqlVersion = readPostgresqlVersion(output) ?? postgresqlVersion;
    const migrationVersion = readMigrationVersion(output);
    if (command.step === "db_check_before") migrationVersionBefore = migrationVersion;
    if (command.step === "db_check_after") migrationVersionAfter = migrationVersion;
    temporaryDatabase = readDiagnosticDatabase(output, "temporary-database-created") ?? temporaryDatabase;
    recoveredDatabase = readDiagnosticDatabase(output, "temporary-database-recovered") ?? recoveredDatabase;
    const cleanedDatabase = readDiagnosticDatabase(output, "temporary-database-cleanup");
    if (cleanedDatabase) cleanupStatus = "completed";
    steps.push({
      step: command.step,
      status: result.exitCode === 0 ? "completed" : "failed",
      command: command.display,
      durationMs: result.durationMs ?? 0
    });

    if (result.exitCode !== 0) {
      const availabilityFailure = isDatabaseAvailabilityFailure(output);
      let pendingRecovery;
      try {
        pendingRecovery = readRegistryTestRecoveryManifest(recoveryFile);
      } catch (error) {
        return createEvidence(identity, generatedAt, {
          status: "recovery_required",
          lastCompletedStep,
          operationResult: "unknown",
          detail: error instanceof Error ? error.message : "cleanup_required: unreadable registry test recovery manifest",
          command: command.display,
          postgresqlVersion,
          migrationVersionBefore,
          migrationVersionAfter,
          temporaryDatabase,
          recoveredDatabase,
          steps,
          cleanupStatus: "required"
        });
      }
      if (pendingRecovery) {
        return createEvidence(identity, generatedAt, {
          status: "recovery_required",
          lastCompletedStep,
          operationResult: "unknown",
          detail: `cleanup_required: ${pendingRecovery.testDatabase} may remain after ${command.step}; verify and clean it before retrying`,
          command: command.display,
          postgresqlVersion,
          migrationVersionBefore,
          migrationVersionAfter,
          temporaryDatabase: pendingRecovery.testDatabase,
          recoveredDatabase,
          steps,
          cleanupStatus: "required"
        });
      }
      return createEvidence(identity, generatedAt, {
        status: isVerificationRunLockFailure(output)
          ? "recovery_required"
          : availabilityFailure
            ? (command.step === "db_check_before" ? "paused" : "recovery_required")
            : "blocked",
        lastCompletedStep,
        operationResult: (availabilityFailure && command.step !== "db_check_before") || isVerificationRunLockFailure(output) ? "unknown" : "not_started",
        detail: isVerificationRunLockFailure(output)
          ? `cleanup_required: another PostgreSQL verification owns the recovery-file run lock (${summarizeOutput(output)})`
          : availabilityFailure
          ? command.step === "db_check_before"
            ? `database unavailable before verification; no unit, static, PostgreSQL integration, migration, or registry mutation was started (${summarizeOutput(output)})`
            : `database became unavailable after verification started; confirm the last operation before retrying (${summarizeOutput(output)})`
          : summarizeOutput(output),
        command: command.display,
        postgresqlVersion,
        migrationVersionBefore,
        migrationVersionAfter,
        temporaryDatabase,
        recoveredDatabase,
        steps,
        cleanupStatus: isVerificationRunLockFailure(output) ? "required" : cleanupStatus
      });
    }

    lastCompletedStep = command.step;
    if (command.step === "db_check_before") {
      if (!isSupportedRegistryPostgresqlVersion(postgresqlVersion)) {
        return createEvidence(identity, generatedAt, {
          status: "blocked",
          lastCompletedStep,
          detail: `unsupported or missing PostgreSQL version; supported majors=${supportedRegistryPostgresqlMajors.join(",")}`,
          command: command.display,
          postgresqlVersion,
          migrationVersionBefore,
          steps,
          cleanupStatus
        });
      }
      if (migrationVersionBefore !== "7") {
        return createEvidence(identity, generatedAt, {
          status: "blocked",
          lastCompletedStep,
          detail: `target development DB must remain at pre-registry migration 7 before verification, received ${migrationVersionBefore ?? "missing"}`,
          command: command.display,
          postgresqlVersion,
          migrationVersionBefore,
          steps,
          cleanupStatus
        });
      }
      if (identity.ddlChecksums.baseline !== identity.ddlChecksums.migration) {
        return createEvidence(identity, generatedAt, {
          status: "blocked",
          lastCompletedStep,
          detail: "registry baseline and migration checksums differ",
          command: command.display,
          postgresqlVersion,
          migrationVersionBefore,
          steps,
          cleanupStatus
        });
      }
    }
    if (command.step === "db_check_after" && migrationVersionAfter !== migrationVersionBefore) {
      return createEvidence(identity, generatedAt, {
        status: "recovery_required",
        lastCompletedStep,
        operationResult: "unknown",
        detail: `target development DB migration changed during verification: before=${migrationVersionBefore ?? "missing"}; after=${migrationVersionAfter ?? "missing"}`,
        command: command.display,
        postgresqlVersion,
        migrationVersionBefore,
        migrationVersionAfter,
        temporaryDatabase,
        recoveredDatabase,
        steps,
        cleanupStatus
      });
    }
  }

  let pendingRecovery;
  try {
    pendingRecovery = readRegistryTestRecoveryManifest(recoveryFile);
  } catch (error) {
    return createEvidence(identity, generatedAt, {
      status: "recovery_required",
      lastCompletedStep,
      operationResult: "unknown",
      detail: error instanceof Error ? error.message : "cleanup_required: unreadable registry test recovery manifest",
      command: commands.at(-1)?.display,
      postgresqlVersion,
      migrationVersionBefore,
      migrationVersionAfter,
      temporaryDatabase,
      recoveredDatabase,
      steps,
      cleanupStatus: "required"
    });
  }
  if (pendingRecovery) {
    return createEvidence(identity, generatedAt, {
      status: "recovery_required",
      lastCompletedStep,
      operationResult: "unknown",
      detail: `cleanup_required: ${pendingRecovery.testDatabase} remains after PostgreSQL verification`,
      command: commands.at(-1)?.display,
      postgresqlVersion,
      migrationVersionBefore,
      migrationVersionAfter,
      temporaryDatabase: pendingRecovery.testDatabase,
      recoveredDatabase,
      steps,
      cleanupStatus: "required"
    });
  }
  if (!temporaryDatabase || cleanupStatus !== "completed") {
    return createEvidence(identity, generatedAt, {
      status: "blocked",
      lastCompletedStep,
      detail: "PostgreSQL integration did not prove creation and cleanup of the same isolated test database",
      command: commands.at(-1)?.display,
      postgresqlVersion,
      migrationVersionBefore,
      migrationVersionAfter,
      temporaryDatabase,
      recoveredDatabase,
      steps,
      cleanupStatus: "required"
    });
  }

  return createEvidence(identity, generatedAt, {
    status: "verified",
    lastCompletedStep: "complete",
    operationResult: "confirmed",
    detail: "DB check, unit tests, static check, production DDL rollback, registry services, and isolated database cleanup passed",
    command: commands.map((command) => command.display).join(" -> "),
    postgresqlVersion,
    migrationVersionBefore,
    migrationVersionAfter,
    temporaryDatabase,
    recoveredDatabase,
    steps,
    cleanupStatus
  });
}

function verificationCommands(repoRoot: string, environment: NodeJS.ProcessEnv, recoveryFile: string): VerificationCommand[] {
  const packageRoot = join(repoRoot, "packages/harness-cli");
  const cliPath = join(packageRoot, "src/cli.ts");
  return [
    {
      step: "db_check_before",
      display: "jkadh db check (pre-verification)",
      executable: process.execPath,
      args: ["--experimental-strip-types", cliPath, "db", "check"],
      cwd: repoRoot,
      env: environment,
      timeoutMs: 30_000
    },
    npmVerificationCommand("unit_tests", "npm test", ["test"], packageRoot, environment, 180_000),
    npmVerificationCommand("static_check", "npm run check", ["run", "check"], packageRoot, environment, 30_000),
    {
      step: "postgresql_integration",
      display: "actual PostgreSQL registry integration test",
      executable: process.execPath,
      args: ["--test", "--experimental-strip-types", "test/registry-postgres.integration.test.ts"],
      cwd: packageRoot,
      env: {
        ...environment,
        JKADH_RUN_DB_INTEGRATION: "true",
        JKADH_REGISTRY_TEST_RECOVERY_FILE: recoveryFile
      },
      timeoutMs: 180_000
    },
    {
      step: "db_check_after",
      display: "jkadh db check (post-verification)",
      executable: process.execPath,
      args: ["--experimental-strip-types", cliPath, "db", "check"],
      cwd: repoRoot,
      env: environment,
      timeoutMs: 30_000
    }
  ];
}

function npmVerificationCommand(
  step: "unit_tests" | "static_check",
  display: string,
  npmArgs: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  timeoutMs: number
): VerificationCommand {
  const env = { ...environment, JKADH_RUN_DB_INTEGRATION: "false" };
  if (process.platform === "win32") {
    return {
      step,
      display,
      executable: environment.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", `npm.cmd ${npmArgs.join(" ")}`],
      cwd,
      env,
      timeoutMs
    };
  }
  return { step, display, executable: "npm", args: npmArgs, cwd, env, timeoutMs };
}

function createEvidence(
  identity: RegistryVerificationIdentity,
  generatedAt: string,
  values: Partial<Omit<RegistryVerificationEvidence, "schemaVersion" | "planId" | "generatedAt" | "identity">>
    & Pick<RegistryVerificationEvidence, "status" | "detail">
): RegistryVerificationEvidence {
  return {
    schemaVersion: 3,
    planId: "PLAN-REGISTRY",
    generatedAt,
    identity,
    lastCompletedStep: "not_started",
    operationResult: "not_started",
    command: "jkadh db registry-verify",
    cleanupStatus: "not_started",
    steps: [],
    ...values
  };
}

function resolveEvidenceFile(repoRoot: string, evidenceFile?: string): string {
  const value = evidenceFile ?? ".hcp/verification/PLAN-REGISTRY.json";
  const path = isAbsolute(value) ? resolve(value) : resolve(repoRoot, value);
  const evidenceRoot = resolve(repoRoot, ".hcp/verification");
  const relativePath = relative(evidenceRoot, path);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`registry verification evidence must be a file under ${evidenceRoot}`);
  }
  return path;
}

function readVerificationEvidence(path: string): RegistryVerificationEvidence | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RegistryVerificationEvidence;
    return parsed.schemaVersion === 3 && parsed.planId === "PLAN-REGISTRY" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeEvidenceWithLock(path: string, evidence: RegistryVerificationEvidence): void {
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const lock = acquireEvidenceLock(lockPath);
  try {
    const temporaryPath = `${path}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, path);
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

function acquireEvidenceLock(lockPath: string): number {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(lockPath, "wx");
    writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
    return descriptor;
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
      if (existsSync(lockPath)) unlinkSync(lockPath);
    }
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    throw new Error(`verification evidence update blocked by concurrent writer (${code}); retry after checking the current evidence owner`);
  }
}

function identitiesEqual(left: RegistryVerificationIdentity, right: RegistryVerificationIdentity): boolean {
  return left.commitSha === right.commitSha
    && left.sourceFingerprint === right.sourceFingerprint
    && left.ddlChecksums.baseline === right.ddlChecksums.baseline
    && left.ddlChecksums.migration === right.ddlChecksums.migration;
}

function hashSourceTree(repoRoot: string): string {
  const files = sourceRoots.flatMap((path) => collectFiles(join(repoRoot, path)))
    .sort((left, right) => left.localeCompare(right));
  const hash = createHash("sha256");
  for (const path of files) {
    hash.update(relative(repoRoot, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function collectFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? collectFiles(child) : entry.isFile() ? [child] : [];
  });
}

function hashFile(path: string): string {
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "missing";
}

function defaultReadCommitSha(repoRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function runVerificationCommand(command: VerificationCommand): VerificationCommandResult {
  const startedAt = Date.now();
  const result = spawnSync(command.executable, command.args, {
    cwd: command.cwd,
    env: command.env ?? process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: command.timeoutMs,
    killSignal: "SIGTERM"
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.error ? `${result.stderr ?? ""}\n${result.error.message}` : result.stderr ?? "",
    durationMs: Date.now() - startedAt,
    timedOut: result.error && "code" in result.error && result.error.code === "ETIMEDOUT"
  };
}

function isDatabaseAvailabilityFailure(output: string): boolean {
  return /\b(?:EACCES|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ECONNRESET)\b|database unavailable|connection terminated|connection timeout/i.test(output);
}

function isVerificationRunLockFailure(output: string): boolean {
  return /verification_run_locked|verification_run_lock_failed/i.test(output);
}

function readPostgresqlVersion(output: string): string | undefined {
  return output.match(/postgresql-version:\s*([^\r\n#]+)/i)?.[1]?.trim()
    ?? output.match(/\[info\]\s+version:\s*(PostgreSQL[^\r\n]+)/i)?.[1]?.trim();
}

function readMigrationVersion(output: string): string | undefined {
  return output.match(/\[(?:pass|info)\]\s+migration:\s*([^\s\r\n]+)/i)?.[1]?.trim();
}

function readDiagnosticDatabase(output: string, name: string): string | undefined {
  return output.match(new RegExp(`${name}:\\s*(jkadh_registry_it_[a-f0-9]{32})`, "i"))?.[1];
}

function summarizeOutput(output: string): string {
  const compact = output.replace(/\s+/g, " ").trim();
  if (!compact) return "verification command failed without output";
  return compact.length > 500 ? `${compact.slice(0, 497)}...` : compact;
}

function reportStatus(status: RegistryVerificationStatus): "pass" | "fail" | "blocked" | "info" {
  if (status === "verified") return "pass";
  return status === "paused" ? "info" : "blocked";
}
