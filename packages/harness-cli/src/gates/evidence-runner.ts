import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const ALLOWED_EVIDENCE_COMMAND_PATTERNS = [
  /^npm\s+test(?:\s+.*)?$/,
  /^npm\s+run\s+lint$/,
  /^node\s+--test(?:\s+.*)?$/,
  /^git\s+diff(?:\s+.*)?$/,
  /^git\s+status(?:\s+.*)?$/,
  /^tsc(?:\s+--noEmit)?$/
];

export type CommandExecutionResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommandExecutor = (
  command: string,
  cwd?: string,
  timeoutMs?: number
) => Promise<CommandExecutionResult>;

export interface EvidenceVerificationResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  verdict: "PASS" | "FAIL" | "TIMEOUT" | "BLOCKED_COMMAND";
  reason?: string;
}

/**
 * Default child_process executor with timeout.
 */
export const defaultCommandExecutor: CommandExecutor = async (
  command: string,
  cwd: string = process.cwd(),
  timeoutMs: number = 30000
): Promise<CommandExecutionResult> => {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      env: { ...process.env, CI: "true" }
    });
    return {
      exitCode: 0,
      stdout: stdout ? stdout.toString() : "",
      stderr: stderr ? stderr.toString() : ""
    };
  } catch (error: any) {
    return {
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ? error.stdout.toString() : "",
      stderr: error.stderr ? error.stderr.toString() : error.message || ""
    };
  }
};

/**
 * Verifies if a given command is within the security whitelist.
 */
export function isCommandAllowed(command: string): boolean {
  if (!command || typeof command !== "string") return false;
  const trimmed = command.trim();

  // Block command injection characters / chains
  if (/[;&|`$><]/.test(trimmed)) {
    return false;
  }

  return ALLOWED_EVIDENCE_COMMAND_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Executes and verifies an evidence command safely.
 */
export async function verifyEvidenceCommand(
  command: string,
  options?: {
    cwd?: string;
    timeoutMs?: number;
    executor?: CommandExecutor;
  }
): Promise<EvidenceVerificationResult> {
  const start = Date.now();
  const trimmedCmd = command.trim();

  if (!isCommandAllowed(trimmedCmd)) {
    return {
      command: trimmedCmd,
      exitCode: -1,
      stdout: "",
      stderr: "Command is not permitted in the evidence execution whitelist.",
      durationMs: Date.now() - start,
      verdict: "BLOCKED_COMMAND",
      reason: `Command '${trimmedCmd}' violates security whitelist.`
    };
  }

  const executor = options?.executor || defaultCommandExecutor;
  const cwd = options?.cwd || process.cwd();
  const timeoutMs = options?.timeoutMs || 30000;

  const result = await executor(trimmedCmd, cwd, timeoutMs);
  const durationMs = Date.now() - start;

  if (result.exitCode === 0) {
    return {
      command: trimmedCmd,
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      verdict: "PASS"
    };
  }

  return {
    command: trimmedCmd,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs,
    verdict: "FAIL",
    reason: `Process exited with code ${result.exitCode}`
  };
}
