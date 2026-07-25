import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export type ProjectAccessMode = "internal" | "env";

export interface ProjectProfile {
  project_id: string;
  display_name?: string;
  repo_full_name: string;
  local_path: string;
  access_mode: ProjectAccessMode;
  credential_ref?: string;
  default_base_branch?: string;
  task_pr_base_branch?: string;
  promotion_branches?: string[];
  branch_strategy?: "feature";
  branch_alignment_policy?: "aligned" | "promotion";
  allowed_work_types?: Array<"platform" | "service" | "integration">;
  harness_enabled?: boolean;
  allowed_start_branches?: string[];
  ignored_untracked_paths?: string[];
}

export interface ProjectAccessResult {
  status: "allowed" | "blocked";
  reason: string;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const defaultProfilesDir = join(moduleDir, "../../data/projects");

export async function loadProjectProfile(
  projectId: string,
  profilesDir = defaultProfilesDir
): Promise<ProjectProfile> {
  const content = await readFile(join(profilesDir, `${projectId}.json`), "utf8");
  const profile = JSON.parse(content) as unknown;
  validateProjectProfile(profile, projectId);
  return profile;
}

export function checkProjectAccess(profile: ProjectProfile): ProjectAccessResult {
  if (profile.access_mode === "internal") {
    return {
      status: "allowed",
      reason: "internal repository access uses current workspace permissions"
    };
  }

  return {
    status: "blocked",
    reason: "env repository access is reserved for a later implementation"
  };
}

export function resolveProjectLocalPath(profile: ProjectProfile, repositoryRoot: string): string {
  return resolve(repositoryRoot, profile.local_path);
}

function validateProjectProfile(value: unknown, projectId: string): asserts value is ProjectProfile {
  if (!value || typeof value !== "object") {
    throw new Error(`invalid ProjectProfile ${projectId}: expected an object`);
  }
  const profile = value as Record<string, unknown>;
  for (const key of ["project_id", "repo_full_name", "local_path", "access_mode"] as const) {
    if (typeof profile[key] !== "string" || profile[key].trim().length === 0) {
      throw new Error(`invalid ProjectProfile ${projectId}: ${key} is required`);
    }
  }
  if (!(["internal", "env"] as unknown[]).includes(profile.access_mode)) {
    throw new Error(`invalid ProjectProfile ${projectId}: unsupported access_mode`);
  }
  if (profile.project_id !== projectId) {
    throw new Error(`invalid ProjectProfile ${projectId}: project_id mismatch`);
  }
  for (const key of ["promotion_branches", "allowed_work_types", "allowed_start_branches", "ignored_untracked_paths"] as const) {
    const field = profile[key];
    if (field !== undefined && (!Array.isArray(field) || field.some((item) => typeof item !== "string"))) {
      throw new Error(`invalid ProjectProfile ${projectId}: ${key} must be a string array`);
    }
  }
}
