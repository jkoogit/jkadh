# DSN-009 HCP JSON DB 매핑 설계

| 항목 | 값 |
|---|---|
| 문서 ID | DSN-009 |
| 문서 유형 | 설계 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/084-hcp-json-db-mapping |
| 최종 수정일 | 2026-07-16 |

## 목차

- [1. 목적](#1-목적)
- [2. 적용 범위](#2-적용-범위)
- [3. 매핑 원칙](#3-매핑-원칙)
- [4. JSON 원천 구조](#4-json-원천-구조)
- [5. 테이블별 매핑](#5-테이블별-매핑)
- [6. 이벤트 매핑](#6-이벤트-매핑)
- [7. 보류 필드와 간극](#7-보류-필드와-간극)
- [8. 검증 기준](#8-검증-기준)
- [9. 관련 문서](#9-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 현재 `.hcp/sessions/**/*.json` runtime 상태 파일과 `hcp` DB 테이블 사이의 필드 매핑 기준을 정의한다.

목표는 `.hcp` JSON 저장소를 즉시 폐기하거나 DB write-store로 전환하는 것이 아니라, 이후 전환 시 어떤 JSON 필드를 어떤 DB 컬럼에 적재할지 사전에 고정하는 것이다.

## 2. 적용 범위

본 문서는 다음 JSON 상태와 DB 테이블의 매핑에 적용한다.

- `.hcp/sessions/active/*.json`
- `.hcp/sessions/closing/*.json`
- `.hcp/sessions/complete/*.json`
- `.hcp/sessions/archived/*.json`
- `.hcp/sessions/blocked/*.json`
- `.hcp/sessions/failed/*.json`
- `hcp.harness_session`
- `hcp.harness_session_event`
- `hcp.harness_task`
- `hcp.harness_task_event`
- `hcp.harness_pull_request`
- `hcp.harness_backlog_item`

다음 항목은 본 문서에서 구현하지 않는다.

- DB write-store 구현
- `.hcp` JSON 제거
- DB와 JSON의 양방향 동기화 코드
- `hcp.harness_issue`, `hcp.harness_branch` 신규 테이블 생성
- DSN-008 history snapshot 생성
- dev/stg/prd DB 실제 migration 적용

## 3. 매핑 원칙

| 원칙 | 기준 |
|---|---|
| JSON 우선 호환 | 현재 `.hcp` JSON 필드명을 전환 입력 기준으로 유지한다. |
| DB 컬럼 안정화 | DB 컬럼명은 DSN-008의 snake_case 기준과 기존 DDL을 따른다. |
| 논리 참조 | `session_id`, `task_id`는 FK 없이 논리 참조로 관리한다. |
| 상태값 제한 | DB `status` 컬럼은 DDL의 CHECK 값 안에서만 적재한다. |
| 이벤트 보강 | JSON의 `changeLog`와 상태 전이성 정보는 event 테이블에 append-only로 적재한다. |
| 원천 보존 | 컬럼으로 분해되지 않는 원천 세부값은 event payload 또는 후속 테이블 후보로 분리한다. |
| 비파괴 전환 | 전환 초기에는 JSON 파일을 원천으로 읽고 DB는 조회/검증용 저장소로 취급한다. |

## 4. JSON 원천 구조

현재 HCP 세션 JSON의 대표 구조는 다음과 같다.

```json
{
  "sessionId": "codex_ses_014_20260715_001",
  "agentId": "codex",
  "sessionNumber": "014",
  "sessionName": "014_HCP_태스크테이블_DB저장소_구성",
  "status": "active",
  "linkedIssue": {
    "hcpIssueId": "codex_issue_014_001",
    "provider": "github",
    "number": 84
  },
  "backlogItems": [],
  "tasks": [],
  "changeLog": [],
  "createdAt": "2026-07-15T14:21:42.877Z",
  "updatedAt": "2026-07-15T15:12:59.897Z"
}
```

JSON 필드명은 TypeScript runtime 상태 모델의 camelCase를 따른다. DB 컬럼명은 PostgreSQL DDL의 snake_case를 따른다.

## 5. 테이블별 매핑

### 5.1 hcp.harness_session

| JSON 경로 | DB 컬럼 | 변환 기준 | 비고 |
|---|---|---|---|
| `sessionId` | `session_id` | 그대로 저장 | 세션 논리 식별자 |
| `sessionNumber` | `session_number` | 그대로 저장 | 3자리 세션 번호 |
| `sessionName` | `session_name` | 그대로 저장 | 한글 포함 가능 |
| `agentId` | `agent_id` | 그대로 저장 | 예: `codex` |
| `status` | `status` | 그대로 저장 | `active`, `complete`, `blocked`, `failed`, `archived` |
| `linkedIssue.number` | `linked_issue_number` | number 저장 | 없으면 null |
| `linkedIssue.title` | `linked_issue_title` | 그대로 저장 | 없으면 null |
| `linkedIssue.url` | `linked_issue_url` | 그대로 저장 | 없으면 null |
| `createdAt` | `started_at` | timestamptz 변환 | JSON 생성 시각을 세션 시작 시각으로 사용 |
| `completedAt` | `completed_at` | timestamptz 변환 | complete 상태 전이 시각 |
| `archivedAt` | `archived_at` | timestamptz 변환 | archived 상태 전이 시각 |
| `createdAt` | `created_at` | timestamptz 변환 | DB 행 생성 기준 |
| `updatedAt` | `updated_at` | timestamptz 변환 | DB 행 최종 수정 기준 |

`closingStartedAt`은 현재 세션 테이블에 직접 컬럼이 없다. 이 값은 `hcp.harness_session_event`의 `session.close.start` 이벤트로 적재한다.

### 5.2 hcp.harness_task

| JSON 경로 | DB 컬럼 | 변환 기준 | 비고 |
|---|---|---|---|
| `tasks[].taskId` | `task_id` | 그대로 저장 | 태스크 논리 식별자 |
| 상위 `sessionId` | `session_id` | 그대로 저장 | FK 없이 논리 참조 |
| `tasks[].taskName` | `task_name` | 그대로 저장 | 한글 포함 가능 |
| `tasks[].status` | `status` | 그대로 저장 | `active`, `closed`, `promoted`, `blocked`, `failed`, `deleted` |
| `tasks[].issueNumber` | `issue_number` | number 저장 | 없으면 null |
| `tasks[].branchName` | `branch_name` | 그대로 저장 | 없으면 null |
| `tasks[].pullRequest.number` | `pull_request_number` | number 저장 | 상세 PR row와 중복 허용 |
| `tasks[].createdAt` | `created_at` | timestamptz 변환 | 태스크 생성 시각 |
| `tasks[].updatedAt` | `updated_at` | timestamptz 변환 | 태스크 최종 수정 시각 |

`pull_request_number`는 태스크 목록 조회용 denormalized 컬럼이다. PR 상세 상태와 URL은 `hcp.harness_pull_request`에 저장한다.

### 5.3 hcp.harness_pull_request

| JSON 경로 | DB 컬럼 | 변환 기준 | 비고 |
|---|---|---|---|
| `tasks[].pullRequest.hcpPrId` | `pull_request_id` | 그대로 저장 | 없으면 `{agent}_pr_{sessionNumber}_{seq}` 생성 후보 |
| `tasks[].taskId` | `task_id` | 그대로 저장 | FK 없이 논리 참조 |
| `tasks[].pullRequest.provider` | `provider` | 그대로 저장 | 기본값 `github` |
| `tasks[].pullRequest.number` | `pull_request_number` | number 저장 | 필수 |
| `tasks[].pullRequest.url` | `url` | 그대로 저장 | 없으면 null |
| `tasks[].status` 또는 PR 조회 결과 | `status` | 변환 저장 | task promoted이면 `merged` 후보 |
| `tasks[].createdAt` | `created_at` | timestamptz 변환 | 별도 PR 생성 시각이 없으면 태스크 생성 시각 사용 |
| `tasks[].updatedAt` | `updated_at` | timestamptz 변환 | 별도 PR 수정 시각이 없으면 태스크 수정 시각 사용 |

PR `status`는 JSON 안에 독립 필드가 없다. 초기 적재에서는 다음 기준을 적용한다.

| 조건 | PR status |
|---|---|
| GitHub 조회 결과가 있고 draft | `draft` |
| GitHub 조회 결과가 있고 open | `open` |
| GitHub 조회 결과가 있고 merged | `merged` |
| GitHub 조회 결과가 있고 closed | `closed` |
| 조회 결과가 없고 task status가 `promoted` | `merged` |
| 조회 결과가 없고 task status가 `closed` | `open` |
| 그 외 | `open` |

### 5.4 hcp.harness_backlog_item

| JSON 경로 | DB 컬럼 | 변환 기준 | 비고 |
|---|---|---|---|
| `backlogItems[].hcpBacklogId` | `backlog_item_id` | 그대로 저장 | HCP runtime Backlog ID |
| 상위 `sessionId` | `session_id` | 그대로 저장 | FK 없이 논리 참조 |
| `backlogItems[].backlogId` | `backlog_id` | 그대로 저장 | 예: `BLG-022` |
| `backlogItems[].title` | `title` | 그대로 저장 | 필수 |
| `backlogItems[].status` | `status` | 그대로 저장 | `open`, `closed`, `deferred` |
| `backlogItems[].path` | `path` | 그대로 저장 | 없으면 null |
| `backlogItems[].note` | `note` | 그대로 저장 | 없으면 null |
| `backlogItems[].createdAt` | `created_at` | timestamptz 변환 | Backlog runtime 항목 생성 시각 |
| `backlogItems[].updatedAt` | `updated_at` | timestamptz 변환 | Backlog runtime 항목 최종 수정 시각 |

현재 TypeScript 상태 모델의 Backlog status는 `open`, `closed` 중심이다. DSN-008의 DB DDL은 `deferred`도 허용하므로 문서 Backlog 상태를 runtime 항목으로 옮길 때 `deferred`를 사용할 수 있다.

## 6. 이벤트 매핑

### 6.1 hcp.harness_session_event

| JSON 경로 또는 사건 | DB 컬럼 | 변환 기준 |
|---|---|---|
| 자동 생성 sequence | `session_event_id` | DB bigserial |
| `sessionId` | `session_id` | 그대로 저장 |
| 상태 전이명 | `event_type` | 아래 이벤트 유형 기준 |
| 실행 주체 | `event_source` | 기본 `harness-cli` |
| 원천 세부값 | `event_payload` | JSONB 저장 |
| 사건 발생 시각 | `occurred_at` | changeLog `changedAt` 또는 상태 전이 시각 |
| 적재 시각 | `created_at` | DB 기본값 또는 적재 시각 |

| 사건 | event_type | payload 기준 |
|---|---|---|
| 세션 생성 | `session.start` | session id, name, number, agent |
| 세션 closing 시작 | `session.close.start` | `closingStartedAt` |
| 세션 complete | `session.complete` | `completedAt` |
| 세션 archived | `session.archive` | `archivedAt` |
| 세션명 변경 | `session.update_name` | changeLog 원문 |
| 연결 Issue 변경 | `session.link_issue` | linkedIssue snapshot |
| Backlog 추가/수정/삭제 | `backlog.add`, `backlog.update`, `backlog.delete` | changeLog 원문 |

### 6.2 hcp.harness_task_event

| JSON 경로 또는 사건 | DB 컬럼 | 변환 기준 |
|---|---|---|
| 자동 생성 sequence | `task_event_id` | DB bigserial |
| `tasks[].taskId` | `task_id` | 그대로 저장 |
| 상위 `sessionId` | `session_id` | 그대로 저장 |
| 상태 전이명 | `event_type` | 아래 이벤트 유형 기준 |
| 실행 주체 | `event_source` | 기본 `harness-cli` |
| 원천 세부값 | `event_payload` | JSONB 저장 |
| 사건 발생 시각 | `occurred_at` | task `createdAt`, `updatedAt`, changeLog `changedAt` |
| 적재 시각 | `created_at` | DB 기본값 또는 적재 시각 |

| 사건 | event_type | payload 기준 |
|---|---|---|
| 태스크 생성 | `task.start` | task id, name, issue, branch |
| 태스크명 변경 | `task.update_name` | changeLog 원문 |
| 브랜치 연결 변경 | `task.update_branch` | branchName |
| PR 연결 변경 | `task.update_pr` | pullRequest snapshot |
| 태스크 closed | `task.close` | status, PR snapshot |
| 태스크 promoted | `task.promote` | promoted target commit은 별도 payload 후보 |
| 태스크 삭제 | `task.delete` | reason |

## 7. 보류 필드와 간극

| 항목 | 현재 상태 | 처리 기준 |
|---|---|---|
| `linkedIssue.hcpIssueId` | DB 세션 테이블에 직접 컬럼 없음 | `event_payload`에 보존하거나 `hcp.harness_issue` 후보로 분리 |
| `pullRequest.title` | PR 테이블에 직접 컬럼 없음 | 필요 시 후속 컬럼 또는 `event_payload` 후보 |
| `changeLog[]` | 테이블별 정규화 불완전 | session/task event로 나누어 적재 |
| `closingStartedAt` | 세션 테이블 컬럼 없음 | `session.close.start` 이벤트로 적재 |
| promoted target commit | JSON task에 직접 필드 없음 | task promote event payload 후보 |
| branch promotion 이력 | 현행 DB 테이블 없음 | `hcp.harness_branch` 후보로 분리 |
| GitHub Issue snapshot | 현행 DB 테이블 없음 | `hcp.harness_issue` 후보로 분리 |
| JSON 파일 경로 | 현행 DB 테이블 없음 | 적재 job metadata 또는 event payload 후보 |
| DB 적재 job id | 현행 DB 테이블 없음 | write-store 전환 시 별도 migration 후보 |

## 8. 검증 기준

매핑 설계 기반 구현은 다음 기준을 통과해야 한다.

| 검증 | 기준 |
|---|---|
| `npm test` | HCP 상태 모델과 DB 스키마 테스트가 통과한다. |
| `npm run check` | Harness CLI 문법 검사가 통과한다. |
| `git diff --check` | Markdown 공백과 패치 오류가 없다. |
| 샘플 매핑 리뷰 | 현재 `codex_ses_014_20260715_001` JSON을 기준으로 필드 누락과 보류 필드가 설명된다. |
| DB write-store 제외 확인 | DB 쓰기 코드, JSON 삭제 코드, 실제 migration 적용 코드가 포함되지 않는다. |

## 9. 관련 문서

- [DSN-004 Harness DB 운영데이터 설계](./DSN-004_Harness_DB_운영데이터_설계.md)
- [DSN-008 DB 테이블 설계서](./DSN-008_DB_테이블_설계서.md)
- [STA-002 AI 시작가이드](../00.시작/STA-002_AI_시작가이드.md)
- [Backlog 미해결 인덱스](../15.로그/backlog/README.md)

[목차로 이동](#목차)

---

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-16 | [#84](https://github.com/jkoogit/jkadh/issues/84) | Codex | GPT-5 | CTO | jk / Codex | Create | `.hcp` runtime JSON과 HCP DB 테이블 간 필드 매핑 설계 초안 작성 |
