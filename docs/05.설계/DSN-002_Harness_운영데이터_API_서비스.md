# DSN-002 Harness 운영데이터 API 서비스

| 항목 | 값 |
|---|---|
| 문서 ID | DSN-002 |
| 문서 유형 | 설계 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | CTO 에이전트 |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/007-vision-goals |
| 최종 수정일 | 2026-07-05 |

## 목차

- [1. 목적](#1-목적)
- [2. 적용 범위](#2-적용-범위)
- [3. 설계 원칙](#3-설계-원칙)
- [4. 구성 요소](#4-구성-요소)
- [5. 최소 엔티티](#5-최소-엔티티)
- [6. 데이터 흐름](#6-데이터-흐름)
- [7. API 후보](#7-api-후보)
- [8. 스킬 후보](#8-스킬-후보)
- [9. 초기 구현 범위](#9-초기-구현-범위)
- [10. 판단 지표](#10-판단-지표)
- [11. 관련 문서](#11-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 Harness가 Work Order, Token Usage, 에이전트 배정, 검증, 리뷰, 재작업 이력을 축적하고 조회하기 위한 운영데이터 저장소와 API 서비스의 초기 설계 방향을 정의한다.

이 문서는 대형 플랫폼 전체 구현 설계가 아니다. 수동 운영에서 반복되는 기록과 판단을 서비스화하기 위해 어떤 데이터를 저장하고 어떤 API 경계를 둘지 정리하는 초안이다.

## 2. 적용 범위

본 문서는 다음 기능 영역에 적용한다.

- Work Order 저장과 상태 추적
- 에이전트 역할 배정 기록
- Token Budget과 Token Usage 기록
- 검증, 리뷰, 수용 후보 판단 기록
- 수정결과 개선사항 분석 기록
- Harness Report 생성에 필요한 운영데이터 조회
- 향후 스킬과 API 프로세스로 반복할 작업 후보 정리

다음 항목은 본 문서에서 확정하지 않는다.

- 실제 DB 제품
- 인증과 권한 모델의 상세 구현
- 외부 AI API별 사용량 수집 구현
- UI Dashboard 상세 화면
- 자동 배정 알고리즘
- 자동 PR 병합 또는 자동 승급

## 3. 설계 원칙

운영데이터 API 서비스의 설계 원칙은 다음과 같다.

- 문서와 대화에 흩어진 작업 맥락을 추적 가능한 데이터로 남긴다.
- Token Usage는 비용 데이터뿐 아니라 품질 개선 데이터로 활용한다.
- Work Order, 배정, 검증, 리뷰, 보고는 같은 작업 ID로 연결한다.
- 외부 AI API 수집 데이터와 내부 운영 판단 데이터를 구분한다.
- 초기 구현은 수동 운영을 대체할 수 있는 최소 저장과 조회에 집중한다.
- 자동 추천은 저장된 이력과 기준 문서가 충분히 쌓인 뒤 확장한다.
- 사람 승인 경계와 결과 수용 기준을 우회하지 않는다.

## 4. 구성 요소

초기 서비스는 다음 구성 요소로 나눈다.

| 구성 요소 | 책임 |
|---|---|
| Work Order Store | 작업 목적, 범위, 상태, 완료 조건, 중단 조건을 저장한다. |
| Assignment Store | 주 담당 역할, 보강 역할, AI 개발자, 배정 사유를 저장한다. |
| Token Store | Token Budget, Token Usage, Token 상태, 수집 출처를 저장한다. |
| Verification Store | 검증 명령, 검증 결과, 미검증 항목, 실패 사유를 저장한다. |
| Review Store | 리뷰 결과, 수정 요청, 수용 여부, 재작업 이력을 저장한다. |
| Insight Store | 수정결과 개선사항 분석, 리팩토링 후보, 구현 Backlog 후보를 저장한다. |
| Report Store | Harness Report와 후속 흐름을 저장한다. |
| API Layer | 저장소 접근과 Harness 프로세스를 위한 API를 제공한다. |
| Skill Interface | 반복 작업을 스킬이나 명령형 절차로 호출할 수 있게 한다. |

각 Store는 구현상 하나의 DB에 들어갈 수 있지만, 설계상 책임은 분리한다.

## 5. 최소 엔티티

초기 운영데이터 저장소의 최소 엔티티는 다음과 같다.

| 엔티티 | 주요 필드 | 연결 대상 |
|---|---|---|
| WorkOrder | id, title, purpose, scope, exclusions, status, completion_criteria, stop_conditions | Assignment, TokenUsage, Verification, Report |
| Assignment | id, work_order_id, primary_role, support_roles, agent_candidate, rationale, capability_fit | WorkOrder, TokenUsage |
| TokenUsage | id, work_order_id, assignment_id, budget_type, budget_value, usage_value, token_status, source | WorkOrder, Assignment, Report |
| Verification | id, work_order_id, method, command_or_check, result, evidence, gap | WorkOrder, Report |
| Review | id, work_order_id, reviewer_role, finding, severity, action_required, resolved_state | WorkOrder, Report |
| ChangeInsight | id, work_order_id, report_state, common_cause, design_candidate, refactor_candidate, backlog_candidate | WorkOrder, Report |
| Report | id, work_order_id, summary, acceptance_state, token_summary, follow_up, created_at | WorkOrder |
| BacklogLink | id, work_order_id, backlog_id, reason, state | WorkOrder, Backlog |

필드명은 구현 스키마가 아니라 개념 필드다. 실제 DB 설계에서는 자료형, 인덱스, 정규화 수준을 별도 문서에서 정의한다.

## 6. 데이터 흐름

Harness 운영데이터의 기본 흐름은 다음과 같다.

```text
Issue 또는 Backlog 후보
↓
Work Order 생성
↓
역할 배정 기록
↓
Token Budget 설정
↓
작업 실행과 Token Usage 수집
↓
검증과 리뷰 결과 저장
↓
수정결과 개선사항 분석 저장
↓
Harness Report 생성
↓
Backlog, PR, 후속 Issue 연결
```

외부 AI API에서 수집한 Token Usage는 Token Store에 들어가지만, 내부 판단 상태는 Work Order, Assignment, Verification, Report와 함께 연결되어야 한다.

## 7. API 후보

초기 API 후보는 다음과 같다.

| API | 목적 | 처리 |
|---|---|---|
| `POST /work-orders` | Work Order 생성 | 목적, 범위, 완료 조건, 중단 조건 저장 |
| `GET /work-orders/{id}` | Work Order 조회 | 연결된 배정, Token, 검증, 보고 요약 포함 |
| `PATCH /work-orders/{id}/status` | 작업 상태 갱신 | Harness 상태 전이 기록 |
| `POST /assignments` | 역할 배정 기록 | 주 담당, 보강 역할, 배정 근거 저장 |
| `POST /token-usages` | Token 사용량 기록 | 외부 API 또는 수동 보고 사용량 저장 |
| `GET /work-orders/{id}/token-status` | Token 상태 조회 | 예산, 사용량, 상태 판단 반환 |
| `POST /verifications` | 검증 결과 기록 | 명령, 점검, 결과, 근거 저장 |
| `POST /reviews` | 리뷰 결과 기록 | 결함, 리스크, 수정 요청 저장 |
| `POST /change-insights` | 수정결과 개선사항 분석 기록 | 설계 개선, 리팩토링, Backlog 후보 저장 |
| `POST /reports` | Harness Report 생성 또는 저장 | 작업 요약, 수용 판단, 후속 흐름 저장 |
| `GET /metrics/agent-capability` | 역할별 운영 지표 조회 | 배정, 재작업, 검증 결과 집계 |

초기 API는 내부 운영 API로 본다. 외부 공개 API 또는 사용자용 API로 확정하지 않는다.

## 8. 스킬 후보

반복되는 Harness 작업은 다음 스킬 후보로 분리할 수 있다.

| 스킬 후보 | 목적 | 입력 | 출력 |
|---|---|---|---|
| Work Order Builder | 모호한 요청을 실행 가능한 Work Order로 변환 | 사용자 요청, 관련 문서 | Work Order 초안 |
| Assignment Recommender | 작업 성격과 난이도에 맞는 역할 배치 제안 | Work Order, ORG-003 | 역할 배치 후보 |
| Token Reporter | Token Budget과 Usage를 기록하고 상태 판단 | Token Usage, OPS-001 | Token 상태와 조정 제안 |
| Verification Collector | 검증 근거를 수집하고 완료 조건과 연결 | 검증 명령, 결과 | 검증 요약 |
| Change Insight Reporter | 수정결과 개선사항 분석 작성 | diff, 변경 파일, CHK-004 | 인사이트와 Backlog 후보 |
| Harness Reporter | 작업 결과를 Report로 정리 | Work Order, 검증, 리뷰, Token, 인사이트 | Harness Report |

스킬은 서비스 API를 대체하지 않는다. 스킬은 반복 작업의 실행 인터페이스이고, API는 상태 저장과 조회 경계다.

## 9. 초기 구현 범위

초기 구현이 필요해질 경우 다음 범위부터 시작한다.

- Work Order 저장
- 역할 배정 기록
- Token Usage 수동 입력 또는 API 수집 결과 저장
- 검증 결과 저장
- Harness Report 저장
- Backlog 연결 기록

초기 구현에서 제외할 항목은 다음과 같다.

- 자동 배정 알고리즘
- 외부 AI별 완전 자동 Token 수집
- 대시보드 UI
- 비용 예측 모델
- 자동 병합 또는 자동 승급
- 장기 통계 기반 품질 예측

초기 목표는 자동화보다 누락 없는 운영 기록이다.

## 10. 판단 지표

운영데이터가 쌓이면 다음 지표를 확인할 수 있다.

| 지표 | 의미 | 활용 |
|---|---|---|
| 작업별 Token Usage | 작업 유형별 Token 소모량 | 작업 분해와 예산 추정 |
| 역할별 재작업률 | 역할 또는 배정별 재작업 발생 비율 | 배정 기준 보정 |
| 검증 실패 빈도 | 검증 단계에서 실패한 횟수 | Work Order 품질 개선 |
| 리뷰 보강 빈도 | 리뷰에서 수정 요청이 발생한 비율 | QA/리뷰 보강 판단 |
| Backlog 전환 빈도 | 작업 중 후속 Backlog가 발생한 비율 | 범위 설정 개선 |
| 중단 사유 분포 | Stop(중단) 또는 Deferred(보류) 원인 | 정책, Token, 승인 기준 개선 |

지표는 자동 평가를 위한 최종 기준이 아니라 운영 개선을 위한 관찰 지표다.

## 11. 관련 문서

- [DSN-001 Harness 운영 모델](./DSN-001_Harness_운영_모델.md)
- [ORG-003 Agent Capability Matrix](../02.조직/ORG-003_Agent_Capability_Matrix.md)
- [OPS-001 Token 운영](../10.운영/OPS-001_Token_운영.md)
- [CHK-004 수정결과 개선사항 분석 기준](../11.점검/CHK-004_수정결과_개선사항_분석_기준.md)
- [POL-005 사람 승인 경계 정책](../03.정책/POL-005_사람_승인_경계_정책.md)
- [POL-006 근거 기반 결과 수용 기준](../03.정책/POL-006_근거_기반_결과_수용_기준.md)
- [Backlog 미해결 인덱스](../15.로그/backlog/README.md)

[목차로 이동](#목차)

---

## 작업 이력

| 작업일시 | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|
| 2026-07-05 | Codex | GPT-5 | CTO | jk / Codex | Create | Harness 운영데이터 저장소와 API 서비스 초기 설계 작성 |
| 2026-07-08 | Codex | GPT-5 | CTO | jk / Codex | Revise | 공식 문서 Header 표 형식 현행화 |
