# REF-005 Harness 태스크시작 사용방법

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
- [9. 결과 해석 기준](#9-결과-해석-기준)
- [10. 다음 단계](#10-다음-단계)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 채팅 세션에서 `#태스크시작` 태그를 사용할 때 Harness가 확인하는 입력 항목과 사용 방법을 정리한다.

`#태스크시작`은 작업 실행 전에 작업 식별자, 범위, 제외 범위, 완료 조건, 검증 방법을 명확히 하는 태그다. 현재 Harness CLI의 `task start` report는 준비 상태를 확인하고 추천 브랜치명을 제안하지만, 자체적으로 Issue 생성이나 브랜치 생성을 수행하지 않는다.

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

단독으로 입력하면 Harness는 현재 입력이 부족한 항목을 report로 표시한다. 작업을 바로 시작할 수 있도록 하려면 블록 형식을 권장한다.

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
| 준비 상태 | 필수 항목이 모두 있으면 `ready`, 누락이 있으면 `blocked` |
| 추천 브랜치명 | Issue 번호와 작업범위를 기준으로 제안 |
| 쓰기 작업 | `create_issue`, `create_branch`는 report에서 차단 항목으로 표시 |

## 7. Harness가 하지 않는 일

현재 `#태스크시작` report 자체는 다음 작업을 하지 않는다.

- Issue 생성
- 작업 브랜치 생성
- 파일 수정
- 커밋
- push
- PR 생성
- PR 병합
- `dev`, `stg`, `main` 승급

구현 작업은 `#태스크시작` report가 ready인 것을 확인한 뒤 Codex 작업으로 진행한다. 커밋, push, PR, 승급은 별도 태그 또는 명시 주문이 있을 때만 수행한다.

## 8. CLI 직접 실행 방법

현재 CLI는 아직 전역 설치하지 않는다. 직접 실행하려면 다음 명령을 사용한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
node --experimental-strip-types src/cli.ts task start
```

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

## 9. 결과 해석 기준

대표 출력 항목의 의미는 다음과 같다.

| 출력 | 의미 |
|---|---|
| `task start: ready` | 필수 항목이 모두 있어 작업 시작 기준을 충족한다. |
| `task start: blocked` | 필수 항목이 누락되어 작업 경계가 확정되지 않았다. |
| `task identifier` | 연결된 Issue 또는 WorkOrder다. |
| `scope` | 이번 태스크에서 수행할 작업이다. |
| `out of scope` | 이번 태스크에서 제외할 작업이다. |
| `completion` | 태스크 완료 판단 기준이다. |
| `verification` | 완료 확인 방법이다. |
| `recommended branch` | Harness가 제안하는 작업 브랜치명이다. |
| `write actions` | 현재 report 단계에서 차단되는 상태 변경 작업이다. |

## 10. 다음 단계

`#태스크시작` report를 확인한 뒤에는 다음 중 하나로 진행한다.

| 상황 | 다음 처리 |
|---|---|
| `ready`이고 작업 범위가 맞음 | 구현 작업 진행 |
| `blocked`이고 누락 항목이 있음 | 누락 항목을 채워 다시 `#태스크시작` |
| 범위가 너무 큼 | `작업범위`, `제외범위`, `완료조건`을 좁혀 재주문 |
| 구현 완료 | `#태스크정리` |
| PR 병합 또는 브랜치 승급 필요 | `#태스크승급` |

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness `#태스크시작` 사용방법 문서 작성 |

[목차로 이동](#목차)
