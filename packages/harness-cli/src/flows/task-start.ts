import { createReportDocument } from "../reports/create-report.ts";

export interface TaskStartInput {
  issueNumber?: number;
  workOrderId?: string;
  scope?: string;
  outOfScope?: string;
  completionCriteria?: string;
  verificationMethod?: string;
}

export interface TaskStartReport {
  command: "task start";
  status: "ready" | "blocked";
  markdown: string;
  json: {
    input: TaskStartInput;
    missing: string[];
    recommendedBranchName?: string;
  };
  blockedActions: string[];
}

const blockedActions = ["create_issue", "create_branch"];

export function parseTaskStartArgs(args: string[]): TaskStartInput {
  const input: TaskStartInput = {};

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key || !value) {
      continue;
    }

    if (key === "--issue") {
      input.issueNumber = Number(value);
    }
    if (key === "--work-order") {
      input.workOrderId = value;
    }
    if (key === "--scope") {
      input.scope = value;
    }
    if (key === "--out-of-scope") {
      input.outOfScope = value;
    }
    if (key === "--completion") {
      input.completionCriteria = value;
    }
    if (key === "--verification") {
      input.verificationMethod = value;
    }
  }

  return input;
}

export function parseTaskStartBlock(block: string): TaskStartInput {
  const input: TaskStartInput = {};
  const body = block.match(/#태스크시작\s*\{([\s\S]*)\}/)?.[1] ?? block;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "}") {
      continue;
    }

    const match = line.match(/^([^:=]+)\s*[:=]\s*(.*)$/);
    if (!match) {
      continue;
    }

    applyTaskStartField(input, match[1].trim(), match[2].trim());
  }

  return input;
}

export function buildTaskStartReport(input: TaskStartInput): TaskStartReport {
  const missing = missingFields(input);
  const recommendedBranchName = input.issueNumber && input.scope
    ? `task_codex/${String(input.issueNumber).padStart(3, "0")}-${slugifyScope(input.scope)}`
    : undefined;
  const status = missing.length === 0 ? "ready" : "blocked";

  const report = createReportDocument({
    title: "Harness CLI task start",
    summary: "Check task start readiness before implementation.",
    checks: [
      {
        name: "task identifier",
        status: input.issueNumber || input.workOrderId ? "pass" : "blocked",
        detail: input.issueNumber ? `issue #${input.issueNumber}` : input.workOrderId ?? "missing"
      },
      {
        name: "scope",
        status: input.scope ? "pass" : "blocked",
        detail: input.scope ?? "missing"
      },
      {
        name: "out of scope",
        status: input.outOfScope ? "pass" : "blocked",
        detail: input.outOfScope ?? "missing"
      },
      {
        name: "completion criteria",
        status: input.completionCriteria ? "pass" : "blocked",
        detail: input.completionCriteria ?? "missing"
      },
      {
        name: "verification method",
        status: input.verificationMethod ? "pass" : "blocked",
        detail: input.verificationMethod ?? "missing"
      },
      {
        name: "start readiness",
        status: status === "ready" ? "pass" : "blocked",
        detail: status === "ready" ? "ready" : `missing: ${missing.join("; ")}`
      },
      {
        name: "recommended branch",
        status: recommendedBranchName ? "info" : "blocked",
        detail: recommendedBranchName ?? "requires issue and scope"
      },
      {
        name: "write actions",
        status: "blocked",
        detail: blockedActions.map((action) => `${action} blocked`).join("; ")
      }
    ]
  });

  return {
    command: "task start",
    status,
    markdown: report.markdown,
    json: {
      input,
      missing,
      recommendedBranchName
    },
    blockedActions
  };
}

function missingFields(input: TaskStartInput): string[] {
  const missing: string[] = [];
  if (!input.issueNumber && !input.workOrderId) {
    missing.push("issue or work order");
  }
  if (!input.scope) {
    missing.push("scope");
  }
  if (!input.outOfScope) {
    missing.push("out of scope");
  }
  if (!input.completionCriteria) {
    missing.push("completion criteria");
  }
  if (!input.verificationMethod) {
    missing.push("verification method");
  }
  return missing;
}

function applyTaskStartField(input: TaskStartInput, key: string, value: string): void {
  const field = normalizeTaskStartField(key);
  if (!field || !value) {
    return;
  }

  if (field === "issueNumber") {
    const issueNumber = Number(value.replace(/^#/, ""));
    if (Number.isFinite(issueNumber)) {
      input.issueNumber = issueNumber;
    }
    return;
  }

  if (field === "workOrderId") {
    input.workOrderId = value;
    return;
  }

  input[field] = value;
}

function normalizeTaskStartField(key: string): keyof TaskStartInput | undefined {
  const normalized = key.replace(/\s+/g, "").toLowerCase();
  const aliases: Record<string, keyof TaskStartInput> = {
    i: "issueNumber",
    issue: "issueNumber",
    이슈: "issueNumber",
    w: "workOrderId",
    workorder: "workOrderId",
    작업지시: "workOrderId",
    s: "scope",
    scope: "scope",
    작업범위: "scope",
    o: "outOfScope",
    outofscope: "outOfScope",
    제외범위: "outOfScope",
    c: "completionCriteria",
    completion: "completionCriteria",
    완료조건: "completionCriteria",
    v: "verificationMethod",
    verification: "verificationMethod",
    검증방법: "verificationMethod"
  };

  return aliases[normalized];
}

function slugifyScope(scope: string): string {
  if (scope.toLowerCase().includes("task start")) {
    return "harness-cli-task-start";
  }

  return scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "task";
}
