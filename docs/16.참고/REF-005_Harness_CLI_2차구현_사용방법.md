# REF-005 Harness CLI 2차구현 사용방법

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
- [2. 2차 구현 변경점](#2-2차-구현-변경점)
- [3. 채팅 세션 주문 방법](#3-채팅-세션-주문-방법)
- [4. CLI 실행 방법](#4-cli-실행-방법)
- [5. 태그별 동작 범위](#5-태그별-동작-범위)
- [6. 제외 범위](#6-제외-범위)
- [7. 검증 방법](#7-검증-방법)
- [8. 후속 사용방법 문서화 기준](#8-후속-사용방법-문서화-기준)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 Harness CLI 2차 구현 시점의 사용방법을 정리한다.

2차 구현의 목적은 기존 채팅 세션에서 사용하던 `#세션시작`, `#태스크시작`, `#태스크정리`, `#태스크승급`, `#세션정리` 태그를 Harness CLI 입력으로 해석해 더 일관된 `read/check/report` 처리를 가능하게 하는 것이다.

본 문서는 2차 구현 시점의 사용방법 스냅샷이다. 1차 구현 사용방법은 [REF-004 Harness CLI 1차구현 사용방법](./REF-004_Harness_CLI_1차구현_사용방법.md)에 남겨 둔다.

## 2. 2차 구현 변경점

2차 구현에서 추가된 항목은 다음과 같다.

| 항목 | 설명 |
|---|---|
| 한글 태그 어댑터 | `#세션시작`, `#태스크시작`, `#태스크정리`, `#태스크승급`, `#세션정리`를 내부 flow id로 변환한다. |
| Lifecycle flow registry | 5개 태그의 책임, 필수 확인 항목, 차단 write action을 코드로 정의한다. |
| 5개 CLI 명령 | `session start`, `task start`, `task close`, `task promote`, `session close`를 제공한다. |
| 태그 직접 실행 | `jkadh tag "#세션시작"`처럼 한글 태그를 직접 입력할 수 있다. |

## 3. 채팅 세션 주문 방법

채팅 세션에서는 기존처럼 태그를 사용한다.

세션 시작:

```text
#세션시작

원격 dev/stg/main 일치 여부와 작업트리 상태를 확인하고,
다음 작업 후보를 read/check/report 범위로 보고해줘.
```

태스크 시작:

```text
#태스크시작

Issue, 작업 범위, 제외 범위, 완료 조건, 검증 방법을 확인하고
쓰기 작업은 하지 말고 시작 가능 여부만 보고해줘.
```

태스크 정리:

```text
#태스크정리

변경 diff, 검증 결과, PR 상태, 완료 조건을 확인하고
Issue 종료 없이 정리 후보만 보고해줘.
```

태스크 승급:

```text
#태스크승급

PR 병합 가능성, 승급 대상 커밋, 브랜치 정합성, 검증 결과를 확인하고
merge나 promote는 하지 말고 blocked action으로 보고해줘.
```

세션 정리:

```text
#세션정리

열린 Issue/PR, 회고, 다음 세션 후보를 확인하고
Issue 종료는 하지 말고 read/check/report로 보고해줘.
```

## 4. CLI 실행 방법

현재 CLI는 아직 배포 또는 전역 설치하지 않는다. 패키지 디렉터리에서 Node로 직접 실행한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
```

5개 lifecycle 명령은 다음과 같다.

```powershell
node --experimental-strip-types src/cli.ts session start
node --experimental-strip-types src/cli.ts task start
node --experimental-strip-types src/cli.ts task close
node --experimental-strip-types src/cli.ts task promote
node --experimental-strip-types src/cli.ts session close
```

한글 태그를 직접 입력할 수도 있다.

```powershell
node --experimental-strip-types src/cli.ts tag "#세션시작"
node --experimental-strip-types src/cli.ts tag "#태스크시작"
node --experimental-strip-types src/cli.ts tag "#태스크정리"
node --experimental-strip-types src/cli.ts tag "#태스크승급"
node --experimental-strip-types src/cli.ts tag "#세션정리"
```

## 5. 태그별 동작 범위

현재 모든 태그는 `read/check/report` 범위에서만 동작한다.

| 채팅 태그 | CLI 명령 | 현재 동작 | 차단 write action |
|---|---|---|---|
| `#세션시작` | `session start` | 브랜치, 작업트리, credential, Backlog 후보 report | `create_issue`, `close_issue`, `merge_pr`, `promote_branch` |
| `#태스크시작` | `task start` | Issue/WorkOrder, 범위, 완료 조건, 검증 방법 확인 항목 report | `create_issue`, `create_branch` |
| `#태스크정리` | `task close` | diff, 검증 결과, PR 상태, 완료 조건 확인 항목 report | `close_issue`, `merge_pr`, `promote_branch` |
| `#태스크승급` | `task promote` | PR 병합 준비, 승급 대상 커밋, 브랜치 정합성 확인 항목 report | `merge_pr`, `promote_branch`, `close_issue` |
| `#세션정리` | `session close` | 열린 Issue/PR, 회고, 다음 세션 후보 확인 항목 report | `close_issue`, `merge_pr`, `promote_branch` |

## 6. 제외 범위

2차 구현에서도 다음 작업은 수행하지 않는다.

- GitHub Issue 생성 또는 종료
- 작업 브랜치 생성
- PR 생성 또는 병합
- `dev`, `stg`, `main` 승급
- 실제 GitHub 상태 조회 자동화
- 서비스 프로젝트 repo 선택과 `ProjectProfile` 로딩
- `.env.local` 자동 로딩
- 백엔드 API, DB, 토큰 사용량 저장

## 7. 검증 방법

현재 구현 검증은 다음 명령으로 수행한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
npm test
npm run check
node --experimental-strip-types src/cli.ts task start
node --experimental-strip-types src/cli.ts task close
node --experimental-strip-types src/cli.ts task promote
node --experimental-strip-types src/cli.ts session close
node --experimental-strip-types src/cli.ts tag "#세션시작"
```

기대 결과는 다음과 같다.

- 테스트가 모두 통과한다.
- CLI 문법 확인이 통과한다.
- 5개 lifecycle 명령이 Markdown report를 출력한다.
- 한글 태그 입력이 내부 flow로 변환된다.
- write action은 모두 blocked로 보고된다.

## 8. 후속 사용방법 문서화 기준

다음 사용법 변경은 본 문서를 수정 누적하지 않고 별도 `REF-*` 문서로 남긴다.

후속 후보는 다음과 같다.

| 후보 | 설명 |
|---|---|
| 실제 Git 상태 조회 | 브랜치/작업트리/원격 일치 여부를 실제 명령 결과로 채운다. |
| Backlog 인덱스 파싱 | 미해결 Backlog 인덱스를 읽어 후보를 자동 보고한다. |
| ProjectProfile | 서비스 프로젝트가 다른 repo일 때 대상 repo와 로컬 경로를 선택한다. |
| `.env.local` 로딩 | 로컬 실행 시 미커밋 환경파일을 선택적으로 읽는다. |
| JSON report 저장 명령 | `--out` 옵션으로 report 파일을 저장한다. |

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness CLI 2차 구현 사용방법 참고문서 작성 |

[목차로 이동](#목차)
