export type EnvStatus = "present" | "missing";

export interface EnvCheckResult {
  name: string;
  status: EnvStatus;
}

export function checkRequiredEnv(
  names: string[],
  env: NodeJS.ProcessEnv = process.env
): EnvCheckResult[] {
  return names.map((name) => ({
    name,
    status: env[name] ? "present" : "missing"
  }));
}

export function redactSecretValues(text: string, secretValues: string[]): string {
  return secretValues
    .filter((value) => value.length > 0)
    .reduce((current, value) => current.split(value).join("***REDACTED***"), text);
}
