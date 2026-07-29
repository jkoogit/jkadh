# REF-007 Harness 태스크승급 사용방법

## 현행 구현 기준

2026-07-29 현재 채팅 태그 `#태스크승급`의 기본 동작은 실행모드다. 보고만 필요하면 `#태스크승급.보고`를 사용한다.

`#태스크승급`은 `#태스크정리`에서 PR이 `dev`에 merge된 뒤, 그 `dev` 커밋을 `stg`, `main`으로 fast-forward 승급한다. PR 생성/merge는 하지 않고, Issue 종료도 하지 않는다.

| 항목 | 값 |
|---|---|
| 문서 ID | REF-007 |
| 문서 유형 | 참고 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.2 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/169-hcp-work-item-backlog-issue-pr-dev-stg-main-text |
| 최종 수정일 | 2026-07-29 |

## 목차

- [1. 목적](#1-목적)
- [2. 사용할 때](#2-사용할-때)
- [3. CLI 직접 실행 방법](#3-cli-직접-실행-방법)
- [4. 실행모드](#4-실행모드)
- [5. Harness가 하지 않는 일](#5-harness가-하지-않는-일)
- [6. 다음 단계](#6-다음-단계)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 `#태스크승급`에서 머지된 태스크 변경사항을 대상 브랜치로 승급하는 방법을 정리한다.

`#태스크승급`은 PR을 생성하거나 머지하는 단계가 아니다. 이미 `dev`에 머지된 PR 또는 지정 커밋을 기준으로 `stg`, `main` 대상 브랜치가 fast-forward 가능한지 확인하고, 실행모드에서 대상 브랜치를 갱신한다.

HCP 실행모드는 단계별 policy registry의 공통 `PolicyResult`를 사용한다. 각 결과에는 `policyVersion`을 기록하고 HCP process evidence의 `recordedAt`과 결합해 어떤 정책 버전이 언제 적용됐는지 재현한다. 승급하려는 태스크가 `closed`이고, 성공한 `closeEvidence`와 연결 PR이 있으며, 해당 PR이 `dev` 대상으로 `MERGED` 상태이고 PR의 `mergeCommit`이 대상 커밋과 일치하며, `origin/dev`가 그 커밋을 포함할 때만 승급을 허용한다. CLI에 전달한 `--verification` 문자열은 보조 설명이며 이 근거들을 대체하지 않는다.

동일한 registry 평가와 적용 evidence 기준은 `task_start`, `task_process`, `task_close`, `task_promote`, `session_close` 전 단계에 적용한다. 실행 시 stage, task ID, 결과, policy ID·version·evidence와 평가시각을 HCP session의 lifecycle policy evidence에 저장한다.

## 2. 사용할 때

다음 상황에서 사용한다.

- `#태스크정리`에서 PR merge가 끝났을 때
- `dev`에 반영된 태스크 변경사항을 `stg`, `main`에 맞춰야 할 때
- 대상 브랜치가 지정 커밋으로 fast-forward 가능한지 확인해야 할 때

## 3. CLI 직접 실행 방법

채팅 태그 기준으로 기본 `#태스크승급`은 실행 의도로 해석한다. 실행 없이 보고만 필요하면 다음처럼 `.보고` suffix를 사용한다.

```text
#태스크승급.보고
```

기본 report는 다음처럼 실행한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
node --experimental-strip-types src/cli.ts task promote `
  --target-commit da7c23afe810b255b2934c7855ef0a6224c80b42 `
  --target-branches stg,main `
  --verification "npm test and npm run check passed"
```

## 4. 실행모드

실행모드는 `--execute`를 명시했을 때만 동작한다.

```powershell
node --experimental-strip-types src/cli.ts task promote `
  --target-commit da7c23afe810b255b2934c7855ef0a6224c80b42 `
  --target-branches stg,main `
  --verification "npm test and npm run check passed" `
  --execute
```

실행모드는 각 대상 브랜치에 대해 다음 작업만 수행한다.

```text
git push origin <target-commit>:refs/heads/<target-branch>
```

단, report에서 모든 대상 브랜치가 fast-forward 가능해야 실행된다.

## 5. Harness가 하지 않는 일

`#태스크승급`은 다음 작업을 하지 않는다.

- Issue 종료
- PR 생성
- PR 머지
- 태스크 시작/정리 실행
- 외부 레포 권한 처리

Issue 종료는 `#세션정리`에서만 가능하다. PR 생성과 머지는 `#태스크정리`에서 처리한다.

## 6. 다음 단계

`#태스크승급` 후에는 `dev/stg/main` 정합성을 확인한다.

| 상황 | 다음 처리 |
|---|---|
| 승급 완료 | 다음 작업 리뷰를 수행하고 다음 태스크 시작 또는 `#세션정리` 프롬프트를 추천 |
| fast-forward 불가 | 충돌 원인을 확인하고 승급 중단 |
| HCP evidence, PR 또는 dev merge 불일치 | 정책 결과의 blocked 사유를 확인하고 승급 중단 |
| Issue 종료 필요 | `#세션정리`에서만 검증 후 처리 |

승급 완료 보고의 다음 작업 리뷰에는 다음 항목을 포함한다.

- HCP 세션의 전체 task 상태와 각 task에 연결된 Issue·PR
- 전체 Work Item의 표시 ID·상태·제목
- 전체 세션 Backlog의 ID·상태·제목
- 세션 `linkedIssue`와 task `issueNumber`를 중복 제거한 관련 Issue의 원격 상태
- 저장소의 열린 PR과 `origin/dev`, `origin/stg`, `origin/main` SHA 및 일치 여부
- 실제 남은 task, 열린 세션 Backlog, 미완료 Work Item을 기준으로 선택한 추천 다음턴 프롬프트

이 조회는 HCP task 상태를 `promoted`로 저장한 뒤 실행한다. 따라서 승급 직후 출력되는 task 상태는 승급 전 `closed`가 아니라 현재 `promoted` 상태다. Issue 또는 PR 원격 조회가 실패하면 해당 항목을 `unavailable` 또는 `UNKNOWN`으로 표시하고, 이미 성공한 승급과 HCP 상태 전환은 되돌리지 않는다. 현황 리뷰 자체의 렌더링이 실패해도 승급 결과를 보존하고 CLI 성공 결과와 분리된 비치명적 리뷰 실패로 보고한다.

남은 task가 이미 등록되어 있으면 중복 `#태스크시작` 대신 상태에 맞는 명령을 제안한다. `active`는 `#태스크처리`, `closed`는 `#태스크승급`, `blocked`·`failed`는 상태 복구를 포함한 `#태스크처리` 대상이다. 새 작업 후보인 열린 세션 Backlog 또는 미완료 Work Item이 있으면 세션 ID와 후보 ID·제목·범위를 반영한 `#태스크시작{...}`을 생성한다. `deferred` Work Item은 즉시 시작할 후보에서 제외한다. 후보가 없으면 `#세션정리`를 제안한다. 모든 추천 프롬프트는 별도의 `text` 코드 블록으로 출력하며 고정 예시 작업은 사용하지 않는다.

원격 Issue·PR JSON은 필수 필드와 타입을 검증한다. 잘못된 응답은 현황 생성 예외로 전파하지 않고 해당 조회를 사용할 수 없는 상태로 표시한다. 승급 후 GitHub 조회와 원격 브랜치 조회에는 15초 제한시간을 적용해 응답이 없는 외부 명령 때문에 승급 응답이 무기한 대기하지 않도록 한다.

`#태스크정리` 단계에서는 다음 권장 명령을 `#태스크승급`으로 제한한다. 실제 다음 업무 후보와 붙여넣기 가능한 `#태스크시작{...}` 프롬프트는 승급 완료 후 제안한다.

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-13 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness `#태스크승급` 사용방법 문서 작성 |
| 2026-07-15 | [#97](https://github.com/jkoogit/jkadh/issues/97) | Codex | GPT-5 | CTO | jk / Codex | Update | 승급 완료 후 다음 작업 리뷰와 추천 다음턴 프롬프트 기준 추가 |
| 2026-07-21 | [#122](https://github.com/jkoogit/jkadh/issues/122) | Codex | GPT-5 | CTO | jk / Codex | Update | 단계별 policy registry와 HCP close evidence, PR, dev merge 대조 기준 추가 |
| 2026-07-25 | [#127](https://github.com/jkoogit/jkadh/issues/127) | Codex | GPT-5 | CTO | jk / Codex | Update | policy version 이력과 PR merge commit·dev target commit 직접 관계 검증 반영 |
| 2026-07-29 | [#169](https://github.com/jkoogit/jkadh/issues/169) | Codex | GPT-5 | CTO | jk / Codex | Update | 승급 후 실제 HCP task·Work Item·Backlog·Issue·PR·브랜치 현황과 동적 복사용 다음 프롬프트 출력 반영 |
| 2026-07-29 | [#169](https://github.com/jkoogit/jkadh/issues/169) | Codex | GPT-5 | CTO | jk / Codex | Revise | 리뷰 실패 격리, 상태별 다음 명령, deferred 후보 제외, 원격 응답 검증과 조회 timeout 보완 |

[목차로 이동](#목차)
