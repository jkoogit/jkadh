# DSN-010 HCP DB write-store 전환 설계

| 항목 | 값 |
|---|---|
| 문서 ID | DSN-010 |
| 문서 유형 | 설계 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/108-hcp-db-write-store-design |
| 최종 수정일 | 2026-07-16 |

## 목차

- [1. 목적](#1-목적)
- [2. 적용 범위](#2-적용-범위)
- [3. 전환 원칙](#3-전환-원칙)
- [4. 저장 모드](#4-저장-모드)
- [5. 쓰기 순서](#5-쓰기-순서)
- [6. 단계별 전환 기준](#6-단계별-전환-기준)
- [7. 실패와 rollback 기준](#7-실패와-rollback-기준)
- [8. 구현 분리 기준](#8-구현-분리-기준)
- [9. 검증 기준](#9-검증-기준)
- [10. 관련 문서](#10-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 `.hcp/sessions/**/*.json` runtime 상태 파일을 HCP DB write-store로 전환하기 위한 정책, 단계, 실패 복구 기준을 정의한다.

목표는 즉시 구현하는 것이 아니라, 이후 구현 Issue에서 따라야 할 저장 모드와 rollback 판단 기준을 먼저 고정하는 것이다.

## 2. 적용 범위

본 문서는 다음 상태 쓰기 흐름에 적용한다.

- HCP 세션 생성, 상태 전이, 완료 처리
- HCP 태스크 생성, 상태 전이, PR 연결
- HCP Backlog runtime 항목 연결
- HCP Issue, Branch snapshot 연결
- `.hcp` JSON과 `hcp` DB 테이블 간 동시 쓰기 정책

다음 항목은 본 문서에서 구현하지 않는다.

- 실제 write-store 코드 작성
- `.hcp` JSON 삭제
- DB DDL 변경
- 실환경 DB migration 적용
- dev/stg/main 브랜치 승급 자동화 변경
- GitHub Issue, PR 동기화 worker 구현

## 3. 전환 원칙

| 원칙 | 기준 |
|---|---|
| 비파괴 전환 | DB 저장을 추가해도 기존 `.hcp` JSON 상태 파일은 즉시 제거하지 않는다. |
| JSON 호환 유지 | 초기 전환 단계에서는 JSON 구조를 사용자 가시 상태와 fallback 원천으로 유지한다. |
| DB는 idempotent | 같은 세션, 태스크, PR 상태를 반복 적재해도 결과가 중복되거나 깨지지 않아야 한다. |
| 이벤트 append-only | 상태 전이 이력은 session/task event 테이블에 추가 기록한다. |
| FK 없는 논리 참조 | DSN-008 기준처럼 물리 FK 없이 논리 키와 검증 쿼리로 연결한다. |
| 전환 플래그 필수 | 저장 모드는 환경 변수나 설정값으로 명시적으로 선택한다. |
| rollback 우선 | DB 쓰기 실패가 작업 상태 손실로 이어지면 안 된다. |

## 4. 저장 모드

HCP write-store는 다음 모드를 단계적으로 지원한다.

| 모드 | JSON 쓰기 | DB 쓰기 | 읽기 기준 | 용도 |
|---|---|---|---|---|
| `json-only` | Y | N | JSON | 현재 기본값과 rollback 기본값 |
| `dual-write-json-primary` | Y | Y | JSON | 초기 전환, DB 적재 검증 |
| `db-primary-json-mirror` | Y | Y | DB | DB 조회 전환 검증 |
| `db-only` | N | Y | DB | 장기 후보, 별도 승인 필요 |

초기 구현 Issue의 목표 모드는 `dual-write-json-primary`까지만 둔다. `db-primary-json-mirror`와 `db-only`는 DB 적재 검증, 운영 절차, rollback 훈련이 끝난 뒤 별도 Issue에서 다룬다.

## 5. 쓰기 순서

### 5.1 json-only

`json-only`는 현행 방식이다.

```text
HCP 명령
↓
.hcp JSON 쓰기
↓
명령 성공
```

이 모드는 DB 접속 환경 변수가 없거나 DB 검증이 실패한 경우의 기본 fallback이다.

### 5.2 dual-write-json-primary

초기 전환 모드는 JSON을 먼저 쓰고 DB를 보조 저장소로 적재한다.

```text
HCP 명령
↓
.hcp JSON 쓰기
↓
DB upsert / event append
↓
명령 성공 또는 DB 적재 경고
```

쓰기 기준은 다음과 같다.

| 상황 | 처리 |
|---|---|
| JSON 쓰기 성공, DB 쓰기 성공 | 명령 성공 |
| JSON 쓰기 성공, DB 쓰기 실패 | 명령은 성공 처리하되 DB 적재 실패를 경고와 event 후보로 남긴다. |
| JSON 쓰기 실패 | 명령 실패. DB 쓰기를 시도하지 않는다. |
| DB 접속 정보 없음 | `json-only`로 강등하거나 명시 오류를 반환한다. 기본값은 `json-only` 강등이다. |

이 단계에서 DB는 조회 원천이 아니라 검증 가능한 shadow store다.

### 5.3 db-primary-json-mirror

DB를 원천으로 전환하는 단계에서는 DB 쓰기를 먼저 수행하고 JSON은 mirror로 남긴다.

```text
HCP 명령
↓
DB transaction
↓
.hcp JSON mirror 쓰기
↓
명령 성공
```

이 모드는 다음 조건이 충족된 뒤에만 사용할 수 있다.

- `dual-write-json-primary`에서 세션 시작, 태스크 시작, PR 연결, 세션 정리 흐름이 모두 통과했다.
- DB와 JSON 상태 비교 결과가 허용 오차 없이 일치한다.
- DB 접속 실패 시 즉시 `json-only`로 되돌리는 절차가 검증됐다.
- DB backup 또는 migration rollback 절차가 문서화됐다.

## 6. 단계별 전환 기준

| 단계 | 목표 | 진입 조건 | 완료 조건 |
|---|---|---|---|
| 0 | 현행 유지 | 없음 | `json-only`가 기본값으로 동작한다. |
| 1 | 쓰기 어댑터 분리 | HCP 상태 쓰기 지점 식별 | JSON write-store 인터페이스가 기존 동작을 보존한다. |
| 2 | DB shadow write | DSN-009 매핑 기준 확정 | `dual-write-json-primary`에서 DB upsert와 event append가 성공한다. |
| 3 | 비교 검증 | shadow write 누적 | JSON과 DB snapshot 비교 검증이 통과한다. |
| 4 | DB primary 후보 | 비교 검증 반복 성공 | `db-primary-json-mirror` 전환 Issue를 생성할 수 있다. |

단계 1~3은 하나의 구현 Issue로 묶을 수 있지만, 단계 4는 운영 위험이 커서 별도 Issue로 분리한다.

## 7. 실패와 rollback 기준

### 7.1 rollback 트리거

다음 상황이 발생하면 저장 모드를 `json-only`로 되돌린다.

| 트리거 | 기준 |
|---|---|
| DB 접속 실패 | 세션 또는 태스크 시작 명령에서 DB 연결 실패가 반복된다. |
| migration 불일치 | checksum 불일치 또는 필수 HCP 테이블 누락이 확인된다. |
| 상태 불일치 | JSON과 DB의 세션, 태스크, PR 상태가 다르게 기록된다. |
| event 중복 | idempotency 보장 없이 같은 event가 중복 적재된다. |
| 성능 저하 | HCP 명령 시간이 사람이 체감할 정도로 늘어난다. |

### 7.2 rollback 절차

rollback은 다음 순서로 수행한다.

```text
저장 모드 json-only 설정
↓
HCP 명령 재실행
↓
.hcp JSON 상태 정상성 확인
↓
DB 적재 오류 로그 또는 event 후보 보존
↓
DB 재동기화 Issue 후보 분리
```

`dual-write-json-primary` 단계에서는 rollback이 DB row 삭제를 의미하지 않는다. JSON을 기준으로 계속 작업하고, DB row는 후속 재동기화 또는 검증 Issue에서 정리한다.

### 7.3 복구 기준

DB write-store를 다시 활성화하려면 다음 조건을 확인한다.

- DB migration 상태가 기대 버전과 일치한다.
- `hcp.harness_session`, `hcp.harness_task`, `hcp.harness_pull_request`, `hcp.harness_backlog_item`, `hcp.harness_issue`, `hcp.harness_branch`가 존재한다.
- JSON 기준 재동기화 dry-run 결과가 중복 없이 산출된다.
- 실패 원인이 문서 또는 후속 Issue에 남아 있다.

## 8. 구현 분리 기준

후속 구현 Issue는 다음 단위로 나누는 것을 기본으로 한다.

| 후보 | 범위 | 비고 |
|---|---|---|
| HCP write-store 인터페이스 | JSON writer 감싸기, 저장 모드 설정 | 기존 동작 보존이 핵심 |
| DB shadow writer | DSN-009 매핑 기반 upsert/event append | `dual-write-json-primary`까지만 |
| JSON-DB 비교 검증 | 세션 JSON과 DB row 비교 | `db validate` 확장 후보 |
| DB primary 전환 | DB 읽기 원천 전환 | 별도 승인 필요 |
| DB 재동기화 도구 | JSON에서 DB 재적재 | rollback 후 복구용 |

실환경 DB migration 검증 절차는 별도 Issue로 분리한다. write-store 구현은 검증 절차 문서 없이 실환경 DB에 적용하지 않는다.

## 9. 검증 기준

본 설계 문서의 검증 기준은 다음과 같다.

| 검증 | 기준 |
|---|---|
| `git diff --check` | Markdown 공백과 패치 오류가 없다. |
| 문서 링크 확인 | DSN-008, DSN-009, RET-013 링크가 상대 경로로 연결된다. |
| 범위 확인 | 실제 write-store 코드와 DB DDL 변경이 포함되지 않는다. |
| 전환 정책 확인 | 저장 모드, 쓰기 순서, rollback 기준이 문서화되어 있다. |
| 후속 분리 확인 | 구현과 실환경 DB 검증이 별도 후보로 남아 있다. |

후속 구현 Issue의 검증 기준은 별도로 정의한다. 최소 기준은 `npm test`, `npm run check`, `git diff --check`, JSON-DB fixture 비교 테스트다.

## 10. 관련 문서

- [DSN-008 DB 테이블 설계서](./DSN-008_DB_테이블_설계서.md)
- [DSN-009 HCP JSON DB 매핑 설계](./DSN-009_HCP_JSON_DB_매핑_설계.md)
- [RET-013 014_HCP_DB저장소_기반구성 회고](../12.회고/RET-013_2026-07-16_014_HCP_DB저장소_기반구성_회고.md)
- [Backlog 미해결 인덱스](../15.로그/backlog/README.md)

[목차로 이동](#목차)

---

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-16 | [#108](https://github.com/jkoogit/jkadh/issues/108) | Codex | GPT-5 | CTO | jk / Codex | Create | HCP DB write-store 전환 정책, 저장 모드, rollback 기준 설계 초안 작성 |
