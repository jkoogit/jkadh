# REF-008 Harness 세션정리 사용방법

| 항목 | 값 |
|---|---|
| 문서 ID | REF-008 |
| 문서 유형 | 참고 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/064-harness-session-close-execute |
| 최종 수정일 | 2026-07-13 |

## 목차

- [1. 목적](#1-목적)
- [2. 사용할 때](#2-사용할-때)
- [3. CLI 직접 실행 방법](#3-cli-직접-실행-방법)
- [4. 실행모드](#4-실행모드)
- [5. Harness가 하지 않는 일](#5-harness가-하지-않는-일)
- [6. 다음 세션 공유내용](#6-다음-세션-공유내용)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 `#세션정리`에서 세션 종료에 필요한 항목을 확인하고, 검증된 Issue 종료 후보만 처리하는 방법을 정리한다.

`#세션정리`는 태스크 변경사항을 PR로 만들거나 승급하는 단계가 아니다. 태스크 단위 변경사항은 `#태스크정리`, 브랜치 승급은 `#태스크승급`에서 처리한다.

## 2. 사용할 때

다음 상황에서 사용한다.

- 세션에서 완료한 태스크 목록을 정리할 때
- 실제 작업 기준으로 세션명을 현행화할 때
- 관련 Issue 제목/본문 현행화 후보를 정리할 때
- 남은 Backlog/Issue/PR을 확인할 때
- 회고와 다음 세션 공유내용을 남길 때
- 검증된 Issue 종료 후보를 세션 종료 단계에서만 닫을 때

## 3. CLI 직접 실행 방법

기본 report는 다음처럼 실행한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
node --experimental-strip-types src/cli.ts session close `
  --completed-task "Harness task start execution mode" `
  --completed-task "Harness task close execution mode" `
  --completed-task "Harness task promote execution mode" `
  --session-name "Harness CLI execution modes" `
  --issue-update "Issue #64 title/body should reflect execution modes" `
  --remaining "No open PR; report suffix remains backlog candidate" `
  --retrospective "RET draft ready" `
  --handoff "Next session starts from report suffix backlog"
```

## 4. 실행모드

실행모드는 `--execute`를 명시했을 때만 동작한다.

```powershell
node --experimental-strip-types src/cli.ts session close `
  --completed-task "Harness task start execution mode" `
  --session-name "Harness CLI execution modes" `
  --issue-update "Issue #64 updated" `
  --remaining "No open PR" `
  --retrospective "RET draft ready" `
  --handoff "Next session starts from report suffix backlog" `
  --verified-issue 64 `
  --execute
```

실행모드에서 허용되는 쓰기 작업은 검증된 Issue 종료뿐이다.

```text
gh issue close <number> --comment "Closed by verified #세션정리."
```

`--verified-issue`가 없으면 실행모드는 차단된다.

## 5. Harness가 하지 않는 일

`#세션정리`는 다음 작업을 하지 않는다.

- 태스크 PR 생성
- 태스크 PR 머지
- `dev`, `stg`, `main` 승급
- 외부 레포 권한 처리
- 검증되지 않은 Issue 종료

## 6. 다음 세션 공유내용

세션 정리 후 다음 내용을 공유한다.

- 최종 세션명
- 완료 태스크 목록
- 남은 Backlog/Issue/PR
- 회고 문서 또는 회고 초안 위치
- 다음 세션 추천 세션명
- 다음 세션 시작점
- 기준 브랜치/커밋

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-13 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness `#세션정리` 사용방법 문서 작성 |

[목차로 이동](#목차)
