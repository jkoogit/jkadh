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
  return JSON.parse(content) as ProjectProfile;
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
