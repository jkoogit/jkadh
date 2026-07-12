# REF-004 Harness CLI 1차구현 사용방법

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
- [2. 현재 구현 범위](#2-현재-구현-범위)
- [3. 로컬 실행 방법](#3-로컬-실행-방법)
- [4. 환경변수 구성](#4-환경변수-구성)
- [5. 명령별 사용법](#5-명령별-사용법)
- [6. 제외 범위](#6-제외-범위)
- [7. 검증 방법](#7-검증-방법)
- [8. 후속 사용방법 문서화 기준](#8-후속-사용방법-문서화-기준)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 Harness CLI 1차 구현의 사용방법을 정리한다.

1차 구현은 배포형 서비스가 아니라 JKADH 저장소 안에서 실행하는 로컬 CLI 골격이다. 목적은 `read/check/report` 중심으로 태그 기반 Harness 절차를 코드화하고, 1차 구현 시점의 사용방법을 스냅샷 문서로 남기는 것이다.

향후 사용방법이 개선되면 본 문서를 계속 수정해 누적하지 않고, 개선 시점별 별도 참고 문서를 추가한다. 예를 들어 2차 구현 사용방법은 별도 `REF-*` 문서로 작성하고, 본 문서는 1차 구현 기준으로 유지한다.

## 2. 현재 구현 범위

현재 구현 위치는 `packages/harness-cli`이다.

1차 구현에서 제공하는 기능은 다음과 같다.

| 기능 | 설명 |
|---|---|
| `session start` report | 세션 시작 점검 결과를 Markdown으로 출력한다. |
| `gate check` | 요청한 액션이 `read/check/report` 범위 안인지 판단한다. |
| `report create` | 기본 dry-run report를 Markdown으로 출력한다. |
| 환경변수 점검 | 필수 환경변수의 실제 값을 출력하지 않고 `present` 또는 `missing` 상태만 표시한다. |
| JSON 저장 유틸 | report 같은 결과를 pretty JSON 파일로 저장할 수 있는 내부 유틸을 제공한다. |

현재 CLI는 실제 GitHub 쓰기, 브랜치 생성, PR 병합, 승급, Issue 종료를 수행하지 않는다.

## 3. 로컬 실행 방법

Harness CLI는 아직 패키지 배포나 전역 설치 대상이 아니다. 현재는 패키지 디렉터리에서 Node로 직접 실행한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
```

테스트를 실행한다.

```powershell
npm test
```

CLI 문법을 확인한다.

```powershell
npm run check
```

명령은 다음처럼 실행한다.

```powershell
node --experimental-strip-types src/cli.ts session start
node --experimental-strip-types src/cli.ts gate check session_start create_report
node --experimental-strip-types src/cli.ts report create
```

## 4. 환경변수 구성

환경변수의 인터페이스는 저장소 루트의 `.env.example`에 둔다.

실제 값은 커밋하지 않는다. 로컬 또는 Codex 로컬에서는 `.env.local`을 사용할 수 있고, dev/stg/main 서버나 GitHub Actions에서는 동일한 환경변수 이름을 런타임 환경에서 주입한다.

현재 환경변수 계약은 다음과 같다.

| 변수 | 용도 | 실제 값 저장 위치 |
|---|---|---|
| `GITHUB_TOKEN` | GitHub 조회 또는 향후 쓰기 작업 인증 | 로컬 `.env.local`, GitHub Secrets, Secret Manager |
| `OPENAI_API_KEY` | OpenAI API 사용이 필요한 후속 기능 인증 | 로컬 `.env.local`, GitHub Secrets, Secret Manager |
| `JKADH_TARGET_REPO` | 기본 대상 저장소 | 로컬 `.env.local`, 배포 환경변수 |
| `JKADH_TARGET_PROJECT` | 기본 대상 프로젝트 ID | 로컬 `.env.local`, 배포 환경변수 |
| `JKADH_ENV` | 실행 환경 라벨 | 로컬 `.env.local`, 배포 환경변수 |

`.env`, `.env.local`, `.env.*`는 `.gitignore`로 제외한다. `.env.example`만 저장소에 커밋한다.

## 5. 명령별 사용법

### 5.1 `session start`

세션 시작 점검 report를 출력한다.

```powershell
node --experimental-strip-types src/cli.ts session start
```

현재 출력 항목은 다음과 같다.

- `dev/stg/main` 브랜치 일치 여부
- 작업트리 상태
- Backlog 후보
- 필수 credential 상태
- 차단된 write action 목록

credential은 실제 값을 출력하지 않고 다음처럼 상태만 출력한다.

```text
credentials: GITHUB_TOKEN missing; OPENAI_API_KEY missing; JKADH_TARGET_REPO missing; JKADH_TARGET_PROJECT missing; JKADH_ENV missing
```

### 5.2 `gate check`

요청 액션이 `read/check/report` 범위 안인지 확인한다.

허용 예시:

```powershell
node --experimental-strip-types src/cli.ts gate check session_start create_report
```

출력 예시:

```json
{
  "allowed": true,
  "reason": "action is inside read/check/report scope",
  "nextState": "execute",
  "tag": "session_start",
  "requestedAction": "create_report"
}
```

차단 예시:

```powershell
node --experimental-strip-types src/cli.ts gate check task_promote merge_pr
```

출력 예시:

```json
{
  "allowed": false,
  "reason": "write action is outside read/check/report scope",
  "nextState": "report_only",
  "tag": "task_promote",
  "requestedAction": "merge_pr"
}
```

차단된 action은 non-zero exit code를 반환한다.

### 5.3 `report create`

기본 dry-run report를 출력한다.

```powershell
node --experimental-strip-types src/cli.ts report create
```

현재 report는 `read-check-report` 모드와 write action 미구현 상태를 표시한다.

## 6. 제외 범위

1차 구현에서 제외한 범위는 다음과 같다.

- GitHub Issue 생성 또는 종료
- PR 생성, 병합, 상태 변경
- `dev`, `stg`, `main` 브랜치 승급
- 서비스 프로젝트 repo 코드 수정
- 여러 서비스 repo를 대상으로 한 `ProjectProfile` 자동 로딩
- `.env.local` 자동 로딩
- npm 패키지 배포 또는 전역 설치
- 백엔드 API, DB, 토큰 사용량 저장

## 7. 검증 방법

현재 구현 검증은 다음 명령으로 수행한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
npm test
npm run check
node --experimental-strip-types src/cli.ts session start
node --experimental-strip-types src/cli.ts gate check session_start create_report
node --experimental-strip-types src/cli.ts report create
```

기대 결과는 다음과 같다.

- 테스트가 모두 통과한다.
- CLI 문법 확인이 통과한다.
- `session start`는 secret 값을 출력하지 않고 `present/missing` 상태만 출력한다.
- `gate check`는 write action을 차단한다.
- `report create`는 Markdown dry-run report를 출력한다.

## 8. 후속 사용방법 문서화 기준

본 문서는 1차 구현 시점의 사용방법만 다룬다. 다음 항목이 구현되거나 사용법이 바뀌면 본 문서를 직접 갱신하지 않고, 해당 시점의 별도 사용방법 문서를 추가한다.

| 후보 | 설명 |
|---|---|
| `.env.local` 로딩 | 로컬 실행 편의를 위해 미커밋 환경파일을 선택적으로 읽는다. |
| `ProjectProfile` | 서비스 프로젝트가 별도 repo일 때 `project_id`, `repo_full_name`, `local_path`를 읽는다. |
| 실제 Git 상태 조회 | 현재 placeholder인 브랜치/작업트리 상태를 실제 git 명령 결과로 채운다. |
| Backlog 인덱스 파싱 | `docs/15.로그/backlog/README.md`에서 후보를 읽어 report에 반영한다. |
| JSON report 저장 명령 | `report create --out <path>` 같은 저장 옵션을 추가한다. |
| 설치 방식 정리 | 로컬 실행에서 npm script 또는 전역 CLI 실행으로 전환한다. |
| 토큰 사용량 저장 | 초기에는 JSON 또는 SQLite 후보로 검토한다. |

후속 문서명은 다음 형식을 우선 사용한다.

```text
REF-XXX_Harness_CLI_N차구현_사용방법.md
```

후속 문서는 해당 시점에 실제로 구현된 명령, 환경변수, 검증 방법만 포함한다.

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness CLI 1차 구현 사용방법 참고문서 작성 |

[목차로 이동](#목차)
