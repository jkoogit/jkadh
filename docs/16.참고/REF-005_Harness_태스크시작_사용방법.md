# REF-005 Harness 태스크시작 사용방법

## 현행 구현 기준

2026-07-13 현재 채팅 태그 `#태스크시작`의 기본 동작은 실행모드다. 보고만 필요하면 `#태스크시작.보고`를 사용한다.

실행모드는 다음 순서로 동작한다.

1. Issue 번호가 있으면 기존 Issue를 사용한다.
2. Issue 번호가 없고 WorkOrder 또는 작업 범위가 있으면 GitHub Issue를 생성한다.
3. Issue 번호와 작업 범위를 기준으로 작업 브랜치를 생성하고 checkout한다.

Issue는 채팅 세션과 같은 생명주기를 가진다. 첫 태스크 시작에서 만들고, 세션 종료 시점의 `#세션정리`에서 제목/본문 현행화와 종료를 처리한다.

| 항목 | 값 |
|---|---|
| 문서 ID | REF-005 |
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

본 문서는 채팅 세션에서 `#태스크시작` 태그를 사용할 때 Harness가 확인하는 입력 항목과 사용 방법을 정리한다.

`#태스크시작`은 작업 실행 전에 작업 식별자, 범위, 제외 범위, 완료 조건, 검증 방법을 명확히 하는 태그다. 현재 Harness CLI의 `task start` report는 준비 상태를 확인하고 추천 브랜치명을 제안한다. 실행모드에서는 Issue가 없으면 GitHub Issue를 생성하고, 해당 Issue 번호 기준 작업 브랜치를 생성/checkout한다.

`#태스크시작`은 구현 완료를 뜻하지 않는다. 실행모드가 완료되면 작업은 준비단계 완료 상태이며, 실제 구현은 `#태스크처리`에서 활성 HCP task와 등록 브랜치를 검증한 뒤 수행한다. 구현 결과 커밋, PR 생성, 병합, 승급은 `#태스크정리`와 `#태스크승급`에서만 다룬다.

`#태스크처리` 중 정책 보완이 반복되면 Harness는 기본 최대 3회의 remediation loop를 사용한다. 동일한 차단 결과가 반복되거나 사용자 판단 또는 범위 변경이 필요하면 즉시 중단하며, 회차 결과는 HCP `processEvidence`에 기록한다.

## 2. 사용할 때

다음 상황에서 사용한다.

- `#세션시작` report 이후 실제 작업 단위를 확정할 때
- Issue 또는 WorkOrder에 연결할 작업을 시작할 때
- 작업 범위와 제외 범위를 분리해 실행 경계를 정할 때
- 완료 조건과 검증 방법을 먼저 합의하고 구현에 들어갈 때
- 태그 기반 작업 흐름에서 이후 `#태스크정리`, `#태스크승급`으로 이어질 기준을 남길 때

## 3. 채팅 주문 방법

기본 주문은 다음과 같다.

```text
#태스크시작
```

기본 `#태스크시작`은 실행 의도로 해석한다. 단독으로 입력하면 Harness는 현재 입력이 부족한 항목을 확인하고, 동의 후 진행할 수 있는 주문서 초안을 함께 출력한다. 실행 없이 보고만 필요하면 `.보고` suffix를 사용한다.

```text
#태스크시작.보고
```

현재 기본 작업에서 잠시 벗어난 별도 작업을 먼저 처리한 뒤 원래 작업으로 돌아가려는 자연어 요청은 바로 실행하지 않는다. Harness는 의도를 해석해 정규 `#태스크시작{...}` 주문서 초안을 제안한다.

```text
사용자: 번외 #태스크시작

Harness 제안:
#태스크시작{
작업지시: codex_blg_013_002
작업범위: 현재 기본 작업과 구분되는 번외 태스크를 시작한다
제외범위: 기존 기본 태스크 완료나 승급은 제외한다
완료조건: 번외 태스크가 Issue/HCP 태스크에서 구분되어 추적된다
검증방법: npm test와 CLI report로 확인한다
}
```

사용자가 제안된 주문서 또는 동등한 태그 시작 요청으로 다시 지시하면 실행한다.

출력된 주문서 초안이 맞으면 사용자는 동의하거나 필요한 항목만 수정해서 다시 요청한다. 작업을 바로 시작할 수 있도록 하려면 블록 형식을 권장한다.

```text
#태스크시작{
이슈: #64
작업범위: Harness CLI task start 별칭 입력을 지원한다
제외범위: PR 병합과 브랜치 승급은 제외한다
완료조건: 한글/영문 별칭 입력이 파싱되고 준비 상태가 ready로 표시된다
검증방법: npm test와 npm run check를 통과한다
}
```

Issue 대신 WorkOrder를 연결할 수 있다.

```text
#태스크시작{
작업지시: WO-HARNESS-001
작업범위: session start report 항목을 보강한다
제외범위: GitHub 쓰기 작업은 제외한다
완료조건: report에 필요한 항목이 모두 표시된다
검증방법: CLI dry-run과 테스트로 확인한다
}
```

짧은 별칭도 사용할 수 있다.

```text
#태스크시작{
i: #64
s: task start alias support
o: merge and promotion
c: aliases are parsed
v: npm test
}
```

## 4. 입력 항목

`#태스크시작`이 ready가 되려면 다음 항목이 필요하다.

| 항목 | 필수 여부 | 설명 |
|---|---|---|
| 이슈 또는 작업지시 | 필수 | 작업을 연결할 GitHub Issue 번호 또는 WorkOrder ID |
| 작업범위 | 필수 | 이번 태스크에서 무엇을 할지 |
| 제외범위 | 필수 | 이번 태스크에서 무엇을 하지 않을지 |
| 완료조건 | 필수 | 어떤 상태가 되면 태스크를 완료로 볼지 |
| 검증방법 | 필수 | 완료 조건을 어떻게 확인할지 |

`이슈`는 `#64` 또는 `64` 형식 모두 사용할 수 있다. `이슈`와 `작업지시` 중 하나 이상은 있어야 한다.

## 5. 지원 별칭

현재 지원하는 별칭은 다음과 같다.

| 의미 | 한글 단어 | 한글 축약 | 영문 풀워드 | 영문 축약 |
|---|---|---|---|---|
| Issue 번호 | `이슈` | - | `issue` | `i` |
| WorkOrder ID | `작업지시` | - | `workOrder` | `w` |
| 작업범위 | `작업범위` | - | `scope` | `s` |
| 제외범위 | `제외범위` | - | `outOfScope` | `o` |
| 완료조건 | `완료조건` | - | `completion` | `c` |
| 검증방법 | `검증방법` | - | `verification` | `v` |

한글 축약 별칭은 아직 확정하지 않았다. 의미가 불명확한 축약어를 먼저 늘리기보다 실제 사용 중 반복되는 표현을 보고 추가한다.

키와 값은 `:` 또는 `=`로 구분할 수 있다.

```text
이슈: #64
이슈 = #64
scope: task start support
s = task start support
```

## 6. Harness가 확인하는 항목

현재 Harness CLI는 `#태스크시작`에서 다음 항목을 확인한다.

| 항목 | 현재 처리 |
|---|---|
| 작업 식별자 | Issue 번호 또는 WorkOrder ID 존재 여부 확인 |
| 작업범위 | 입력 여부 확인 |
| 제외범위 | 입력 여부 확인 |
| 완료조건 | 입력 여부 확인 |
| 검증방법 | 입력 여부 확인 |
| 준비 상태 | 필수 항목이 모두 있으면 `ready`, 누락이 있으면 `blocked`와 주문서 초안 출력 |
| 추천 브랜치명 | Issue 번호와 작업범위를 기준으로 제안 |
| 쓰기 작업 | 기본 report에서는 `create_issue`, `create_branch` 차단 표시 |
| 작업 단계 | 준비단계, 구현 대기, 다음 단계 표시 |

## 7. Harness가 하지 않는 일

`#태스크시작.보고` 또는 CLI report-only 실행은 다음 작업을 하지 않는다.

- Issue 생성
- 작업 브랜치 생성
- 파일 수정
- 커밋
- push
- PR 생성
- PR 병합
- `dev`, `stg`, `main` 승급

구현 작업은 `#태스크시작` 실행이 ready인 것을 확인한 뒤 Codex 작업으로 진행한다. 커밋, push, PR, 승급은 별도 태그 또는 명시 주문이 있을 때만 수행한다.

Issue 생성, 작업 브랜치 생성과 checkout은 `--execute` 실행모드에서 수행한다. 기존 Issue가 있으면 Issue 생성 단계는 건너뛴다.

## 8. CLI 직접 실행 방법

현재 CLI는 아직 전역 설치하지 않는다. 직접 실행하려면 다음 명령을 사용한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
node --experimental-strip-types src/cli.ts task start
```

단독 실행 결과에는 `Suggested Order` 섹션이 포함된다.

블록 입력을 CLI로 넘길 수도 있다.

```powershell
node --experimental-strip-types src/cli.ts task start --block "#태스크시작{
이슈: #64
작업범위: Harness CLI task start 별칭 입력을 지원한다
제외범위: PR 병합과 브랜치 승급은 제외한다
완료조건: 한글/영문 별칭 입력이 파싱된다
검증방법: npm test
}"
```

옵션 형식도 지원한다.

```powershell
node --experimental-strip-types src/cli.ts task start `
  --issue 64 `
  --scope "Harness CLI task start alias support" `
  --out-of-scope "PR merge and promotion" `
  --completion "Aliases are parsed" `
  --verification "npm test and npm run check"
```

## 9. 실행모드

CLI 직접 실행 기준의 기본 `task start`는 report-only로 동작한다. 채팅 태그 `#태스크시작`은 기본 실행모드이며, 보고만 필요하면 `#태스크시작.보고`를 사용한다. CLI에서 Issue 생성과 작업 브랜치 생성/checkout을 실행하려면 `--execute`를 명시한다.

실행모드는 다음 조건을 요구한다.

| 옵션 | 필수 여부 | 설명 |
|---|---|---|
| `--execute` | 필수 | 실행모드 진입 |
| `--branch` | 선택 | 생성/checkout할 브랜치명. 없으면 추천 브랜치명 사용 |
| `--issue-title` | 선택 | Issue 생성 시 사용할 제목. 없으면 WorkOrder 또는 작업범위를 사용 |
| `--start-point` | 선택 | 브랜치를 시작할 기준. 기본값 `origin/main` |

예시는 다음과 같다.

```powershell
node --experimental-strip-types src/cli.ts task start `
  --issue 64 `
  --scope "Harness task start execution mode" `
  --out-of-scope "Issue creation, PR merge, branch promotion, issue close" `
  --completion "Branch is created and checked out" `
  --verification "npm test and npm run check" `
  --execute `
  --issue-title "Harness task start execution mode" `
  --branch "task_codex/064-harness-task-start-execute" `
  --start-point "origin/main"
```

실행모드는 다음 작업만 수행한다.

- `gh issue create --title <title> --body <body>`: Issue 번호가 없을 때만 수행
- `git switch -c <branch> <start-point>`

실행모드는 다음 작업을 수행하지 않는다.

- WorkOrder 영속 저장
- PR 생성 또는 머지
- `dev`, `stg`, `main` 승급
- Issue 종료

## 10. 결과 해석 기준

대표 출력 항목의 의미는 다음과 같다.

| 출력 | 의미 |
|---|---|
| `task start: ready` | 필수 항목이 모두 있어 작업 시작 기준을 충족한다. |
| `task start: blocked` | 필수 항목이 누락되어 작업 경계가 확정되지 않았다. |
| `Suggested Order` | 빈 입력이나 일부 누락 입력을 기준으로 Harness가 제안하는 주문서 초안이다. |
| `task identifier` | 연결된 Issue 또는 WorkOrder다. |
| `scope` | 이번 태스크에서 수행할 작업이다. |
| `out of scope` | 이번 태스크에서 제외할 작업이다. |
| `completion` | 태스크 완료 판단 기준이다. |
| `verification` | 완료 확인 방법이다. |
| `recommended branch` | Harness가 제안하는 작업 브랜치명이다. |
| `write actions` | 현재 report 단계에서 차단되는 상태 변경 작업이다. |
| `task start execution` | `--execute` 실행 결과다. |
| `작업 현황` | 준비단계 완료, 구현 대기, 다음 단계처럼 현재 작업 단계와 후속 행동을 나타낸다. |

## 11. 다음 단계

`#태스크시작` report를 확인한 뒤에는 다음 중 하나로 진행한다.

| 상황 | 다음 처리 |
|---|---|
| `ready`이고 작업 범위가 맞음 | `#태스크시작` 실행으로 Issue/브랜치/HCP 태스크를 준비 |
| 준비단계 완료 | `#태스크처리`로 활성 세션·task·등록 브랜치·작업 범위를 확인한 뒤 구현 진행 |
| `blocked`이고 주문서 초안이 적절함 | 초안에 동의한다고 답하고 진행 |
| `blocked`이고 누락 항목이 있음 | 누락 항목을 채우거나 주문서 초안을 수정해 다시 `#태스크시작` |
| 범위가 너무 큼 | `작업범위`, `제외범위`, `완료조건`을 좁혀 재주문 |
| 구현 완료 | `#태스크정리` |
| PR 병합 또는 브랜치 승급 필요 | `#태스크승급` |

평문 자연어로 “정리하고 승급하자”, “바로 진행하자”처럼 요청하면 실행모드로 보지 않는다. `#태스크정리`, `#태스크승급` 같은 명시 태그가 없으면 커밋, PR, 병합, 승급을 실행하기 전에 확인한다.

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness `#태스크시작` 사용방법 문서 작성 |
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Update | 빈 `#태스크시작` 입력 시 주문서 초안 출력 흐름 반영 |
| 2026-07-13 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Update | `#태스크시작` 실행모드와 브랜치 생성/checkout 기준 추가 |
| 2026-07-14 | [#84](https://github.com/jkoogit/jkadh/issues/84) | Codex | GPT-5 | CTO | jk / Codex | Update | `#태스크시작` 결과의 작업 단계, 구현 대기 상태, 자연어 실행 게이트 기준 보강 |
| 2026-07-21 | [#122](https://github.com/jkoogit/jkadh/issues/122) | Codex | GPT-5 | CTO | jk / Codex | Update | `#태스크처리` 선행조건 검증과 구현 단계 실행 경계 반영 |

[목차로 이동](#목차)
