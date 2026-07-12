import assert from "node:assert/strict";
import { test } from "node:test";

import { parseBacklogIndex } from "../src/docs/backlog-index.ts";
import { parseLatestRetrospective } from "../src/docs/retrospective-index.ts";

test("backlog index parser returns unresolved backlog rows", () => {
  const markdown = `
| ID | 제목 | 상태 | 처리시점 | 우선순위 | 의존 대상 | 연결 Issue | 경로 |
|---|---|---|---|---|---|---|---|
| BLG-022 | Backlog 문서 템플릿 분리 검토 | Deferred | 정기 점검 시 | Low | 공식 문서 템플릿 적용 결과 확인 | - | [BLG-022](./2026/07/07/BLG-022_Backlog_문서_템플릿_분리_검토.md) |
| BLG-025 | 회고문서 Codex채팅세션 Agent 매핑과 채번기준 보강 | Ready | 다음 Issue 선정 시 | Medium | RET 문서 Header 기준 | - | [BLG-025](./2026/07/12/BLG-025_회고문서_Codex채팅세션_Agent_매핑과_채번기준_보강.md) |
`;

  assert.deepEqual(parseBacklogIndex(markdown), [
    {
      id: "BLG-022",
      title: "Backlog 문서 템플릿 분리 검토",
      status: "Deferred",
      timing: "정기 점검 시",
      priority: "Low",
      path: "./2026/07/07/BLG-022_Backlog_문서_템플릿_분리_검토.md"
    },
    {
      id: "BLG-025",
      title: "회고문서 Codex채팅세션 Agent 매핑과 채번기준 보강",
      status: "Ready",
      timing: "다음 Issue 선정 시",
      priority: "Medium",
      path: "./2026/07/12/BLG-025_회고문서_Codex채팅세션_Agent_매핑과_채번기준_보강.md"
    }
  ]);
});

test("retrospective parser returns latest RET document by id", () => {
  const markdown = `
| 문서 ID | 문서명 | 상태 |
|---|---|---|
| RET-007 | [2026-07-08 세션태그 게이트와 공식문서 Header 현행화 회고](./RET-007_2026-07-08_세션태그_게이트와_공식문서_Header_현행화_회고.md) | Draft |
| RET-008 | [2026-07-12 Harness 태그기반 프로세스 실행경계 정리회고](./RET-008_2026-07-12_Harness_태그기반_프로세스_실행경계_정리회고.md) | Draft |
`;

  assert.deepEqual(parseLatestRetrospective(markdown), {
    id: "RET-008",
    title: "2026-07-12 Harness 태그기반 프로세스 실행경계 정리회고",
    status: "Draft",
    path: "./RET-008_2026-07-12_Harness_태그기반_프로세스_실행경계_정리회고.md"
  });
});
