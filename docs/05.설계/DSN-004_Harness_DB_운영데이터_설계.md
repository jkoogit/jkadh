# DSN-004 Harness DB 운영데이터 설계

| 항목 | 값 |
|---|---|
| 문서 ID | DSN-004 |
| 문서 유형 | 설계 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/ret-009-backlog-index-sync |
| 최종 수정일 | 2026-07-13 |

## 목차

- [1. 목적](#1-목적)
- [2. 적용 범위](#2-적용-범위)
- [3. 설계 기준](#3-설계-기준)
- [4. 환경별 DB](#4-환경별-db)
- [5. Schema 구성](#5-schema-구성)
- [6. 사전 관리 모델](#6-사전-관리-모델)
- [7. 명명 규칙](#7-명명-규칙)
- [8. 공통 메타 컬럼](#8-공통-메타-컬럼)
- [9. 초기 엔티티 후보](#9-초기-엔티티-후보)
- [10. pgvector 활용 기준](#10-pgvector-활용-기준)
- [11. 운영 전 확인 항목](#11-운영-전-확인-항목)
- [12. 관련 문서](#12-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 JKADH Harness 운영데이터를 PostgreSQL에 저장하기 위한 초기 DB 설계 기준을 정의한다.

현재 `.hcp` JSON 파일은 세션 상태를 빠르게 기록하기에는 충분하지만, active 세션, 태스크, Issue, PR, Backlog, 회고, 문서 인덱스 상태가 자주 바뀔수록 Git 변경과 운영 상태가 섞인다. 따라서 runtime 상태는 DB에 저장하고, 공식 문서와 종료 스냅샷은 Git 산출물로 남기는 구조를 목표로 한다.

## 2. 적용 범위

본 문서는 다음 영역에 적용한다.

- HCP 세션 상태와 태스크 상태 저장
- Work Order, 검증, 리뷰, 보고, Token 사용량 저장
- Issue, PR, Backlog, 회고, 문서 인덱스 연결 상태 저장
- 단어사전, 용어사전, 도메인사전, 공통코드사전 관리
- pgvector 기반 유사 문서 검색 보조 구조

다음 항목은 본 문서에서 확정하지 않는다.

- 실제 Docker compose 파일
- DB 사용자 비밀번호와 Secret 저장 방식
- 운영 서버 방화벽 세부 정책
- 애플리케이션 API 상세 명세
- 모든 테이블의 최종 DDL

## 3. 설계 기준

DB 설계는 다음 기준을 따른다.

- PostgreSQL을 기본 저장소로 사용한다.
- 정확성이 필요한 상태값은 관계형 컬럼과 제약으로 관리한다.
- 아직 스키마가 자주 바뀌는 세부 payload는 JSONB로 보조 저장한다.
- 의미 기반 검색은 pgvector를 보조로 사용하되, 상태 판정에는 사용하지 않는다.
- 문서와 대화에 흩어진 작업 맥락은 Work Order, Session, Task, Report 기준으로 연결한다.
- 용어, 단어, 도메인, 공통코드는 DB로 관리할 수 있게 별도 schema를 둔다.
- PDFowers 데이터관리 기준의 사전 체계, 공통 메타 컬럼, PostgreSQL + Drizzle ORM 방향을 JKADH Harness에 맞게 재사용한다.

## 4. 환경별 DB

환경별 DB명은 다음과 같이 사용한다.

| 환경 | 브랜치 기준 | DB명 | 용도 |
|---|---|---|---|
| 개발 | `dev` | `jkadh_dev` | 개발 중인 HCP와 Harness 운영데이터 검증 |
| 검증 | `stg` | `jkadh_stg` | 승급 전 검증과 마이그레이션 리허설 |
| 운영 | `main` | `jkadh_prd` | 운영 후보 또는 실제 운영 상태 저장 |

DB는 환경별로 분리한다. 하나의 DB 안에서 schema만 `dev/stg/prd`로 나누면 설정은 단순하지만, 실수로 운영 데이터를 수정할 위험이 커진다. 초기에는 DB 단위 분리를 기본안으로 둔다.

## 5. Schema 구성

각 DB 안의 schema는 책임별로 나눈다.

| Schema | 책임 | 예시 테이블 |
|---|---|---|
| `session_ref` | 단어, 용어, 도메인, 공통코드 사전 | `word_entry`, `term_entry`, `domain_entry`, `common_code` |
| `session_hcp` | HCP 세션, 태스크, 상태 전이 | `harness_session`, `session_task`, `session_event` |
| `session_ops` | Work Order, 배정, 검증, 리뷰, 보고, Token | `work_order`, `assignment`, `verification`, `review`, `operation_report`, `token_usage` |
| `session_doc` | 공식 문서, 회고, Backlog, 인덱스 상태 | `document`, `retrospective`, `backlog_item`, `document_index_state` |
| `session_audit` | 감사 로그와 변경 이력 | `audit_log`, `change_log` |
| `session_search` | 임베딩과 유사도 검색 보조 | `document_chunk`, `embedding_index` |

schema 분리는 물리 DB 분리가 아니라 책임 경계다. 하나의 Harness API가 여러 schema를 함께 사용할 수 있다.

schema명은 업무명 접두어 `session_`을 붙인다. 이는 같은 PostgreSQL 인스턴스 안에 다른 Harness 업무나 제품 업무 schema가 함께 들어오더라도 책임 경계가 섞이지 않게 하기 위한 기준이다.

## 6. 사전 관리 모델

단어, 용어, 도메인은 문서로만 두지 않고 DB 관리 대상으로 승격할 수 있다. 초기 목적은 명명 충돌을 줄이고, 테이블/컬럼/API/문서 용어가 같은 뜻으로 쓰이는지 추적하는 것이다.

| 사전 | 책임 | DB 관리 대상 |
|---|---|---|
| 단어사전 | 허용 단어와 금지 축약어 관리 | `word_entry` |
| 용어사전 | 업무 의미가 있는 명칭 관리 | `term_entry` |
| 도메인사전 | 물리 타입, 길이, 제약, 표현 기준 관리 | `domain_entry` |
| 공통코드사전 | 상태, 유형, 이벤트 코드값 관리 | `common_code` |

초기 테이블 후보는 다음과 같다.

| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `session_ref.word_entry` | `word_entry_uuid`, `word_name`, `word_status_cd`, `allowed_abbreviation`, `description` | 표준 단어와 금지/허용 축약어 |
| `session_ref.term_entry` | `term_entry_uuid`, `term_name`, `english_name`, `term_type_cd`, `definition`, `source_document_id` | 업무 용어와 의미 |
| `session_ref.domain_entry` | `domain_entry_uuid`, `domain_name`, `physical_type`, `length_value`, `precision_value`, `scale_value`, `constraint_json` | 물리 타입과 제약 |
| `session_ref.common_code` | `code_group_cd`, `code_cd`, `code_label`, `code_description`, `sort_order`, `is_active` | 상태/유형 코드값 |

사전 변경은 단순 데이터 변경이 아니라 스키마, API, 문서 의미를 바꿀 수 있다. 따라서 변경 이력과 영향 문서를 함께 남긴다.

## 7. 명명 규칙

명명 규칙은 PDFowers 데이터관리 기준을 기반으로 JKADH Harness에 맞게 적용한다.

| 항목 | 규칙 | 예시 |
|---|---|---|
| 테이블명 | 단수 개념을 사용하고 업무 의미를 명확히 한다 | `work_order`, `harness_session`, `session_task` |
| 컬럼명 | 표준 용어를 `snake_case`로 쓴다 | `session_name`, `branch_name`, `completion_criteria` |
| 내부 식별자 | UUID 내부 식별자는 `_uuid` 접미사를 사용한다 | `session_uuid`, `work_order_uuid` |
| 외부 원문 ID | 외부 시스템이 제공한 원문 식별자는 `_id`를 허용한다 | `github_issue_id`, `provider_user_id` |
| 상태 코드 | 상태값 컬럼은 `_status_cd` 접미사를 사용한다 | `session_status_cd`, `task_status_cd` |
| 유형 코드 | 유형값 컬럼은 `_type_cd` 접미사를 사용한다 | `event_type_cd`, `document_type_cd` |
| 번호 | 사람이 쓰는 외부 번호는 `_no` 또는 원천 의미를 유지한다 | `github_issue_no`, `pull_request_no` |
| 여부값 | DB 저장은 boolean을 우선 사용한다 | `is_active`, `is_archived` |
| 날짜 | 날짜만 저장하는 값은 `_dt` 접미사를 사용한다 | `due_dt` |
| 일시 | 시각 포함 값은 `_at` 접미사를 사용한다 | `created_at`, `closed_at` |
| JSONB | JSON payload는 `_json` 접미사를 사용한다 | `metadata_json`, `payload_json` |

`status`처럼 짧은 일반명은 테이블 안에서만 의미가 명확해 보여도 전체 쿼리와 로그에서는 혼동된다. Harness 운영데이터에서는 `session_status_cd`, `task_status_cd`, `report_status_cd`처럼 대상 의미를 붙인다.

## 8. 공통 메타 컬럼

주요 영속 테이블은 다음 공통 메타 컬럼을 가진다.

| 컬럼 | 의미 |
|---|---|
| `created_sys` | 최초 등록 시스템 |
| `created_at` | 최초 등록 일시 |
| `created_by` | 최초 등록 주체 |
| `updated_sys` | 최종 수정 시스템 |
| `updated_at` | 최종 수정 일시 |
| `updated_by` | 최종 수정 주체 |
| `version` | 낙관적 잠금과 변경 충돌 감지용 버전 |

append-only 로그 테이블은 `updated_*`, `version`을 생략할 수 있다. 예를 들어 `session_audit.audit_log`, `session_hcp.session_event`는 생성 이후 수정하지 않는 것을 기본 원칙으로 둔다.

## 9. 초기 엔티티 후보

초기 구현은 `.hcp` 세션 상태 파일을 DB로 옮기는 범위부터 시작한다.

| 영역 | 테이블 | 책임 |
|---|---|---|
| HCP | `session_hcp.harness_session` | 세션 번호, 세션명, agent, 상태, 시작/종료 일시 |
| HCP | `session_hcp.session_task` | 태스크명, Issue, 브랜치, PR, 상태, 완료 조건 |
| HCP | `session_hcp.session_event` | 세션/태스크 상태 변경 이벤트 |
| 운영 | `session_ops.work_order` | 목적, 범위, 제외 범위, 완료 조건, 검증 방법 |
| 운영 | `session_ops.verification` | 검증 명령, 결과, 근거, 미검증 항목 |
| 운영 | `session_ops.operation_report` | 작업 요약, 수용 상태, 후속 작업 |
| 문서 | `session_doc.document` | 공식 문서 ID, 문서명, 유형, 상태, 경로 |
| 문서 | `session_doc.document_index_state` | README 인덱스 포함 여부, 누락 탐지 결과 |
| 문서 | `session_doc.backlog_item` | Backlog ID, 상태, 처리시점, 우선순위, 연결 Issue |
| 감사 | `session_audit.audit_log` | 외부 시스템 쓰기, 상태 변경, 권한 영향 작업 기록 |

정확성이 필요한 연결은 컬럼으로 둔다. 예를 들어 `github_issue_no`, `branch_name`, `pull_request_no`, `document_id`, `backlog_id`는 JSONB 안에만 숨기지 않는다.

## 10. pgvector 활용 기준

pgvector는 보조 검색에만 사용한다.

적합한 용도는 다음과 같다.

- 유사 Backlog 중복 후보 검색
- 유사 회고와 실패 사례 검색
- 관련 공식 문서 추천
- 자연어 질문에서 후보 문서 찾기
- Issue 생성 전 유사 작업 후보 확인

부적합한 용도는 다음과 같다.

- active 세션 판정
- 태스크 완료 여부 판단
- Issue/PR 연결 확정
- 문서 인덱스 현행 여부 판단
- dev/stg/main 정렬 여부 판단
- 권한 게이트 통과 여부 판단

판정은 관계형 데이터와 규칙 기반 검증으로 수행하고, vector 검색 결과는 후보로만 사용한다.

## 11. 운영 전 확인 항목

Ubuntu Docker PostgreSQL 서버 확인 전에는 실제 DB 생성과 마이그레이션을 실행하지 않는다.

확인할 항목은 다음과 같다.

| 항목 | 확인 방법 | 기준 |
|---|---|---|
| 서버 IP | `ip addr` 또는 공유기 DHCP 예약 | 접속 대상 IP 확정 |
| Docker 컨테이너 | `docker ps` | PostgreSQL 컨테이너 실행 |
| 포트 매핑 | `docker port <container>` | 호스트 포트가 외부 접속 가능 |
| 방화벽 | `sudo ufw status` | 관리 PC에서 DB 포트 허용 |
| pgvector | `CREATE EXTENSION IF NOT EXISTS vector;` 또는 `\dx` | 각 DB에 vector 확장 가능 |
| DB 계정 | `psql` 접속 | `jkadh_dev/stg/prd` 생성 권한 확인 |

DB가 연결되면 다음 순서로 진행한다.

1. `jkadh_dev`, `jkadh_stg`, `jkadh_prd` 생성
2. schema `session_ref`, `session_hcp`, `session_ops`, `session_doc`, `session_audit`, `session_search` 생성
3. `vector` 확장 활성화
4. 사전 테이블과 공통코드 테이블부터 생성
5. HCP 세션/태스크 테이블 생성
6. `.hcp` JSON 상태의 DB 저장 전환 범위 결정

## 12. 관련 문서

- [DSN-001 Harness 운영 모델](./DSN-001_Harness_운영_모델.md)
- [DSN-002 Harness 운영데이터 API 서비스](./DSN-002_Harness_운영데이터_API_서비스.md)
- [REF-001 AI서비스플랫폼 용어사전](../16.참고/REF-001_AI서비스플랫폼_용어사전.md)
- [POL-001 문서관리방안](../03.정책/POL-001_문서관리방안.md)
- [Backlog 미해결 인덱스](../15.로그/backlog/README.md)

[목차로 이동](#목차)

---

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-13 | [#76](https://github.com/jkoogit/jkadh/issues/76) | Codex | GPT-5 | CTO | jk / Codex | Create | PDFowers 데이터관리 기준을 참고해 JKADH Harness PostgreSQL 운영데이터 설계 초안 작성 |
