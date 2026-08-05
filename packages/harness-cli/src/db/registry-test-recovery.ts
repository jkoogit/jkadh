import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { DbClient } from "./db-client.ts";
import type { DbConfig } from "./db-config.ts";

export interface RegistryTestRecoveryManifest {
  schemaVersion: 1;
  status: "reserved" | "created";
  testDatabase: string;
  serverFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryTestRunLock {
  path: string;
  descriptor: number;
}

export function resolveRegistryTestRecoveryFile(repoRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env.JKADH_REGISTRY_TEST_RECOVERY_FILE
    ?? ".hcp/verification/PLAN-REGISTRY-postgresql-recovery.json";
  const path = isAbsolute(value) ? resolve(value) : resolve(repoRoot, value);
  const recoveryRoot = resolve(repoRoot, ".hcp/verification");
  const relativePath = relative(recoveryRoot, path);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`registry test recovery manifest must be a file under ${recoveryRoot}`);
  }
  return path;
}

export function resolveRegistryTestRunLockFile(recoveryFile: string): string {
  return `${recoveryFile}.run.lock`;
}

export function acquireRegistryTestRunLock(recoveryFile: string, now = new Date()): RegistryTestRunLock {
  const path = resolveRegistryTestRunLockFile(recoveryFile);
  mkdirSync(dirname(path), { recursive: true });
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "wx");
    writeFileSync(descriptor, `${JSON.stringify({
      schemaVersion: 1,
      pid: process.pid,
      createdAt: now.toISOString(),
      recoveryFile
    }, null, 2)}\n`, "utf8");
    return { path, descriptor };
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    if (code === "EEXIST") {
      throw new Error(`verification_run_locked: ${path} already exists; inspect its owner and the recovery manifest before removing it`);
    }
    if (existsSync(path) && descriptor !== undefined) unlinkSync(path);
    throw new Error(`verification_run_lock_failed: ${path} (${code})`);
  }
}

export function releaseRegistryTestRunLock(lock: RegistryTestRunLock): void {
  closeSync(lock.descriptor);
  if (existsSync(lock.path)) unlinkSync(lock.path);
}

export function readRegistryTestRecoveryManifest(path: string): RegistryTestRecoveryManifest | undefined {
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`cleanup_required: malformed registry test recovery manifest at ${path}`);
  }
  if (!isRecoveryManifest(parsed)) {
    throw new Error(`cleanup_required: invalid registry test recovery manifest at ${path}`);
  }
  return parsed;
}

export async function recoverPendingRegistryTestDatabase(
  client: DbClient,
  config: DbConfig,
  recoveryFile: string
): Promise<string | undefined> {
  const manifest = readRegistryTestRecoveryManifest(recoveryFile);
  if (!manifest) return undefined;
  assertMatchingServer(manifest, config);
  await dropRegistryTestDatabase(client, manifest.testDatabase);
  unlinkSync(recoveryFile);
  return manifest.testDatabase;
}

export function reserveRegistryTestDatabase(
  recoveryFile: string,
  config: DbConfig,
  testDatabase: string,
  now = new Date()
): RegistryTestRecoveryManifest {
  assertTestDatabaseName(testDatabase);
  const timestamp = now.toISOString();
  const manifest: RegistryTestRecoveryManifest = {
    schemaVersion: 1,
    status: "reserved",
    testDatabase,
    serverFingerprint: registryTestServerFingerprint(config),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  writeManifest(recoveryFile, manifest);
  return manifest;
}

export function markRegistryTestDatabaseCreated(
  recoveryFile: string,
  config: DbConfig,
  testDatabase: string,
  now = new Date()
): RegistryTestRecoveryManifest {
  const current = readRegistryTestRecoveryManifest(recoveryFile);
  if (!current || current.testDatabase !== testDatabase) {
    throw new Error("cleanup_required: registry test database reservation is missing or mismatched");
  }
  assertMatchingServer(current, config);
  const manifest: RegistryTestRecoveryManifest = {
    ...current,
    status: "created",
    updatedAt: now.toISOString()
  };
  writeManifest(recoveryFile, manifest);
  return manifest;
}

export async function cleanupRegistryTestDatabase(
  client: DbClient,
  config: DbConfig,
  recoveryFile: string,
  testDatabase: string
): Promise<void> {
  const manifest = readRegistryTestRecoveryManifest(recoveryFile);
  if (!manifest || manifest.testDatabase !== testDatabase) {
    throw new Error("cleanup_required: registry test database recovery manifest is missing or mismatched");
  }
  assertMatchingServer(manifest, config);
  await dropRegistryTestDatabase(client, testDatabase);
  unlinkSync(recoveryFile);
}

export function registryTestServerFingerprint(config: DbConfig): string {
  return createHash("sha256")
    .update([config.host, String(config.port), config.database, config.user].join("\0"))
    .digest("hex");
}

async function dropRegistryTestDatabase(client: DbClient, testDatabase: string): Promise<void> {
  assertTestDatabaseName(testDatabase);
  await client.query(`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = $1 and pid <> pg_backend_pid()
  `, [testDatabase]);
  await client.query(`drop database if exists ${testDatabase}`);
}

function assertMatchingServer(manifest: RegistryTestRecoveryManifest, config: DbConfig): void {
  if (manifest.serverFingerprint !== registryTestServerFingerprint(config)) {
    throw new Error(`cleanup_required: ${manifest.testDatabase} belongs to a different configured PostgreSQL coordinate`);
  }
}

function assertTestDatabaseName(value: string): void {
  if (!/^jkadh_registry_it_[a-f0-9]{32}$/.test(value)) {
    throw new Error(`unsafe registry test database name: ${value}`);
  }
}

function writeManifest(path: string, manifest: RegistryTestRecoveryManifest): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

function isRecoveryManifest(value: unknown): value is RegistryTestRecoveryManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RegistryTestRecoveryManifest>;
  return candidate.schemaVersion === 1
    && (candidate.status === "reserved" || candidate.status === "created")
    && typeof candidate.testDatabase === "string"
    && /^jkadh_registry_it_[a-f0-9]{32}$/.test(candidate.testDatabase)
    && typeof candidate.serverFingerprint === "string"
    && /^[a-f0-9]{64}$/.test(candidate.serverFingerprint)
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string";
}
