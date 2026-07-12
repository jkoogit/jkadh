# POL-003 Git 작업관리방안

| 항목 | 값 |
|---|---|
| 문서 ID | POL-003 |
| 문서 유형 | 정책 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | CTO 에이전트 |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/058-harness-policy-gates |
| 최종 수정일 | 2026-07-12 |

## 목차

- [1. 목적](#1-목적)
- [2. 적용 범위](#2-적용-범위)
- [3. 기본 브랜치](#3-기본-브랜치)
- [4. 작업 브랜치 규칙](#4-작업-브랜치-규칙)
- [5. Issue와 Branch 연결](#5-issue와-branch-연결)
- [6. Commit 규칙](#6-commit-규칙)
- [7. Pull Request 규칙](#7-pull-request-규칙)
- [8. 태스크 정리 전 확인](#8-태스크-정리-전-확인)
- [9. Review 반영 규칙](#9-review-반영-규칙)
- [10. 승급 규칙](#10-승급-규칙)
- [11. 작업 종료 후 다음 작업](#11-작업-종료-후-다음-작업)
- [12. 논스톱 진행 기준](#12-논스톱-진행-기준)
- [13. Git 상태 변경 실행 게이트](#13-git-상태-변경-실행-게이트)
- [14. 관련 문서](#14-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 JKADH 저장소의 Branch, Commit, Pull Request, Review, 승급 흐름을 정의한다.

Git 작업관리방안은 작업 단위를 작게 유지하고, 검토 가능한 변경만 `dev`, `stg`, `main`으로 승급하기 위한 기준이다.

## 2. 적용 범위

이 문서는 JKADH 저장소의 모든 Git 작업에 적용한다.

다음 항목은 본 문서의 적용 대상이다.

- 원격 브랜치 확인
- 작업 브랜치 생성
- Commit 작성
- Pull Request 생성
- Review 반영
- `dev`, `stg`, `main` 승급
- 작업 종료 후 다음 작업 브랜치 생성

## 3. 기본 브랜치

JKADH는 다음 기본 브랜치를 사용한다.

| 브랜치 | 역할 |
|---|---|
| `main` | 최종 승급 브랜치 |
| `stg` | 승급 검증 브랜치 |
| `dev` | 작업 PR 병합 대상 브랜치 |
| `task_*` | 작업 단위 브랜치 |

세션을 시작할 때 원격 `dev`, `stg`, `main`이 같은 커밋인지 확인한다.

Codex 작업 브랜치는 원격 `main`을 현행화한 뒤 `main`에서 시작한다.

## 4. 작업 브랜치 규칙

작업 브랜치는 다음 형식을 사용한다.

```text
task_{agent}/{seq}-{scope}
```

예:

```text
task_codex/001-docs-governance-foundation
task_codex/002-agent-operation-rules
task_claude/003-design-service-flow
```

규칙은 다음과 같다.

- `task_` prefix는 작업 브랜치임을 나타낸다.
- `{agent}`는 작업 도구 또는 주 담당 에이전트를 나타낸다.
- `{seq}`는 작업 순서를 나타내는 3자리 숫자이다.
- `{scope}`는 작업 내용을 짧은 영문 kebab-case로 작성한다.
- 하나의 작업 브랜치는 하나의 Issue에 대응한다. PR은 같은 Issue 안에서 검토 가능한 정리 단위로 여러 개 연결할 수 있다.
- 세션명 번호, Issue 번호 또는 작업 순서, 브랜치명의 `{seq}`가 어긋나면 작업 시작 전에 보정한다.
- 동시작업 충돌이 예상되면 GitHub Issue 번호를 기준 식별자로 우선 사용한다.
- 같은 Issue 안에서 여러 에이전트가 동시에 작업하면 `{scope}`를 다르게 잡고, PR 본문에 같은 Issue의 병렬 작업임을 명시한다.

## 5. Issue와 Branch 연결

작업은 Issue에서 시작한다.

```text
Issue
↓
task branch
↓
commit
↓
PR to dev
↓
review
↓
merge to dev
```

원칙은 다음과 같다.

- Issue 없이 큰 작업을 시작하지 않는다.
- Issue 본문에는 작업 범위, 제외 범위, 완료 조건을 둔다.
- 작업 브랜치명은 Issue 범위를 반영한다.
- PR 본문에는 기본적으로 `Related #이슈번호`를 포함한다.
- 완료 조건이 모두 충족되어 해당 PR 머지만으로 Issue를 닫아도 되는 경우에만 `Closes #이슈번호` 같은 자동 종료 키워드를 사용한다.
- 작업 중 나온 새 아이디어는 Backlog로 분리한다.
- Issue가 없는 상태에서 PR을 먼저 만들지 않는다.
- 결론이 이미 확정된 사안이라도 바로 실행하지 않고 처리 경로를 먼저 확인한다.

작업 시작 전 Issue가 없으면 다음 순서로 진행한다.

```text
작업 범위 초안
↓
Issue 등록
↓
Issue 번호 기준으로 세션명과 브랜치명 보정
↓
task branch 생성
```

## 6. Commit 규칙

Commit은 검토 가능한 단위로 작성한다.

Commit 메시지는 다음 형식을 기본으로 사용한다.

```text
{type}: {summary} (#{issue})
```

예:

```text
docs: establish document governance foundation (#1)
docs: define agent operation rules (#2)
```

`type`은 다음 값을 우선 사용한다.

| type | 의미 |
|---|---|
| `docs` | 문서 변경 |
| `feat` | 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 구조 개선 |
| `test` | 테스트 추가 또는 수정 |
| `chore` | 기타 작업 |

## 7. Pull Request 규칙

PR은 `dev`를 대상으로 생성한다.

PR 제목은 다음 형식을 사용한다.

```text
[이슈번호]_(이슈내PR번호)_<PR명>
```

예:

```text
[001]_(001)_문서_거버넌스_기반_구축
[002]_(001)_에이전트_운영규칙_및_태스크_흐름_정리
[006]_(001)_세션_시작_및_태스크_정리_절차_보강
```

규칙은 다음과 같다.

- `[이슈번호]`는 연결된 작업 Issue의 전용 순번을 사용한다.
- `(이슈내PR번호)`는 해당 Issue에 연결된 PR만 따로 센 3자리 순번을 사용한다.
- 하나의 Issue에 PR이 하나면 `(001)`을 사용한다.
- 같은 Issue에서 후속 PR이 추가되면 `(002)`, `(003)`처럼 증가시킨다.
- PR 생성 전에는 이슈내PR번호를 확정할 수 없으므로, PR 생성 직후 해당 Issue에 연결된 기존 PR을 기준으로 순번을 확정하고 제목을 보정한다.
- PR 제목을 보정하기 전에 연결 Issue 제목이 규칙을 충족하는지 먼저 확인한다. 연결 Issue 제목이 미확정이면 Issue 제목을 먼저 보정한 뒤 PR 제목을 확정한다.
- PR 본문에는 기본적으로 `Related #이슈번호`를 포함한다.
- `Related #이슈번호`의 `#이슈번호`는 GitHub Issue URL 번호를 사용한다.
- `Closes`, `Fixes`, `Resolves` 같은 자동 종료 키워드는 Issue 종료 조건이 명확할 때만 사용한다.
- Issue 없이 생성된 과거 PR은 제목 정리 시 `[000]`을 사용할 수 있지만, 신규 PR에는 사용하지 않는다.

PR에는 다음 내용을 포함한다.

- 작업 목적
- 변경 요약
- 검증 결과
- 관련 Issue
- 후속 Backlog

PR은 검토 가능한 상태가 되면 Ready 상태로 전환한다.

검토 결과 수정사항이 없으면 `dev`에 머지한다.

## 8. 태스크 정리 전 확인

`#태스크정리`를 수행하기 전에 다음 항목을 확인한다.

| 확인 항목 | 기준 |
|---|---|
| 세션명 번호 | 문서, Issue, PR에서 같은 작업 범위를 가리키는가? |
| 세션명 현행화 | 세션 마무리 보고, 회고, 후속 작업의 세션명이 현재 Issue와 브랜치 범위를 반영하는가? |
| 브랜치명 | `task_{agent}/{seq}-{scope}` 형식을 따르는가? |
| Issue | 관련 Issue가 존재하는가? |
| PR 연결 | PR 본문에 `Related #이슈번호` 또는 명시 링크가 있는가? |
| 순서 | Issue 없이 PR을 먼저 만들지 않았는가? |
| 문서 탈고 | 공식 문서 변경이 있다면 문맥, 충돌, 중복, 쉬운 표현을 점검했는가? |
| 번외/백로그 판단 | 진행 중 끼어든 주제를 현재 Issue, `[번외]`, Backlog, 새 Issue 후보 중 하나로 분류했는가? |
| 후속 항목 | 현재 범위 밖 논점이 Backlog로 분리되었는가? |
| 확정 사안 처리 | 결론이 명확한 사안도 현재 PR 포함, 별도 PR, Backlog, 새 Issue 후보 중 처리 경로를 확인했는가? |
| 채번 충돌 | Backlog ID, PR 순번, 브랜치명, 세션명이 같은 Issue 안에서 충돌하지 않는가? |

확인 항목 중 하나라도 맞지 않으면 PR 생성 또는 머지 전에 먼저 보정한다.

`#태스크정리` 결과는 `완료` 또는 `보류`로 보고한다. `완료`는 검증 결과가 있고, 세션명 현행화 결과가 보고되었고, PR 생성 또는 현행화가 끝났으며 `dev` 머지까지 완료했거나 머지가 불필요한 사유를 명시한 상태다. `보류`는 PR은 생성 또는 현행화했지만 세션명 현행화, Ready 전환, 리뷰, 검증, 충돌, 권한, 승인 같은 게이트 때문에 `dev` 머지를 진행하지 못한 상태다. 보류로 보고할 때는 남은 게이트와 다음 필요 조치를 함께 남긴다.

공식 문서 작업이 포함된 경우 `#태스크정리` 전에 탈고 작업을 수행한다. 탈고는 새 내용을 더 추가하기 위한 단계가 아니라, 이미 반영한 문서가 읽기 쉽고 다른 문서와 충돌하지 않는지 확인하는 품질 게이트다.

문서 탈고에서는 다음 항목을 확인한다.

- 한 문서 안에서 주제가 자연스럽게 이어지는가?
- 기존 정책, 설계, 운영 문서와 충돌하지 않는가?
- 같은 의미를 반복하는 문장이나 표가 불필요하게 많지 않은가?
- 세부 기준 문서에 맡길 내용을 로드맵이나 상위 문서가 과하게 반복하지 않는가?
- 어려운 표현을 더 쉬운 표현으로 바꿀 수 있는가?
- 문서 Header, 관련 문서, 작업 이력이 현재 작업과 맞는가?

탈고 결과는 PR 본문 또는 Report의 검증 결과에 간단히 남긴다.

현재 태스크와 맞지 않는 주제가 작업 중 들어온 경우 `#태스크정리`에서 다음을 제안한다.

- 현재 Issue 목적과 직접 연결되면 현재 Issue에 반영한다.
- 연결은 있지만 주 완료 조건이 아니면 `[번외]`로 표시한다.
- 작업량이 크거나 독립 판단이 필요하면 Backlog로 분리한다.
- 곧바로 별도 업무 단위로 진행할 가치가 크면 새 Issue 후보로 제안한다.

Backlog 분리는 진행 중인 태스크에서 범위 밖 주제가 들어온 경우에만 사용한다. 진행 중인 태스크가 없으면 새 주제를 Backlog로 만들지 않고 `#태스크시작`을 먼저 수행한다.

이 판단은 PR 본문 또는 Report에 짧게 남겨 다음 세션에서 맥락이 끊기지 않게 한다.

Issue 기반 작업 중 새 Backlog를 만들 때는 `BLG-{GitHub Issue 번호}-{Issue 안 Backlog 순번}` 형식을 우선 사용한다. 기존 `BLG-###` 형식은 소급 변경하지 않으며, 현재 작업에서 직접 수정하지 않는 과거 링크는 유지한다.

`#태스크시작` 없이 작업이 먼저 진행된 경우 `#태스크정리`에서 다음 항목을 사후 보정한다.

- 관련 Issue 존재 여부
- 세션명과 브랜치명
- 작업 범위와 제외 범위
- PR 연결과 이슈내PR번호
- 현재 Issue 반영, `[번외]`, Backlog, 새 Issue 후보 분류

사후 보정은 누락을 회복하기 위한 보조장치다. 큰 작업을 Issue 없이 계속 진행하기 위한 예외로 사용하지 않는다.

사용자 주문과 표준 절차가 충돌하거나 해석이 갈리는 경우에는 실행 전에 확인한다. 특히 PR Ready 전환, `dev` 머지, `stg` 또는 `main` 승급처럼 저장소 상태를 바꾸는 단계는 명시 태그나 명확한 승인 없이 자연어 주문만으로 실행하지 않는다.

단순 주문을 작업으로 처리하려는 순간 관련 Issue, 작업 브랜치, PR, 승급 조건이 없거나 맞지 않으면 즉시 실행하지 않고 절차 상태와 진행 승인을 먼저 확인한다.

## 9. Review 반영 규칙

Review는 작업 품질을 높이기 위한 통제 지점이다.

원칙은 다음과 같다.

- 리뷰 의견은 결함, 누락, 충돌, 검증 공백을 우선한다.
- 수정이 필요한 경우 같은 작업 브랜치에서 반영한다.
- 수정 후 검증 결과를 다시 남긴다.
- 현재 Issue 범위를 벗어난 의견은 Backlog로 분리한다.

## 10. 승급 규칙

PR이 `dev`에 머지된 뒤 필요한 경우 다음 순서로 승급한다.

```text
dev
↓
stg
↓
main
```

승급은 fast-forward를 기본으로 한다.

승급 후에는 원격 `dev`, `stg`, `main`이 같은 커밋과 같은 tree를 가리키는지 확인한다.

승급은 Issue 종료 조건이 아니다. `#태스크승급`은 PR 머지와 `dev/stg/main` 반영 상태를 정리하는 절차이며, Issue 종료는 수행하지 않는다.

Issue 종료는 완료 조건 충족, 후속 Backlog 분리, 남은 범위 없음, 관련 PR 반영 상태가 확인된 뒤 `#세션정리`에서만 수행한다. `#태스크정리`는 Issue 종료 후보 판정까지만 수행한다.

승급 태그는 편의성이 높은 자동승급을 기본으로 한다.

| 표준 태그 | 허용 별칭 | 의미 |
|---|---|---|
| `#태스크승급` | `#테스크승급`, `#task승급`, `#taskpromote` | `dev -> stg -> main` 자동 승급 |
| `#태스크승급-확인` | `#테스크승급-확인`, `#task승급-check`, `#taskpromote-check` | `stg` 승급 후 `main` 승급 전 확인 |
| `#태스크승급-검증` | `#테스크승급-검증`, `#task승급-stg`, `#taskpromote-stg` | `stg`까지만 승급하고 검증 피드백을 기다림 |

기본 태그인 `#태스크승급`은 다음 흐름을 따른다.

```text
dev
↓
stg
↓
기본 검증
↓
main
↓
dev / stg / main 일치 확인
```

`#태스크승급-확인`은 `stg` 반영과 기본 검증 후 `main` 승급 전 사용자 확인을 받는다.

`#태스크승급-검증`은 `stg` 반영 후 중단하고, 검증 피드백을 기다린다. 검증에 실패하면 실패 내용을 Issue 또는 Backlog로 기록하고 `main` 승급은 진행하지 않는다.

검증 실패 시 흐름은 다음과 같다.

```text
stg 검증 실패
↓
실패 내용 기록
↓
Issue 또는 Backlog 생성
↓
main 승급 중단
↓
필요 시 새 task 브랜치로 수정
```

## 11. 작업 종료 후 다음 작업

PR이 `dev`에 머지되면 해당 `task_` 브랜치의 역할은 종료된다.

이어서 작업을 계속할 경우 같은 브랜치에서 이어가지 않는다. 같은 Issue 안에서 후속 PR이 필요하면 최신 기준 브랜치에서 같은 Issue 범위를 반영한 새 `task_` 브랜치를 만든다.

다음 절차를 따른다.

```text
PR merge to dev
↓
필요 시 dev → stg → main 승급
↓
원격 dev/stg/main 상태 확인
↓
새 Issue 또는 Ready Backlog 선택
↓
새 task branch 생성
```

## 12. 논스톱 진행 기준

`#태스크시작`, `#태스크정리`, `#태스크승급`, `#세션정리`는 서로 다른 통제 지점을 가진다. 기본 운영에서는 각 단계 사이에 확인 지점을 둔다.

사용자가 네 단계의 연속 실행과 중간 확인 생략을 명시한 경우에만 논스톱으로 진행할 수 있다. 이때도 다음 조건이 발생하면 즉시 중단하고 확인한다.

- 작업 범위가 바뀌거나 새 판단 지점이 생긴 경우
- 검증 실패, 충돌, 권한 문제, 원격 브랜치 불일치가 발생한 경우
- Issue 종료, PR 병합, 승급, 회고 방식처럼 되돌리기 어려운 결정이 새로 필요한 경우
- 세션 정리 체크리스트 중 저장소나 Issue에 고정해야 할 산출물이 빠진 경우

논스톱 진행을 완료한 뒤에는 `dev`, `stg`, `main` 일치 여부, 작업트리 상태, Issue와 Backlog 현행화, 회고 또는 종료 기록 위치를 보고한다.

## 13. Git 상태 변경 실행 게이트

Git 상태를 바꾸는 작업은 실행 전 게이트를 통과해야 한다.

Git 상태 변경 게이트를 확인하기 전에 [STA-002 AI 시작가이드](../00.시작/STA-002_AI_시작가이드.md)의 요청 해석 게이트를 먼저 적용한다. 자연어 요청이 질문/검토 또는 작업 방향 합의에 해당하면 Git 상태를 변경하지 않고 필요한 태그와 승인 범위를 먼저 보고한다.

| 상태 변경 | 필수 실행조건 | 중단 조건 |
|---|---|---|
| 작업 브랜치 생성 | 관련 Issue 또는 Issue 생성 생략 사유가 명확함, 기준 브랜치가 최신 `main`임, 작업트리가 충돌 상태가 아님 | Issue 없는 큰 작업, 기준 브랜치 불명확, 미확인 로컬 변경이 작업 파일과 충돌 |
| PR 생성 | 관련 Issue 존재, PR 범위와 제외 범위 명확, 검증 방법 명확, Backlog 연결 이력 확인 | Issue 없이 PR 생성, 자동 종료 키워드 오용 가능성, 후속 Backlog 연결 누락 |
| PR Ready 전환 | 완료 조건 충족, 검증 결과 존재, 문서 탈고 또는 리뷰 확인 완료 | 렌더링/리뷰/검증 조건 미충족, PR 목적과 변경 범위 불일치 |
| `dev` 머지 | PR 검토 가능 상태, 머지 대상과 기준 브랜치 확인, 충돌 없음 | 리뷰 미완료, 실패한 검증 존재, 관련 Issue 종료 조건 불명확 |
| `stg` 승급 | `dev` 반영 커밋 확인, 검증 방법 존재, 실패 기록 위치 명확 | 검증 방법 없음, 원격 브랜치 불일치, 충돌 또는 권한 문제 |
| `main` 승급 | `stg` 검증 통과, `main` 영향 승인 범위 명확, `dev/stg/main` 일치 확인 가능 | 검증 미완료, 사용자 확인이 필요한 상태, 실패 기록 미작성 |
| Issue 종료 | `#세션정리` 수행 중, 완료 조건 충족, 관련 PR 반영 완료, 남은 Backlog 분리, verified 종료 후보로 판정됨 | `#태스크정리` 또는 `#태스크승급` 중 종료 시도, 완료 조건 일부 미충족, 후속 작업 미분류, 자동 종료 여부 불명확 |

게이트를 통과하지 못하면 상태 변경을 실행하지 않는다. 이미 일부 단계가 진행된 경우에는 [STA-002 AI 시작가이드](../00.시작/STA-002_AI_시작가이드.md)의 태그 실행 게이트와 [POL-005 사람 승인 경계 정책](./POL-005_사람_승인_경계_정책.md)의 전환 기준에 따라 사후 보정, `Need Approval`, `Stop`, `Backlog` 중 하나로 정리한다.

## 14. 관련 문서

- [POL-001 문서관리방안](./POL-001_문서관리방안.md)
- [POL-002 Issue 작성정책](./POL-002_Issue_작성정책.md)
- [POL-004 CTO 대화운영규칙](./POL-004_CTO_대화운영규칙.md)
- [Backlog 미해결 인덱스](../15.로그/backlog/README.md)

[목차로 이동](#목차)

---

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-04 | - | Codex | GPT-5 | CTO | jk / Codex | Create | Git 작업관리방안 최초 작성 |
| 2026-07-04 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | 태스크승급 태그와 자동/확인/검증 승급 흐름 추가 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | Issue 등록 선행과 태스크 정리 전 세션명, 브랜치명, PR 연결 확인 절차 추가 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | PR 제목 형식과 PR 생성 후 제목 보정 기준 추가 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | PR 제목 번호를 GitHub 채번이 아닌 Issue/PR 전용 순번으로 변경 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | PR 제목을 이슈번호와 이슈내PR번호 형식으로 변경 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | PR 제목의 이슈내PR번호 표기를 괄호 형식으로 변경 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | 태스크 정리 전 공식 문서 탈고 확인 절차 추가 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | 태스크 정리 시 끼어든 주제의 번외 또는 Backlog 분류 제안 기준 추가 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | 같은 Issue 안의 여러 PR 연결 기준과 세션 마무리 시 세션명 현행화 확인 항목 추가 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | 태스크 정리 PR의 Issue 자동 종료 키워드 사용 제한 기준 추가 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | 태스크시작 없이 진행된 작업의 태스크정리 사후 보정 항목 추가 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | 절차 기반 처리와 Issue 번호 기반 채번 충돌 방지 기준 추가 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | 사용자 주문과 표준 절차 충돌 시 확인 기준 추가 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | 논스톱 진행 조건과 중단 기준 추가 |
| 2026-07-08 | [#37](https://github.com/jkoogit/jkadh/issues/37) | Codex | GPT-5 | CTO | jk / Codex | Revise | Git 상태 변경별 실행 게이트와 중단 조건 추가 |
| 2026-07-08 | [#39](https://github.com/jkoogit/jkadh/issues/39) | Codex | GPT-5 | CTO | jk / Codex | Revise | 태스크승급과 Issue 종료를 독립 절차로 분리 |
| 2026-07-08 | [#41](https://github.com/jkoogit/jkadh/issues/41) | Codex | GPT-5 | CTO | jk / Codex | Revise | 공식 문서 Header 표 형식 현행화 |
| 2026-07-08 | [#46](https://github.com/jkoogit/jkadh/issues/46) | Codex | GPT-5 | CTO | jk / Codex | Revise | 단순 주문의 절차 확인 기준과 Backlog 분리 조건 보강 |
| 2026-07-09 | [#48](https://github.com/jkoogit/jkadh/issues/48) | Codex | GPT-5 | CTO | jk / Codex | Revise | 태스크정리 결과를 완료 또는 보류로 보고하는 기준 추가 |
| 2026-07-10 | [#52](https://github.com/jkoogit/jkadh/issues/52) | Codex | GPT-5 | CTO | jk / Codex | Revise | Git 상태 변경 전 STA-002 요청 해석 게이트를 먼저 적용하는 기준 추가 |
| 2026-07-10 | [#56](https://github.com/jkoogit/jkadh/issues/56) | Codex | GPT-5 | CTO | jk / Codex | Revise | 태스크정리 결과 보고에 세션명 현행화 결과를 필수 조건으로 추가 |
| 2026-07-12 | [#58](https://github.com/jkoogit/jkadh/issues/58) | Codex | GPT-5 | CTO | jk / Codex | Revise | Issue 제목 우선 보정과 Issue 종료 세션정리 전용 기준 반영 |
