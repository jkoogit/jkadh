# REF-006 Harness CLI 3차구현 사용방법

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
- [2. 3차 구현 변경점](#2-3차-구현-변경점)
- [3. ProjectProfile 구조](#3-projectprofile-구조)
- [4. 내부 원격레포 기준 사용법](#4-내부-원격레포-기준-사용법)
- [5. 외부 원격레포 처리 기준](#5-외부-원격레포-처리-기준)
- [6. 채팅 세션 주문 방법](#6-채팅-세션-주문-방법)
- [7. 검증 방법](#7-검증-방법)
- [8. 후속 사용방법 문서화 기준](#8-후속-사용방법-문서화-기준)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 Harness CLI 3차 구현 시점의 사용방법을 정리한다.

3차 구현의 목적은 내부 원격레포와 외부 원격레포를 구분할 수 있는 `ProjectProfile` 구조를 먼저 잡고, 현재 단계에서는 내부 원격레포인 JKADH 저장소를 기준으로 실제 Git 상태 조회를 수행하는 것이다.

본 문서는 3차 구현 시점의 사용방법 스냅샷이다. 1차 사용방법은 `REF-004`, 2차 태그 사용방법은 `REF-005`에 남겨 둔다.

## 2. 3차 구현 변경점

3차 구현에서 추가된 항목은 다음과 같다.

| 항목 | 설명 |
|---|---|
| `ProjectProfile` | 프로젝트 ID, repo, 로컬 경로, 접근모드를 표현한다. |
| 기본 `jkadh` profile | 내부 원격레포 `jkoogit/jkadh`를 기본 대상으로 둔다. |
| `access_mode` | `internal`과 `env` 모드를 구분한다. |
| 내부 Git 상태 조회 | `internal` 모드에서는 현재 workspace 권한으로 Git 상태를 읽는다. |
| 외부 repo 차단 | `env` 모드는 구조만 두고 현재 구현에서는 blocked로 보고한다. |

## 3. ProjectProfile 구조

기본 profile은 `packages/harness-cli/data/projects/jkadh.json`에 둔다.

```json
{
  "project_id": "jkadh",
  "repo_full_name": "jkoogit/jkadh",
  "local_path": "../..",
  "access_mode": "internal"
}
```

필드 의미는 다음과 같다.

| 필드 | 의미 |
|---|---|
| `project_id` | Harness CLI에서 사용하는 프로젝트 식별자 |
| `repo_full_name` | GitHub repo 전체 이름 |
| `local_path` | CLI 실행 위치 기준 로컬 repo 경로 |
| `access_mode` | repo 접근 방식. 현재는 `internal`만 실제 처리 |
| `credential_ref` | 외부 repo 접근 시 사용할 credential 참조. 현재 `env` 모드에서만 후보 |

## 4. 내부 원격레포 기준 사용법

현재 기본 대상은 `jkadh` project이다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
node --experimental-strip-types src/cli.ts session start
```

명시적으로 project ID를 넘길 수도 있다.

```powershell
node --experimental-strip-types src/cli.ts session start jkadh
```

현재 `internal` 모드에서 실제로 확인하는 항목은 다음과 같다.

| 항목 | 처리 방식 |
|---|---|
| 현재 브랜치 | `git branch --show-current` |
| 작업트리 상태 | `git status --porcelain` |
| 원격 `main` | `git rev-parse origin/main` |
| 원격 `dev` | `git rev-parse origin/dev` |
| 원격 `stg` | `git rev-parse origin/stg` |
| 브랜치 정합성 | `origin/main`, `origin/dev`, `origin/stg` 커밋 일치 여부 |

작업 중 변경이 있으면 `worktree status: dirty`로 보고한다. 이 상태는 실패가 아니라 현재 작업 중 변경이 있다는 의미다.

## 5. 외부 원격레포 처리 기준

외부 원격레포는 다음 구조로 확장할 예정이다.

```json
{
  "project_id": "external-service",
  "repo_full_name": "owner/service",
  "local_path": "../service",
  "access_mode": "env",
  "credential_ref": "env:GITHUB_TOKEN"
}
```

현재 구현에서 `access_mode: env`는 실제 접근을 수행하지 않는다. Harness CLI는 다음 사유로 blocked 상태를 보고한다.

```text
env repository access is reserved for a later implementation
```

이 기준은 외부 repo 인증, clone/fetch, credential scope, 권한 오류 처리 방식이 확정되기 전까지 내부 repo 처리와 분리하기 위한 것이다.

## 6. 채팅 세션 주문 방법

내부 원격레포 기준으로는 다음처럼 주문한다.

```text
#세션시작

ProjectProfile은 jkadh를 사용하고,
내부 원격레포 기준으로 dev/stg/main 정합성과 작업트리 상태를 확인해줘.
쓰기 작업은 하지 말고 read/check/report로만 보고해줘.
```

외부 원격레포를 요청할 때는 아직 실제 처리를 기대하지 않고, blocked 기준 확인만 요청한다.

```text
#세션시작

외부 서비스 repo는 env 접근모드 후보로만 보고,
현재 구현에서는 blocked 사유를 보고해줘.
```

## 7. 검증 방법

현재 구현 검증은 다음 명령으로 수행한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
npm test
npm run check
node --experimental-strip-types src/cli.ts session start
node --experimental-strip-types src/cli.ts session start jkadh
```

기대 결과는 다음과 같다.

- 테스트가 모두 통과한다.
- CLI 문법 확인이 통과한다.
- `session start`가 기본 `jkadh` profile을 읽는다.
- `internal` 모드에서 실제 Git 상태를 report에 반영한다.
- `dev/stg/main` 원격 커밋이 같으면 aligned로 보고한다.
- 작업 중 변경이 있으면 dirty로 보고한다.

## 8. 후속 사용방법 문서화 기준

다음 사용법 변경은 본 문서를 수정 누적하지 않고 별도 `REF-*` 문서로 남긴다.

후속 후보는 다음과 같다.

| 후보 | 설명 |
|---|---|
| 외부 repo `env` 모드 | `credential_ref`를 해석해 외부 repo GitHub 조회를 수행한다. |
| `.env.local` 로딩 | 로컬 실행 시 미커밋 환경파일을 선택적으로 읽는다. |
| Backlog 인덱스 파싱 | 미해결 Backlog 후보를 자동으로 report에 반영한다. |
| JSON report 저장 옵션 | `session start --out <path>` 같은 저장 옵션을 추가한다. |

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness CLI 3차 구현 사용방법 참고문서 작성 |

[목차로 이동](#목차)
