# REF-007 Harness 태스크승급 사용방법

| 항목 | 값 |
|---|---|
| 문서 ID | REF-007 |
| 문서 유형 | 참고 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/064-harness-task-promote-execute |
| 최종 수정일 | 2026-07-13 |

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

`#태스크승급`은 PR을 생성하거나 머지하는 단계가 아니다. 이미 머지된 PR 또는 지정 커밋을 기준으로 `dev`, `stg` 같은 대상 브랜치가 fast-forward 가능한지 확인하고, 실행모드에서 대상 브랜치를 갱신한다.

## 2. 사용할 때

다음 상황에서 사용한다.

- `#태스크정리`에서 PR merge가 끝났을 때
- `main`에 반영된 태스크 변경사항을 `dev`, `stg`에 맞춰야 할 때
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
  --target-branches dev,stg `
  --verification "npm test and npm run check passed"
```

## 4. 실행모드

실행모드는 `--execute`를 명시했을 때만 동작한다.

```powershell
node --experimental-strip-types src/cli.ts task promote `
  --target-commit da7c23afe810b255b2934c7855ef0a6224c80b42 `
  --target-branches dev,stg `
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
| 승급 완료 | 다음 태스크 시작 또는 `#세션정리` |
| fast-forward 불가 | 충돌 원인을 확인하고 승급 중단 |
| Issue 종료 필요 | `#세션정리`에서만 검증 후 처리 |

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-13 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness `#태스크승급` 사용방법 문서 작성 |

[목차로 이동](#목차)
