import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DbConfig {
  env: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface DbConfigResult {
  status: "ready" | "blocked";
  config?: DbConfig;
  missing: string[];
}

const requiredKeys = [
  "JKADH_DB_HOST",
  "JKADH_DB_PORT",
  "JKADH_DB_NAME",
  "JKADH_DB_USER",
  "JKADH_DB_PASSWORD"
];

export function loadDbConfig(repoRoot: string, env: NodeJS.ProcessEnv = process.env): DbConfigResult {
  const fileEnv = readDotEnv(join(repoRoot, ".env"));
  const values = { ...fileEnv, ...env };
  const missing = requiredKeys.filter((key) => !values[key]);
  const port = Number(values.JKADH_DB_PORT);
  if (values.JKADH_DB_PORT && !Number.isInteger(port)) {
    missing.push("JKADH_DB_PORT(valid integer)");
  }
  if (missing.length > 0) {
    return { status: "blocked", missing };
  }

  return {
    status: "ready",
    missing: [],
    config: {
      env: values.JKADH_ENV || "local",
      host: values.JKADH_DB_HOST || "",
      port,
      database: values.JKADH_DB_NAME || "",
      user: values.JKADH_DB_USER || "",
      password: values.JKADH_DB_PASSWORD || ""
    }
  };
}

export function readDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    values[match[1]] = unquoteEnvValue(match[2]);
  }
  return values;
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
