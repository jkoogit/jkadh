# REF-006 Harness 태스크정리 사용방법

## 현행 구현 기준

2026-07-13 현재 채팅 태그 `#태스크정리`의 기본 동작은 실행모드다. 보고만 필요하면 `#태스크정리.보고`를 사용한다.

실행모드는 태스크 변경사항을 commit/push하고 PR을 `dev` 대상으로 생성/갱신한 뒤 merge한다. 내부 실행 계획은 `commit_changes -> push_branch -> create_pr -> merge_pr_to_dev` 순서로 표시한다. `stg`, `main` 반영은 `#태스크승급`에서 처리하며, Issue 종료는 `#세션정리`에서만 처리한다.

| 항목 | 값 |
|---|---|
| 문서 ID | REF-006 |
| 문서 유형 | 참고 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/064-harness-cli-minimal |
| 최종 수정일 | 2026-07-12 |

## 목차

- [1. 목적](#1-목적)
- [2. 사용할 때](#2-사용할-때)
- [3. 채팅 주문 방법](#3-채팅-주문-방법)
- [4. 입력 항목](#4-입력-항목)
- [5. 지원 별칭](#5-지원-별칭)
- [6. Harness가 확인하는 항목](#6-harness가-확인하는-항목)
- [7. Harness가 하지 않는 일](#7-harness가-하지-않는-일)
- [8. CLI 직접 실행 방법](#8-cli-직접-실행-방법)
- [9. 실행모드](#9-실행모드)
- [10. 결과 해석 기준](#10-결과-해석-기준)
- [11. 다음 단계](#11-다음-단계)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 채팅 세션에서 `#태스크정리` 태그를 사용할 때 Harness가 수행하는 정리 report 범위와 사용 방법을 정리한다.

`#태스크정리`는 구현이 끝난 뒤 변경 요약, 완료 내용, 검증 결과, 제외 범위, 남은 작업을 확인하고, 태스크 단위 변경사항을 PR 생성/머지까지 반영하는 태그다.

## 2. 사용할 때

다음 상황에서 사용한다.

- `#태스크시작`으로 연 작업의 구현이 끝났을 때
- 커밋, push, PR 생성 전에 변경 범위와 검증 결과를 정리할 때
- 태스크 단위 PR을 생성하거나 기존 PR을 갱신할 때
- 태스크 단위 PR을 머지할 수 있는지 확인할 때
- 머지된 태스크를 `#태스크승급`으로 넘길 준비를 할 때

## 3. 채팅 주문 방법

기본 주문은 다음과 같다.

```text
#태스크정리
```

기본 `#태스크정리`는 실행 의도로 해석한다. 단독으로 입력하면 Harness는 현재 Git 변경 요약을 확인하고, 누락된 정리 항목을 채울 수 있는 주문서 초안을 출력한다. 실행 없이 보고만 필요하면 `.보고` suffix를 사용한다.

```text
#태스크정리.보고
```

정리 항목을 명시하려면 블록 형식을 사용한다.

```text
#태스크정리{
완료내용: Harness #태스크정리 1차 report 구현
검증결과: npm test와 npm run check 통과
제외범위: Issue 종료, dev/stg/main 승급
남은작업: 없음
}
```

## 4. 입력 항목

`#태스크정리`가 ready가 되려면 다음 항목이 필요하다.

| 항목 | 필수 여부 | 설명 |
|---|---|---|
| 완료내용 | 필수 | 이번 태스크에서 완료한 내용 |
| 검증결과 | 필수 | 실행한 검증과 결과 |
| 제외범위 | 필수 | 이번 태스크에서 일부러 하지 않은 일 |
| 남은작업 | 필수 | PR 생성/머지 전에 남은 작업이 있는지. 없으면 `없음` |

`남은작업`이 `없음`, `없다`, `none`, `no` 중 하나이면 `PR readiness`가 통과된다.

## 5. 지원 별칭

현재 지원하는 별칭은 다음과 같다.

| 의미 | 한글 단어 | 영문 풀워드 | 영문 축약 |
|---|---|---|---|
| 완료내용 | `완료내용` | `completion` | `c` |
| 검증결과 | `검증결과` | `verification` | `v` |
| 제외범위 | `제외범위` | `outOfScope` | `o` |
| 남은작업 | `남은작업` | `remaining` | `r` |

키와 값은 `:` 또는 `=`로 구분할 수 있다.

## 6. Harness가 확인하는 항목

현재 Harness CLI는 `#태스크정리`에서 다음 항목을 확인한다.

| 항목 | 현재 처리 |
|---|---|
| 변경 요약 | `git status --short`, `git diff --stat` 기준 표시 |
| 완료내용 | 입력 여부 확인 |
| 검증결과 | 입력 여부 확인 |
| 제외범위 | 입력 여부 확인 |
| 남은작업 | 입력 여부 확인 |
| PR 준비 여부 | 필수 항목이 있고 남은작업이 없으면 커밋, push, PR 생성, `dev` PR 머지 준비 완료 |
| 실행 계획 | `commit_changes`, `push_branch`, `create_pr`, `merge_pr_to_dev` 순서 표시 |
| 쓰기 작업 | `commit_changes`, `push_branch`, `create_pr`, `merge_pr_to_dev` 대상 표시 |

## 7. Harness가 하지 않는 일

`#태스크정리`의 책임에는 다음 작업이 포함된다.

- 커밋
- push
- PR 생성
- PR 병합

채팅 태그 기준으로는 기본 `#태스크정리`가 실행 의도다. CLI 직접 실행 기준에서는 `--execute`를 명시하고 실행 필수 옵션을 제공한 경우에만 커밋, push, PR 생성, `dev` PR 머지를 수행한다.

`#태스크정리`는 다음 작업을 하지 않는다.

- Issue 종료
- `dev`, `stg`, `main` 승급
- WorkOrder 영속 저장

Issue 종료는 `#세션정리`에서만 가능하다. `dev`, `stg`, `main` 승급은 `#태스크승급`에서 다룬다.

## 8. CLI 직접 실행 방법

현재 CLI는 아직 전역 설치하지 않는다. 직접 실행하려면 다음 명령을 사용한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
node --experimental-strip-types src/cli.ts task close
```

블록 입력을 CLI로 넘길 수도 있다.

```powershell
node --experimental-strip-types src/cli.ts task close --block "#태스크정리{
완료내용: Harness #태스크정리 1차 report 구현
검증결과: npm test와 npm run check 통과
제외범위: Issue 종료, dev/stg/main 승급
남은작업: 없음
}"
```

옵션 형식도 지원한다.

```powershell
node --experimental-strip-types src/cli.ts task close `
  --completion "Harness task close report implemented" `
  --verification "npm test and npm run check passed" `
  --out-of-scope "Issue close and branch promotion" `
  --remaining "none"
```

## 9. 실행모드

CLI 직접 실행 기준의 기본 `task close`는 report-only로 동작한다. 채팅 태그 `#태스크정리`는 기본 실행모드이며, 보고만 필요하면 `#태스크정리.보고`를 사용한다. CLI에서 실제 커밋, push, PR 생성, PR 머지를 실행하려면 `--execute`를 명시한다.

실행모드는 다음 조건을 요구한다.

| 옵션 | 필수 여부 | 설명 |
|---|---|---|
| `--execute` | 필수 | 실행모드 진입 |
| `--path` | 필수 | staging할 파일 또는 디렉터리. 여러 번 지정 가능 |
| `--paths` | 선택 | 쉼표로 구분한 staging 대상 목록 |
| `--message` | 필수 | 커밋 메시지 |
| `--pr-title` | 필수 | PR 제목. `[이슈번호]_(이슈내PR번호)_<PR명>` 형식을 사용한다. |
| `--pr-body` | 선택 | PR 본문. 없으면 기본 본문 생성 |
| `--related-issue` | 필수 | PR 본문에 `Related #이슈번호`를 넣기 위한 GitHub Issue 번호 |
| `--base` | 선택 | PR base 브랜치. 기본값 `dev` |
| `--no-merge` | 선택 | PR 생성까지만 하고 머지는 생략. 사용자가 명시한 경우에만 적용 |

예시는 다음과 같다.

```powershell
node --experimental-strip-types src/cli.ts task close `
  --completion "Harness task close execution mode implemented" `
  --verification "npm test and npm run check passed" `
  --out-of-scope "Issue close and branch promotion" `
  --remaining "none" `
  --execute `
  --path "packages/harness-cli/src/flows/task-close.ts" `
  --path "packages/harness-cli/test/task-close.test.ts" `
  --message "feat: add task close execution mode" `
  --pr-title "[064]_(001)_Harness_task_close_execution_mode" `
  --related-issue 64
```

실행모드는 `--path`로 지정한 대상만 stage한다. 무관한 untracked 파일이 섞이지 않도록 자동 `git add -A`는 사용하지 않는다.

Issue 종료는 실행모드에서도 수행하지 않는다. Issue 종료는 `#세션정리`에서만 가능하다.

PR 제목이 `[이슈번호]_(이슈내PR번호)_<PR명>` 형식이 아니거나 `--related-issue`가 없으면 실행모드는 PR 생성 전에 차단된다.

`merge_pr_to_dev` 단계에서 승인, 권한, 리뷰, 충돌 같은 게이트가 막히면 실행 결과는 `blocked`로 남긴다. 이 경우 Harness는 사용자에게 묻지 않고 자동으로 `--no-merge` 처리하거나 PR 생성까지만 완료한 것으로 축소 보고하지 않는다.

## 10. 결과 해석 기준

대표 출력 항목의 의미는 다음과 같다.

| 출력 | 의미 |
|---|---|
| `task close: ready` | 정리 필수 항목이 모두 있다. |
| `task close: blocked` | 정리 필수 항목이 누락되어 있다. |
| `change summary` | 현재 Git 변경 요약이다. |
| `completion summary` | 완료 내용이다. |
| `verification result` | 검증 결과다. |
| `remaining work` | 남은 작업이다. |
| `PR readiness` | 커밋, push, PR 생성, `dev` PR 머지 준비가 되었는지 여부다. |
| `execution plan` | 실행 시 수행할 내부 단계다. 기본값은 `commit_changes -> push_branch -> create_pr -> merge_pr_to_dev`다. |
| `task close execution` | `--execute` 실행 결과다. |
| `Suggested Order` | 빈 입력이나 일부 누락 입력을 기준으로 Harness가 제안하는 정리 주문서 초안이다. |

## 11. 다음 단계

`#태스크정리` report를 확인한 뒤에는 다음 중 하나로 진행한다.

| 상황 | 다음 처리 |
|---|---|
| `ready`이고 남은 작업이 없음 | 커밋, push, PR 생성/`dev` 머지 진행 후 `#태스크승급` |
| `blocked`이고 주문서 초안이 적절함 | 초안에 동의한다고 답하고 진행 |
| `blocked`이고 누락 항목이 있음 | 누락 항목을 채우거나 주문서 초안을 수정해 다시 `#태스크정리` |
| 남은 작업이 있음 | 구현을 계속 진행 |

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness `#태스크정리` 사용방법 문서 작성 |
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Update | `#태스크정리`를 PR 생성/머지 단계로 정리하고 Issue 종료는 `#세션정리` 전용으로 명시 |
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Update | `#태스크정리` 실행모드 옵션과 안전한 path 기반 staging 기준 추가 |
| 2026-07-13 | [#73](https://github.com/jkoogit/jkadh/issues/73) | Codex | GPT-5 | CTO | jk / Codex | Update | `#태스크정리` 실행모드의 PR 제목 명명규칙과 `Related #이슈번호` 연결 조건 보강 |
| 2026-07-15 | [#95](https://github.com/jkoogit/jkadh/issues/95) | Codex | GPT-5 | CTO | jk / Codex | Update | `#태스크정리` 내부 실행 계획에 `merge_pr_to_dev`를 명시하고 승인 차단 시 자동 `--no-merge` 축소 금지 기준 추가 |

[목차로 이동](#목차)
