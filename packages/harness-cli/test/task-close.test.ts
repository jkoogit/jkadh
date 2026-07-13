import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTaskCloseReport, executeTaskClose, parseTaskCloseArgs, parseTaskCloseBlock } from "../src/flows/task-close.ts";

test("task close arg parser accepts closure evidence fields", () => {
  const input = parseTaskCloseArgs([
    "--completion",
    "implemented task close report",
    "--verification",
    "npm test passed",
    "--out-of-scope",
    "promotion",
    "--remaining",
    "none"
  ]);

  assert.deepEqual(input, {
    completionSummary: "implemented task close report",
    verificationResult: "npm test passed",
    outOfScope: "promotion",
    remainingWork: "none"
  });
});

test("task close arg parser accepts execution options", () => {
  const input = parseTaskCloseArgs([
    "--completion",
    "implemented task close report",
    "--verification",
    "npm test passed",
    "--out-of-scope",
    "promotion",
    "--remaining",
    "none",
    "--execute",
    "--path",
    "packages/harness-cli/src/flows/task-close.ts",
    "--message",
    "feat: add task close execution mode",
    "--pr-title",
    "[064]_(001)_Harness_task_close_execution_mode",
    "--related-issue",
    "64",
    "--base",
    "main",
    "--no-merge"
  ]);

  assert.deepEqual(input.execution, {
    enabled: true,
    paths: ["packages/harness-cli/src/flows/task-close.ts"],
    commitMessage: "feat: add task close execution mode",
    prTitle: "[064]_(001)_Harness_task_close_execution_mode",
    relatedIssueNumber: 64,
    baseBranch: "main",
    mergePr: false
  });
});

test("task close execution defaults PR base to dev", () => {
  const input = parseTaskCloseArgs([
    "--completion",
    "implemented task close report",
    "--verification",
    "npm test passed",
    "--out-of-scope",
    "promotion",
    "--remaining",
    "none",
    "--execute",
    "--path",
    "packages/harness-cli/src/flows/task-close.ts",
    "--message",
    "feat: add task close execution mode",
    "--pr-title",
    "[064]_(001)_Harness_task_close_execution_mode",
    "--related-issue",
    "64"
  ]);

  assert.equal(input.execution?.baseBranch, "dev");
});

test("task close report is ready when closure evidence is present and no work remains", () => {
  const report = buildTaskCloseReport({
    completionSummary: "implemented task close report",
    verificationResult: "npm test passed",
    outOfScope: "promotion",
    remainingWork: "없음",
    gitSummary: {
      statusShort: " M packages/harness-cli/src/cli.ts",
      diffStat: " packages/harness-cli/src/cli.ts | 8 ++++++--"
    }
  });

  assert.equal(report.status, "ready");
  assert.equal(report.json.prReady, true);
  assert.match(report.markdown, /PR readiness: ready for commit, push, PR creation, and PR merge/);
  assert.match(report.markdown, /change summary:/);
});

test("task close report suggests an order when closure evidence is missing", () => {
  const report = buildTaskCloseReport({
    completionSummary: "implemented task close report"
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.json.prReady, false);
  assert.match(report.markdown, /## Suggested Order/);
  assert.match(report.json.suggestedOrder ?? "", /#태스크정리\{/);
  assert.match(report.json.suggestedOrder ?? "", /검증결과: 확인필요/);
});

test("task close block parser accepts Korean and English aliases", () => {
  const korean = parseTaskCloseBlock(`#태스크정리{
완료내용: implemented task close report
검증결과: npm test passed
제외범위: promotion
남은작업: 없음
}`);
  const english = parseTaskCloseBlock(`#태스크정리{
completion: implemented task close report
verification: npm test passed
outOfScope: promotion
remaining: none
}`);

  assert.deepEqual(korean, {
    completionSummary: "implemented task close report",
    verificationResult: "npm test passed",
    outOfScope: "promotion",
    remainingWork: "없음"
  });
  assert.deepEqual(english, {
    completionSummary: "implemented task close report",
    verificationResult: "npm test passed",
    outOfScope: "promotion",
    remainingWork: "none"
  });
});

test("task close execution blocks when required execution options are missing", () => {
  const result = executeTaskClose({
    completionSummary: "implemented task close report",
    verificationResult: "npm test passed",
    outOfScope: "promotion",
    remainingWork: "none",
    execution: {
      enabled: true,
      paths: [],
      baseBranch: "main",
      mergePr: true
    }
  }, "repo");

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /missing execution options: path; message; pr-title; related-issue/);
});

test("task close execution runs commit push PR create and optional merge", () => {
  const calls: string[] = [];
  const result = executeTaskClose({
    completionSummary: "implemented task close report",
    verificationResult: "npm test passed",
    outOfScope: "promotion",
    remainingWork: "none",
    execution: {
      enabled: true,
      paths: ["packages/harness-cli/src/flows/task-close.ts"],
      commitMessage: "feat: add task close execution mode",
      prTitle: "[064]_(001)_Harness_task_close_execution_mode",
      relatedIssueNumber: 64,
      baseBranch: "dev",
      mergePr: true
    }
  }, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "task_codex/064-harness-cli-minimal";
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "create") {
        return "https://github.com/jkoogit/jkadh/pull/65";
      }
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.deepEqual(result.steps.map((step) => step.action), [
    "commit_changes",
    "push_branch",
    "create_pr",
    "merge_pr"
  ]);
  assert.equal(calls[0], "git add -- packages/harness-cli/src/flows/task-close.ts");
  assert.match(calls.join("\n"), /git commit -m feat: add task close execution mode/);
  assert.match(calls.join("\n"), /git push origin task_codex\/064-harness-cli-minimal/);
  assert.match(calls.join("\n"), /gh pr create --base dev --head task_codex\/064-harness-cli-minimal/);
  assert.match(calls.join("\n"), /Related #64/);
  assert.match(calls.join("\n"), /gh pr merge --merge --delete-branch=false/);
});

test("task close execution blocks non-compliant PR titles", () => {
  const result = executeTaskClose({
    completionSummary: "implemented task close report",
    verificationResult: "npm test passed",
    outOfScope: "promotion",
    remainingWork: "none",
    execution: {
      enabled: true,
      paths: ["packages/harness-cli/src/flows/task-close.ts"],
      commitMessage: "feat: add task close execution mode",
      prTitle: "Harness task close execution mode",
      relatedIssueNumber: 64,
      baseBranch: "dev",
      mergePr: true
    }
  }, "repo");

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /missing execution options: compliant pr-title/);
});

test("task close execution updates existing PR before merge", () => {
  const calls: string[] = [];
  const result = executeTaskClose({
    completionSummary: "implemented task close report",
    verificationResult: "npm test passed",
    outOfScope: "promotion",
    remainingWork: "none",
    execution: {
      enabled: true,
      paths: ["packages/harness-cli/src/flows/task-close.ts"],
      commitMessage: "feat: add task close execution mode",
      prTitle: "[064]_(001)_Harness_task_close_execution_mode",
      relatedIssueNumber: 64,
      baseBranch: "dev",
      mergePr: true
    }
  }, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "branch --show-current") {
        return "task_codex/064-harness-cli-minimal";
      }
      if (command === "gh" && args.join(" ") === "pr view --json url --jq .url") {
        return "https://github.com/jkoogit/jkadh/pull/65";
      }
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.match(calls.join("\n"), /gh pr edit --title \[064\]_\(001\)_Harness_task_close_execution_mode --body/);
  assert.match(calls.join("\n"), /gh pr ready/);
  assert.match(calls.join("\n"), /gh pr merge --merge --delete-branch=false/);
});
