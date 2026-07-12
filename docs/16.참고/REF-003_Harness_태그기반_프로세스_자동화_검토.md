# REF-003 Harness 태그기반 프로세스 자동화 검토

## 현행 구현 기준

2026-07-13 현재 Harness 태그의 기본 동작은 실행모드다. 보고만 필요하면 태그 뒤에 `.보고` suffix를 붙인다.

| 태그 | 실행 책임 |
|---|---|
| `#세션시작` | 원격 `dev/stg/main` 정합성, 작업트리, 최신 회고, Backlog, 열린 Issue/PR, 다음 작업 후보를 보고한다. 상태 변경은 하지 않는다. |
| `#태스크시작` | 첫 태스크 시작 시 Issue가 없으면 GitHub Issue를 생성하고, 해당 Issue 번호 기준 작업 브랜치를 생성/checkout한다. 기존 Issue가 있으면 그 Issue를 사용한다. |
| `#태스크정리` | 태스크 변경사항을 commit/push하고 PR을 `dev` 대상으로 생성/갱신한 뒤 merge한다. Issue 종료와 `stg/main` 승급은 하지 않는다. |
| `#태스크승급` | `dev`에 merge된 태스크 커밋을 `stg`, `main`으로 fast-forward 승급한다. PR 생성/merge와 Issue 종료는 하지 않는다. |
| `#세션정리` | 세션명, Issue 제목/본문, 회고, 남은 Backlog/Issue/PR을 현행화하고 검증된 Issue만 종료한다. |

Issue는 채팅 세션과 같은 생명주기를 가진다. 첫 `#태스크시작`에서 만들고, 세션 종료 시점의 `#세션정리`에서 내용 현행화와 종료를 처리한다.

| 항목 | 값 |
|---|---|
| 문서 ID | REF-003 |
| 문서 유형 | 참고 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/058-harness-boundary-rules |
| 최종 수정일 | 2026-07-12 |

## 목차

- [1. 목적](#1-목적)
- [2. 적용 범위](#2-적용-범위)
- [3. 기본 방향](#3-기본-방향)
- [4. 태그별 책임 경계](#4-태그별-책임-경계)
- [5. 자동화 수준](#5-자동화-수준)
- [6. 승인 게이트 기준](#6-승인-게이트-기준)
- [7. 태그 실행 경계](#7-태그-실행-경계)
- [8. 구현 후보 구조](#8-구현-후보-구조)
- [9. 관련 문서](#9-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 JKADH Harness에서 `#세션시작`, `#태스크시작`, `#태스크정리`, `#태스크승급`, `#세션정리` 같은 태그 기반 절차를 기능으로 구현할 수 있는지 검토한 내용을 정리한다.

현재 HCP와 정책 문서는 세션/태스크 생명주기 절차를 선언하는 역할에 가깝다. Harness 구현에서는 이 선언을 요청, 처리, 응답을 가진 프로세스 형태로 옮겨 세션과 태스크 운영의 일관성을 높일 수 있다.

## 2. 적용 범위

이 문서는 다음 범위에 적용한다.

- 태그 기반 요청 해석
- Harness 프로세스 자동화 후보
- 태스크 시작, 정리, 승급의 책임 경계
- Issue 종료 권한의 위치
- 자동화 가능 작업과 중단 조건

이 문서는 정책을 직접 변경하지 않는다. 실제 운영 규칙 변경은 시작 가이드, Git 작업관리방안, 사람 승인 경계 정책 등 관련 공식 문서에 별도로 반영해야 한다.

## 3. 기본 방향

HCP, Skill, 에이전트, Harness의 역할은 다음처럼 분리한다.

| 구성 요소 | 역할 |
|---|---|
| HCP | 세션/태스크 생명주기를 제어하는 Harness 태그 명령 묶음이다. |
| Skill | 특정 도구, 산출물, 도메인 작업을 수행하기 위한 Codex 능력 또는 절차 패키지다. |
| 에이전트 | 역할별 판단과 실행을 수행한다. |
| Harness | 태그를 해석하고, 필요한 점검을 실행하고, 결과를 표준 응답으로 정리한다. |

Harness는 완전 자동 실행 엔진보다 Control Plane으로 시작한다. 초기 목표는 사람이 매번 기억해서 수행하던 절차를 코드화하고, 상태 조회와 판단 근거를 일관된 형식으로 남기는 것이다.

기본 처리 흐름은 다음과 같다.

```text
사용자 요청
↓
태그/의도 판별
↓
프로세스 선택
↓
필수 입력 확인
↓
Git/GitHub/문서/Backlog 상태 조회
↓
정책 게이트 확인
↓
표준 응답 생성
↓
다음 액션 실행 또는 보류
```

## 4. 태그별 책임 경계

태그별 책임은 다음처럼 분리한다.

기본 태그는 실행 의도로 해석한다. 실행 없이 상태 확인만 필요하면 태그 뒤에 `.보고` suffix를 붙인다.

| 입력 | 의미 |
|---|---|
| `#태스크시작` | 실행모드 |
| `#태스크시작.보고` | report-only |
| `#태스크정리` | 실행모드 |
| `#태스크정리.보고` | report-only |
| `#태스크승급` | 실행모드 |
| `#태스크승급.보고` | report-only |
| `#세션정리` | 실행모드 |
| `#세션정리.보고` | report-only |

| 태그 | 자동화 가능 범위 | 금지 또는 제외 범위 |
|---|---|---|
| `#세션시작` | 원격 브랜치 확인, 작업트리 확인, 열린 Issue/PR/Backlog 확인, 작업 후보 보고 | Issue 생성/종료, PR 병합, 브랜치 승급 |
| `#태스크시작` | Issue 선택 또는 생성, 작업 브랜치 생성, Work Order 생성, 시작 보고 | PR 병합, 브랜치 승급, Issue 종료 |
| `#태스크정리` | 완료 조건 확인, 테스트/검증 결과 정리, 커밋, push, PR 생성/갱신, PR 병합 | Issue 종료, `dev`/`stg`/`main` 승급 |
| `#태스크승급` | 머지된 태스크 변경사항의 `dev`/`stg`/`main` 승급, 브랜치 정합성 확인 | Issue 종료, PR 병합 |
| `#세션정리` | 완료 태스크 목록 정리, 세션명 현행화, Issue 현행화, 남은 Backlog/Issue/PR 확인, 회고, 미정리 작업 문서 반영, 검증된 Issue 종료, 다음 세션 공유내용 보고 | 검증되지 않은 Issue 종료, 태스크 변경사항 PR 병합/승급 |

핵심 원칙은 다음과 같다.

- Issue 종료는 `#세션정리`에서만 가능하다.
- `#태스크정리`는 PR 생성/갱신/병합까지 수행할 수 있지만 Issue 종료와 브랜치 승급은 수행하지 않는다.
- `#태스크승급`은 머지된 태스크 변경사항의 브랜치 승급만 수행하고 PR 병합과 Issue 종료를 수행하지 않는다.
- `#세션정리`는 검증된 종료 후보 Issue만 종료할 수 있다.

## 5. 자동화 수준

Harness 자동화는 다음 수준으로 나눌 수 있다.

| 수준 | 의미 | 예 |
|---|---|---|
| 자동 점검 | 상태를 읽고 판단 근거를 만든다. | 브랜치 일치 확인, PR merge 여부 확인 |
| 자동 준비 | 실행에 필요한 초안이나 명령을 구성한다. | Issue 본문 생성, PR 본문 생성, 승급 계획 작성 |
| 조건부 자동 실행 | 정해진 태그와 조건이 맞으면 실행한다. | `#태스크시작` 시 Issue와 브랜치 생성 |
| 검증 기반 자동 실행 | 태그와 검증 조건이 모두 충족되면 실행한다. | `#세션정리` 시 verified 종료 후보 Issue 종료 |
| 승인 필요 실행 | 위험도가 높아 사람 확인 뒤 실행한다. | 검증 불충분 상태의 종료, 정책 의미 변경, 범위 밖 작업 |

`explicit_only`보다 `verified_only`가 현재 태그 운영에는 더 적합하다. `#세션정리` 자체가 종료 권한이 있는 태그라면, 매번 별도 승인을 요구하기보다 검증 조건을 통과한 종료 후보만 자동 처리하는 방식이 실용적이다.

## 6. 승인 게이트 기준

승인 게이트는 자동화를 막기 위한 장치가 아니라 태그별 실행 권한을 명확히 하기 위한 장치다.

초기 권한 설정 후보는 다음과 같다.

```yaml
task_start:
  create_issue: true
  create_branch: true
  create_work_order: true
  merge_pr: false
  promote_branches: false
  close_issue: false

task_close:
  verify_completion: true
  create_report: true
  commit_changes: true
  push_branch: true
  create_pr: true
  merge_pr: true
  promote_branches: false
  close_issue: false

task_promote:
  merge_pr: false
  promote_stg_main: true
  close_issue: false

session_close:
  update_session_name: true
  update_issue_title_body: true
  update_retrospective: true
  update_unresolved_work_docs: true
  review_open_issues: true
  verify_close_candidates: true
  close_issue: verified_only
```

`session_close.close_issue: verified_only`는 다음 조건을 모두 만족하는 Issue만 종료할 수 있다는 뜻이다.

- 연결 PR이 병합되었다.
- 필요한 경우 `dev`, `stg`, `main` 반영 상태가 확인되었다.
- 완료 조건과 검증 근거가 확인되었다.
- 현재 세션 또는 종료 후보 목록의 범위 안에 있다.
- 사용자 요청과 충돌하지 않는다.

다음 경우에는 종료하지 않고 보고한다.

- PR이 미병합 상태다.
- 브랜치 정합성이 불명확하다.
- 완료 조건이나 검증 결과가 부족하다.
- 현재 세션 범위 밖 Issue다.
- 태그 의미와 충돌하는 실행이 필요하다.

## 7. 태그 실행 경계

태그 기반 Harness는 태그를 명령어처럼 실행하되, 태그가 허용하지 않는 상태 변경은 수행하지 않는다.

태그 실행은 다음 우선순위를 따른다.

```text
태그 인식
↓
태그 책임 범위 확인
↓
필수 조건 확인
↓
조건 미충족 시 전환 상태 결정
↓
허용된 상태 변경만 수행
↓
결과와 보류 사유 보고
```

태그별 전환 기준은 다음과 같다.

| 태그 | 강제 조건 | 멈추는 조건 | 다음 전환 |
|---|---|---|---|
| `#세션시작` | 원격 브랜치, 작업트리, 최신 회고, Backlog 확인 | 원격 확인 불가, 저장소 기준 불명확 | Stop 또는 수동 확인 요청 |
| `#태스크시작` | Issue 또는 WorkOrder, 범위, 제외 범위, 완료 조건, 검증 방법 확인 | Issue 없이 큰 작업 시작, 범위 불명확 | Issue 생성, Work Order Build, Need Clarification |
| `#태스크정리` | 변경 diff, 검증 결과, 완료 조건, 남은 작업 확인 | 검증 없음, 남은 작업 존재, Issue 종료 시도, 브랜치 승급 시도 | 커밋, push, PR 생성/갱신, PR 병합 또는 Stop |
| `#태스크승급` | 머지된 PR, 승급 대상 커밋, 승급 대상 브랜치, 검증 방법 확인 | PR 미병합, 검증 미완료, 브랜치 불일치, Issue 종료 시도 | 승급 실행 또는 Stop |
| `#세션정리` | 완료 태스크, 세션명, Issue 현행화, 회고, 남은 Backlog/Issue/PR, 다음 세션 시작점 확인 | 종료 후보 검증 불충분, 회고/미정리 문서 불충분 | Issue 종료, 보류 보고, 다음 세션 공유 |

Harness가 에이전트에게 작업을 허용하는 기준은 다음과 같다.

- 작업 식별자가 있다.
- 현재 태그가 해당 상태 변경을 허용한다.
- 작업 범위와 제외 범위가 있다.
- 검증 방법 또는 검증 불가 사유가 있다.
- 결과를 남길 위치가 있다.

반대로 다음 조건에서는 에이전트가 임의로 계속 진행하지 않는다.

- 태그가 허용하지 않는 상태 변경이 필요하다.
- Issue, PR, 브랜치, Backlog 식별자가 충돌한다.
- 현재 작업이 서비스 repo와 플랫폼 repo를 동시에 바꾸려 한다.
- 사용자 요청이 질문/검토인지 실행 명령인지 불명확하다.
- 검증 결과 없이 완료 또는 수용 후보로 보고해야 한다.

이 경계는 에이전트의 판단을 제거하기 위한 것이 아니다. 에이전트가 판단해야 할 지점을 더 명확히 하고, 판단 결과를 Issue, PR, Report, Backlog에 남기도록 강제하기 위한 것이다.

## 8. 구현 후보 구조

초기 구현 후보는 TypeScript CLI와 JSON 설정이다.

```text
packages/harness-cli/
  src/
    commands/
      session-start.ts
      task-start.ts
      task-close.ts
      task-promote.ts
      session-close.ts
    flows/
      session-start-flow.ts
      task-start-flow.ts
      task-close-flow.ts
      task-promote-flow.ts
      session-close-flow.ts
    gates/
      git-gate.ts
      github-gate.ts
      backlog-gate.ts
      approval-gate.ts
    reporters/
      markdown-report.ts
    schemas/
      work-order.ts
      session-report.ts
```

명령 후보는 다음과 같다.

```bash
jkadh session start
jkadh task start
jkadh task close
jkadh task promote
jkadh session close
```

초기 구현은 상태 조회와 표준 보고 생성부터 시작한다. 이후 태그별 책임 경계와 검증 조건이 코드로 고정된 범위부터 실행모드를 단계적으로 추가한다. 현재 기준에서 `#태스크정리`는 명시적 `--execute`와 path 기반 staging 조건에서 커밋, push, PR 생성, PR 머지 실행모드를 가질 수 있다. 브랜치 승급은 `#태스크승급`, Issue 종료는 `#세션정리`에서만 다룬다.

## 9. 관련 문서

- [STA-002 AI 시작가이드](../00.시작/STA-002_AI_시작가이드.md)
- [DSN-001 Harness 운영 모델](../05.설계/DSN-001_Harness_운영_모델.md)
- [DSN-003 AI개발플랫폼 멀티레포 Harness 운영구조](../05.설계/DSN-003_AI개발플랫폼_멀티레포_Harness_운영구조.md)
- [POL-003 Git 작업관리방안](../03.정책/POL-003_Git_작업관리방안.md)
- [POL-005 사람 승인 경계 정책](../03.정책/POL-005_사람_승인_경계_정책.md)
- [REF-002 AI개발플랫폼 Harness 설계방향 논의정리](./REF-002_AI개발플랫폼_Harness_설계방향_논의정리.md)

[목차로 이동](#목차)

---

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-11 | - | Codex | GPT-5 | CTO | jk / Codex | Create | Harness 태그 기반 프로세스 자동화와 태그별 책임 경계 검토 내용 정리 |
| 2026-07-12 | [#58](https://github.com/jkoogit/jkadh/issues/58) | Codex | GPT-5 | CTO | jk / Codex | Revise | Issue 기준으로 작업 브랜치와 작업 이력 보정 |
| 2026-07-12 | [#58](https://github.com/jkoogit/jkadh/issues/58) | Codex | GPT-5 | CTO | jk / Codex | Revise | 태그 실행 시 Harness가 강제하거나 멈춰야 하는 경계 보강 |
