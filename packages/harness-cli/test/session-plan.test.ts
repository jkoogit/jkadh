import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRetrospectiveDetail } from "../src/docs/retrospective-detail.ts";
import { buildSessionPlan } from "../src/session/session-plan.ts";

test("retrospective detail parser extracts next session fields and reference docs", () => {
  const markdown = `
## 8. 다음 세션 시작 프롬프트

\`\`\`markdown
#세션시작

이전 세션 종료 기준:
- 다음 세션 추천 세션명: Harness_CLI_1차구현_착수
- 다음 세션 권장 시작점: Harness CLI 1차 구현 착수
- 남은 Backlog: BLG-022 Backlog 문서 템플릿 분리 검토
\`\`\`

## 10. 관련 문서

- [STA-002 AI 시작가이드](../00.시작/STA-002_AI_시작가이드.md)
- [REF-003 Harness 태그기반 프로세스 자동화 검토](../16.참고/REF-003_Harness_태그기반_프로세스_자동화_검토.md)
`;

  assert.deepEqual(parseRetrospectiveDetail(markdown), {
    recommendedSessionName: "Harness_CLI_1차구현_착수",
    recommendedStartPoint: "Harness CLI 1차 구현 착수",
    remainingBacklog: "BLG-022 Backlog 문서 템플릿 분리 검토",
    referenceDocs: [
      {
        title: "STA-002 AI 시작가이드",
        path: "../00.시작/STA-002_AI_시작가이드.md"
      },
      {
        title: "REF-003 Harness 태그기반 프로세스 자동화 검토",
        path: "../16.참고/REF-003_Harness_태그기반_프로세스_자동화_검토.md"
      }
    ]
  });
});

test("session plan uses retrospective recommendation and related issue when available", () => {
  const plan = buildSessionPlan({
    issueNumber: 64,
    issueTitle: "Harness CLI 1차 구현: read/check/report 최소 골격",
    detail: {
      recommendedSessionName: "Harness_CLI_1차구현_착수",
      recommendedStartPoint: "Harness CLI 1차 구현 착수",
      remainingBacklog: "BLG-022 Backlog 문서 템플릿 분리 검토",
      referenceDocs: []
    }
  });

  assert.deepEqual(plan, {
    sessionNumber: "manual_required",
    initialSessionName: "Harness_CLI_1차구현_착수",
    recommendedBranchName: "task_codex/064-harness-cli-initial",
    relatedIssue: "#64 Harness CLI 1차 구현: read/check/report 최소 골격",
    issueStep: "use existing issue",
    recommendedNextWork: "Harness CLI 1차 구현 착수"
  });
});
