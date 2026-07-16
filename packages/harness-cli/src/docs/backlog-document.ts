import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { hasBacklogIndexEntry, parseBacklogIndex } from "./backlog-index.ts";

export interface BacklogDocumentInput {
  title: string;
  status?: string;
  type?: string;
  date?: string;
  timing?: string;
  priority?: string;
  dependency?: string;
  source?: string;
  sourceDocs?: string[];
  relatedDocs?: string[];
  content?: string;
  background?: string;
  expectedEffect?: string;
  criteria?: string;
}

export interface BacklogDocumentResult {
  backlogId: string;
  title: string;
  filePath: string;
  indexPath: string;
  indexRef: string;
  gate: {
    status: "pass" | "blocked";
    detail: string;
  };
}

export function createBacklogDocument(repoRoot: string, input: BacklogDocumentInput): BacklogDocumentResult {
  const title = input.title.trim();
  if (!title) {
    throw new Error("missing required option: --title");
  }

  const date = input.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`invalid backlog date: ${date}`);
  }

  const indexPath = backlogIndexPath(repoRoot);
  const indexMarkdown = readFileSync(indexPath, "utf8");
  const backlogId = nextBacklogId(indexMarkdown);
  const dateParts = date.split("-");
  const fileName = `${backlogId}_${sanitizeFileName(title)}.md`;
  const relativeFilePath = join("docs", "15.로그", "backlog", dateParts[0], dateParts[1], dateParts[2], fileName);
  const filePath = join(repoRoot, relativeFilePath);
  if (existsSync(filePath)) {
    throw new Error(`backlog document already exists: ${relativeFilePath}`);
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buildBacklogMarkdown({
    ...input,
    title,
    date,
    backlogId
  }), "utf8");

  const indexRef = `./${dateParts[0]}/${dateParts[1]}/${dateParts[2]}/${fileName}`.replace(/\\/g, "/");
  const updatedIndex = appendBacklogIndexRow(indexMarkdown, {
    backlogId,
    title,
    status: input.status ?? "Open",
    timing: input.timing ?? "다음 Issue 선정 시",
    priority: input.priority ?? "Medium",
    dependency: input.dependency ?? "-",
    indexRef
  });
  writeFileSync(indexPath, updatedIndex, "utf8");

  const reflected = hasBacklogIndexEntry(updatedIndex, {
    backlogId,
    path: indexRef
  });
  return {
    backlogId,
    title,
    filePath: relativeFilePath.replace(/\\/g, "/"),
    indexPath: "docs/15.로그/backlog/README.md",
    indexRef,
    gate: {
      status: reflected ? "pass" : "blocked",
      detail: reflected
        ? `backlog-only gate: ${relativeFilePath.replace(/\\/g, "/")}; docs/15.로그/backlog/README.md`
        : "backlog index: missing entry after update"
    }
  };
}

function backlogIndexPath(repoRoot: string): string {
  return join(repoRoot, "docs", "15.로그", "backlog", "README.md");
}

function nextBacklogId(indexMarkdown: string): string {
  const maxId = parseBacklogIndex(indexMarkdown)
    .map((entry) => entry.id.match(/^BLG-(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .reduce((max, value) => Math.max(max, value), 0);
  return `BLG-${String(maxId + 1).padStart(3, "0")}`;
}

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

function buildBacklogMarkdown(input: BacklogDocumentInput & { backlogId: string; date: string }): string {
  const status = input.status ?? "Open";
  const type = input.type ?? "PROCESS";
  const timing = input.timing ?? "다음 Issue 선정 시";
  const priority = input.priority ?? "Medium";
  const dependency = input.dependency ?? "-";
  const source = input.source ?? "세션 논의";
  const sourceDocs = listOrDash(input.sourceDocs);
  const relatedDocs = listOrDash(input.relatedDocs);
  const content = input.content ?? `${input.title}을 Backlog로 등록한다.`;
  const background = input.background ?? "현재 작업 범위에 바로 포함하지 않고 후속 검토 대상으로 추적할 필요가 있다.";
  const expectedEffect = input.expectedEffect ?? "후속 작업 후보를 잃지 않고 Issue 승격 또는 보류 여부를 판단할 수 있다.";
  const criteria = input.criteria ?? "후속 검토에서 작업 범위, 제외 범위, 완료 조건, 검증 방법이 정리되면 Issue 승격 여부를 판단한다.";

  return `# ${input.backlogId} ${input.title}

> Backlog ID: ${input.backlogId}
> 상태: ${status}
> 유형: ${type}
> 생성일: ${input.date}
> 처리시점: ${timing}
> 우선순위: ${priority}
> 의존 대상: ${dependency}
> 출처: ${source}
> 출처 문서:
${sourceDocs}
> 관련 문서:
${relatedDocs}
> 연결 Issue: None
> 연결 PR: None
> 해결 문서: None

## 목차

- [1. 내용](#1-내용)
- [2. 발생 배경](#2-발생-배경)
- [3. 기대 효과](#3-기대-효과)
- [4. 처리 기준](#4-처리-기준)
- [5. 연결 이력](#5-연결-이력)

## 1. 내용

${content}

## 2. 발생 배경

${background}

## 3. 기대 효과

- ${expectedEffect}

## 4. 처리 기준

- ${criteria}

## 5. 연결 이력

| 날짜 | 상태 | 연결 대상 | 내용 |
|---|---|---|---|
| ${input.date} | ${status} | - | Backlog 최초 등록 |

[목차로 이동](#목차)
`;
}

function listOrDash(values?: string[]): string {
  if (!values || values.length === 0) {
    return "> - -";
  }
  return values.map((value) => `> - ${value}`).join("\n");
}

function appendBacklogIndexRow(markdown: string, input: {
  backlogId: string;
  title: string;
  status: string;
  timing: string;
  priority: string;
  dependency: string;
  indexRef: string;
}): string {
  const row = `| ${input.backlogId} | ${input.title} | ${input.status} | ${input.timing} | ${input.priority} | ${input.dependency} | - | [${input.backlogId}](${input.indexRef}) |`;
  const lines = markdown.split(/\r?\n/);
  let insertIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\| BLG-/.test(lines[index])) {
      insertIndex = index + 1;
    }
  }
  if (insertIndex < 0) {
    throw new Error("backlog index table not found");
  }
  lines.splice(insertIndex, 0, row);
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}
