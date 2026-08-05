import type { DbConfig } from "./db-config.ts";

export const supportedRegistryPostgresqlMajors = ["16", "17"] as const;

export function validateRegistryDevelopmentDbConfig(config: DbConfig, purpose = "registry operation"): string[] {
  const blockers: string[] = [];
  if (!(config.env === "local" || config.env === "dev")) {
    blockers.push(`${purpose} requires JKADH_ENV=local or dev, received ${config.env}`);
  }
  if (config.database !== "jkadh_dev") {
    blockers.push(`${purpose} requires database jkadh_dev, received ${config.database}`);
  }
  return blockers;
}

export function validateRegistryVerificationConfig(config: DbConfig): string[] {
  return validateRegistryDevelopmentDbConfig(config, "registry verification");
}

export function readPostgresqlMajor(version: string | undefined): string | undefined {
  return version?.match(/(?:PostgreSQL\s+)?(\d+)(?:\.|$)/i)?.[1];
}

export function isSupportedRegistryPostgresqlVersion(version: string | undefined): boolean {
  const major = readPostgresqlMajor(version);
  return major !== undefined && (supportedRegistryPostgresqlMajors as readonly string[]).includes(major);
}
