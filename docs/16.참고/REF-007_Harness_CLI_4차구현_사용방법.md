# REF-007 Harness CLI 4차구현 사용방법

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
| 작업 브랜치 | task_codex/064-harness-cli-minimal |
| 최종 수정일 | 2026-07-12 |

## 목차

- [1. 목적](#1-목적)
- [2. 4차 구현 변경점](#2-4차-구현-변경점)
- [3. 세션 시작 점검 범위](#3-세션-시작-점검-범위)
- [4. 채팅 세션 주문 방법](#4-채팅-세션-주문-방법)
- [5. CLI 실행 방법](#5-cli-실행-방법)
- [6. GitHub 조회 기준](#6-github-조회-기준)
- [7. 제외 범위](#7-제외-범위)
- [8. 검증 방법](#8-검증-방법)
- [9. 후속 사용방법 문서화 기준](#9-후속-사용방법-문서화-기준)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 Harness CLI 4차 구현 시점의 사용방법을 정리한다.

4차 구현의 목적은 `#세션시작` 태그를 기존 스킬 절차에 더 가깝게 전환하기 위해 로컬 문서와 GitHub 상태를 실제로 읽어 세션 시작 report에 반영하는 것이다.

본 문서는 4차 구현 시점의 사용방법 스냅샷이다. 이전 사용방법은 `REF-004`, `REF-005`, `REF-006`에 남겨 둔다.

## 2. 4차 구현 변경점

4차 구현에서 추가된 항목은 다음과 같다.

| 항목 | 설명 |
|---|---|
| Backlog 인덱스 파싱 | `docs/15.로그/backlog/README.md`에서 미해결 Backlog 후보를 읽는다. |
| 최신 회고 탐색 | `docs/12.회고/README.md`에서 가장 큰 `RET-*` 문서를 최신 회고로 판단한다. |
| GitHub 열린 작업 조회 | 내부 repo 기준으로 열린 Issue와 PR 개수를 read-only로 조회한다. |
| 세션 시작 report 확장 | 브랜치, 작업트리, Backlog, credential, 최신 회고, GitHub 열린 작업을 함께 출력한다. |

## 3. 세션 시작 점검 범위

현재 `session start`가 확인하는 항목은 다음과 같다.

| 항목 | 처리 방식 |
|---|---|
| 브랜치 정합성 | `origin/main`, `origin/dev`, `origin/stg` 커밋 일치 여부 |
| 작업트리 상태 | `git status --porcelain` 결과 |
| Backlog 후보 | 미해결 Backlog 인덱스 파싱 |
| credential 상태 | 필수 환경변수의 `present/missing` 상태만 보고 |
| 최신 회고 | 회고 인덱스에서 최신 `RET-*` 문서 선택 |
| GitHub 열린 작업 | `gh issue list`, `gh pr list` read-only 조회 |
| write action | Issue 생성/종료, PR 병합, 브랜치 승급은 blocked |

## 4. 채팅 세션 주문 방법

채팅 세션에서는 다음처럼 주문한다.

```text
#세션시작

ProjectProfile은 jkadh를 사용하고,
내부 원격레포 기준으로 세션 시작 점검을 수행해줘.
원격 dev/stg/main 정합성, 작업트리, Backlog, 최신 회고, 열린 Issue/PR을 확인하고
쓰기 작업은 하지 말고 read/check/report로 보고해줘.
```

현재 구현은 위 주문을 다음 CLI 실행으로 대응할 수 있다.

```powershell
node --experimental-strip-types src/cli.ts session start jkadh
```

## 5. CLI 실행 방법

현재 CLI는 아직 배포 또는 전역 설치하지 않는다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
node --experimental-strip-types src/cli.ts session start jkadh
```

출력 예시는 다음 형식이다.

```text
# Harness CLI session start

- [pass] branch alignment: dev/stg/main: aligned
- [blocked] worktree status: dirty
- [pass] backlog candidates: BLG-022 ...; BLG-025 ...
- [blocked] credentials: GITHUB_TOKEN missing; ...
- [pass] latest retrospective: RET-008 ...
- [pass] github: open issues: 1; open PRs: 0
- [blocked] write actions: create_issue, close_issue, merge_pr, promote_branch
```

작업 중 변경이 있으면 `worktree status: dirty`가 정상적으로 표시된다.

## 6. GitHub 조회 기준

GitHub 조회는 내부 repo `jkoogit/jkadh` 기준 read-only로 수행한다.

사용하는 명령은 다음과 같다.

```powershell
gh issue list --repo jkoogit/jkadh --state open --json number,title
gh pr list --repo jkoogit/jkadh --state open --json number,title
```

네트워크, 인증, 샌드박스 제약으로 조회할 수 없으면 CLI는 실패로 종료하지 않고 다음처럼 보고한다.

```text
github: GitHub open issue/PR lookup unavailable
```

승인된 실행 환경에서 조회가 가능하면 열린 Issue와 PR 개수를 보고한다.

## 7. 제외 범위

4차 구현에서도 다음 작업은 수행하지 않는다.

- GitHub Issue 생성 또는 종료
- 작업 브랜치 생성
- PR 생성 또는 병합
- `dev`, `stg`, `main` 승급
- 외부 repo `env` 접근모드 실제 처리
- `.env.local` 자동 로딩
- JSON report 파일 저장 옵션
- 백엔드 API, DB, 토큰 사용량 저장

## 8. 검증 방법

현재 구현 검증은 다음 명령으로 수행한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
npm test
npm run check
node --experimental-strip-types src/cli.ts session start jkadh
```

GitHub 조회까지 확인하려면 `gh` 네트워크 접근이 가능한 환경에서 같은 명령을 실행한다.

기대 결과는 다음과 같다.

- 테스트가 모두 통과한다.
- CLI 문법 확인이 통과한다.
- Backlog 후보가 report에 표시된다.
- 최신 회고가 report에 표시된다.
- GitHub 조회 가능 시 열린 Issue/PR 개수가 표시된다.
- GitHub 조회 불가 시 unavailable로 보고하고 CLI는 계속 report를 출력한다.

## 9. 후속 사용방법 문서화 기준

다음 사용법 변경은 본 문서를 수정 누적하지 않고 별도 `REF-*` 문서로 남긴다.

후속 후보는 다음과 같다.

| 후보 | 설명 |
|---|---|
| `#태스크시작` 실제화 | Issue/WorkOrder, 범위, 브랜치 생성 가능 조건을 실제로 확인한다. |
| JSON report 저장 | 세션 시작 report를 파일로 저장한다. |
| `.env.local` 로딩 | 로컬 credential 상태를 실제 로컬 파일에서 선택적으로 읽는다. |
| 외부 repo 지원 | `access_mode: env`와 `credential_ref`를 실제로 처리한다. |

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness CLI 4차 구현 사용방법 참고문서 작성 |

[목차로 이동](#목차)
