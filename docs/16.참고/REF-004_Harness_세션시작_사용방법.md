# REF-004 Harness 세션시작 사용방법

| 항목 | 값 |
|---|---|
| 문서 ID | REF-004 |
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
- [4. Harness가 확인하는 항목](#4-harness가-확인하는-항목)
- [5. Harness가 하지 않는 일](#5-harness가-하지-않는-일)
- [6. CLI 직접 실행 방법](#6-cli-직접-실행-방법)
- [7. 결과 해석 기준](#7-결과-해석-기준)
- [8. 다음 단계](#8-다음-단계)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 채팅 세션에서 `#세션시작` 태그를 사용할 때 Harness가 수행하는 확인 범위와 사용 방법을 정리한다.

`#세션시작`은 작업을 시작하기 전에 기준 상태와 다음 작업 후보를 확인하는 태그다. 이 태그는 상태를 변경하지 않는다.

## 2. 사용할 때

다음 상황에서 사용한다.

- 새 Codex 채팅 세션을 시작할 때
- 이전 세션의 회고와 Backlog를 기준으로 다음 작업 후보를 확인할 때
- 원격 `dev`, `stg`, `main` 브랜치 정합성을 확인할 때
- 열린 Issue/PR이 남아 있는지 확인할 때
- 작업 시작 전 초기 세션명, 추천 브랜치명, 관련 Issue를 보고받을 때

## 3. 채팅 주문 방법

기본 주문은 다음과 같다.

```text
#세션시작

ProjectProfile은 jkadh를 사용하고,
내부 원격레포 기준으로 세션 시작 점검을 수행해줘.
원격 dev/stg/main 정합성, 작업트리, 최신 회고, Backlog, 열린 Issue/PR을 확인하고
다음 작업 후보를 기준으로 초기 세션명, 추천 브랜치명, 관련 Issue, 추천 다음 작업을 보고해줘.
쓰기 작업은 하지 말고 read/check/report로만 처리해줘.
```

짧게는 다음처럼 주문할 수 있다.

```text
#세션시작
```

세션번호를 함께 주는 문법은 후속 구현 대상이다. 현재는 세션번호를 자동 확정하지 않고 `manual_required`로 표시한다.

## 4. Harness가 확인하는 항목

현재 Harness CLI는 `#세션시작`에서 다음 항목을 확인한다.

| 항목 | 현재 처리 |
|---|---|
| ProjectProfile | 기본값 `jkadh` 사용 |
| 원격 브랜치 정합성 | `origin/main`, `origin/dev`, `origin/stg` 커밋 일치 여부 확인 |
| 현재 브랜치 | Git 현재 브랜치 확인 |
| 작업트리 상태 | `git status --porcelain` 기준 clean/dirty 확인 |
| 최신 회고 | `docs/12.회고/README.md`에서 최신 `RET-*` 탐색 |
| 다음 세션 권장 시작점 | 최신 회고 본문에서 파싱 |
| 미해결 Backlog | `docs/15.로그/backlog/README.md`에서 후보 파싱 |
| 열린 Issue/PR | 내부 repo 기준 `gh issue list`, `gh pr list` read-only 조회 |
| 초기 세션명 | 최신 회고의 추천 세션명 기준 제안 |
| 추천 브랜치명 | 관련 Issue가 있으면 Issue 번호 기반으로 제안 |
| 관련 Issue | 열린 Issue 제목과 추천 작업을 대조 |
| 추천 다음 작업 | 최신 회고의 권장 시작점 기준 제안 |

## 5. Harness가 하지 않는 일

`#세션시작`은 상태 변경 태그가 아니다. 따라서 다음 작업은 하지 않는다.

- Issue 생성
- 작업 브랜치 생성
- 파일 수정
- PR 생성
- PR 병합
- `dev`, `stg`, `main` 승급
- Issue 종료
- 참고문서 본문 리뷰

위 작업은 후속 태그에서 다룬다.

| 작업 | 담당 태그 |
|---|---|
| Issue 또는 브랜치 생성 | `#태스크시작` |
| 완료 조건과 검증 결과 정리 | `#태스크정리` |
| PR 병합과 브랜치 승급 | `#태스크승급` |
| 회고와 종료 후보 Issue 정리 | `#세션정리` |

## 6. CLI 직접 실행 방법

현재 CLI는 아직 전역 설치하지 않는다. 직접 실행하려면 다음 명령을 사용한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
node --experimental-strip-types src/cli.ts session start jkadh
```

GitHub 조회가 가능한 환경에서는 열린 Issue/PR 개수와 관련 Issue가 표시된다.

GitHub 조회가 불가능한 환경에서는 다음처럼 표시될 수 있다.

```text
github: GitHub open issue/PR lookup unavailable
```

이 경우에도 나머지 로컬 Git, Backlog, 회고 기반 report는 계속 생성된다.

## 7. 결과 해석 기준

대표 출력 항목의 의미는 다음과 같다.

| 출력 | 의미 |
|---|---|
| `branch alignment: dev/stg/main: aligned` | 원격 `dev`, `stg`, `main` 커밋이 일치한다. |
| `worktree status: dirty` | 현재 작업 중 변경이 있다. 세션 구현 중이면 정상일 수 있다. |
| `backlog candidates` | 미해결 Backlog 후보 목록이다. |
| `latest retrospective` | 다음 작업 판단에 사용할 최신 회고 문서다. |
| `github: open issues: N; open PRs: M` | 내부 repo의 열린 Issue/PR 개수다. |
| `session plan` | 초기 세션명, 추천 브랜치명, 관련 Issue, 추천 다음 작업이다. |
| `write actions` | `#세션시작`에서 차단되는 상태 변경 작업이다. |

## 8. 다음 단계

`#세션시작` report를 확인한 뒤에는 다음 중 하나로 진행한다.

| 상황 | 다음 태그 |
|---|---|
| 관련 Issue가 없고 작업을 시작해야 함 | `#태스크시작` |
| 관련 Issue가 있고 브랜치 생성이 필요함 | `#태스크시작` |
| 이전 작업을 마무리해야 함 | `#태스크정리` |
| PR 병합이나 브랜치 승급이 필요함 | `#태스크승급` |
| 세션 종료와 회고가 필요함 | `#세션정리` |

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness `#세션시작` 사용방법 문서 작성 |

[목차로 이동](#목차)
