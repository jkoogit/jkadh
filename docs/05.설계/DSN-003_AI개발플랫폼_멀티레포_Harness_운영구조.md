# DSN-003 AI개발플랫폼 멀티레포 Harness 운영구조

| 항목 | 값 |
|---|---|
| 문서 ID | DSN-003 |
| 문서 유형 | 설계 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | CTO 에이전트 |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/058-harness-boundary-rules |
| 최종 수정일 | 2026-07-12 |

## 목차

- [1. 목적](#1-목적)
- [2. 적용 범위](#2-적용-범위)
- [3. 기본 방향](#3-기본-방향)
- [4. Repo 경계](#4-repo-경계)
- [5. Harness Control Plane](#5-harness-control-plane)
- [6. ProjectProfile](#6-projectprofile)
- [7. WorkOrder](#7-workorder)
- [8. AI Provider와 Agent 할당](#8-ai-provider와-agent-할당)
- [9. 권한과 승인](#9-권한과-승인)
- [10. Harness 강제와 중단 경계](#10-harness-강제와-중단-경계)
- [11. 샘플 서비스 프로젝트 적용](#11-샘플-서비스-프로젝트-적용)
- [12. 한 턴 실행 사이클](#12-한-턴-실행-사이클)
- [13. 초기 구현 방향](#13-초기-구현-방향)
- [14. 후속 검토 항목](#14-후속-검토-항목)
- [15. 관련 문서](#15-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 JKADH AI개발플랫폼이 별도 서비스 프로젝트를 지원하기 위한 멀티 repo 기반 Harness 운영구조를 정의한다.

JKADH는 서비스 프로젝트의 코드 저장소가 아니라 에이전트, 스킬, Harness, Work Order, 권한, 검증, Report를 관리하는 AI 개발 운영 플랫폼으로 둔다.

## 2. 적용 범위

본 문서는 다음 범위에 적용한다.

- JKADH 플랫폼 repo와 서비스 프로젝트 repo의 경계
- 서비스 프로젝트 참조 방식
- Harness Control Plane의 최소 책임
- WorkOrder, ProjectProfile, ProviderProfile, PermissionProfile의 기본 구조
- AI Provider와 에이전트 역할 분리
- 샘플 서비스 프로젝트를 기준으로 한 적용 예시
- 한 턴 실행 사이클의 통제 지점

다음 항목은 본 문서에서 구현하지 않는다.

- Harness CLI 실제 구현
- 서비스 프로젝트 코드 수정
- AI Provider 계정 연동 구현
- 백엔드 API 서버 구현
- 다중 에이전트 자동 오케스트레이션
- 토큰 사용량 자동 수집

## 3. 기본 방향

JKADH는 장기적으로 에이전트 오케스트레이션을 제공할 수 있지만, 초기에는 실행 엔진보다 Control Plane을 먼저 만든다.

초기 Control Plane은 다음 질문에 답할 수 있어야 한다.

- 어떤 서비스 프로젝트를 대상으로 하는가?
- 작업은 플랫폼 작업인가, 서비스 작업인가, 연결 작업인가?
- 어떤 에이전트 역할이 수행하는가?
- 어떤 AI Provider/Profile을 사용할 수 있는가?
- 어떤 파일, GitHub, Git 작업 권한이 있는가?
- 어떤 브랜치와 검증 기준을 사용해야 하는가?
- 결과와 근거를 어디에 남길 것인가?

## 4. Repo 경계

JKADH 플랫폼 repo와 서비스 프로젝트 repo는 별도 repo로 관리한다.

```text
workspace/
  jkadh/             # AI 개발 플랫폼 repo
  sample-service/    # 샘플 서비스 프로젝트 repo
  other-service/     # 후속 서비스 프로젝트 repo
```

JKADH는 서비스 프로젝트 코드를 직접 포함하지 않는다. Harness는 ProjectProfile을 통해 서비스 프로젝트의 GitHub repo와 로컬 경로를 참조한다.

작업 유형은 다음처럼 구분한다.

| 작업 유형 | 대상 | 예시 |
|---|---|---|
| platform | JKADH 플랫폼 자체 | Harness, 정책, 에이전트, 스킬, Provider Profile |
| service | 서비스 프로젝트 | 기능 구현, 테스트, 버그 수정 |
| integration | 플랫폼과 서비스 프로젝트 연결 | ProjectProfile 등록, Harness 적용, Report 수집 |

작업 유형이 둘 이상이면 기본적으로 Issue와 PR을 분리한다. 분리하지 않을 경우 WorkOrder에 혼합 사유와 변경 경계를 명시한다.

## 5. Harness Control Plane

Harness Control Plane은 에이전트를 자동 실행하는 엔진이 아니라 작업을 통제 가능한 단위로 정의하고 기록하는 계층이다.

초기 책임은 다음과 같다.

- ProjectProfile 관리
- WorkOrder 생성과 검증
- AgentRole과 ProviderProfile 매핑
- PermissionProfile 확인
- feature branch 기본 전략 확인
- 검증 결과와 Report 기록
- 서비스 프로젝트 작업과 JKADH 플랫폼 작업의 경계 확인

초기에는 백엔드 API 서버보다 TypeScript CLI와 JSON 저장을 우선 후보로 둔다. 이 방식은 구현 비용이 낮고, 샘플 서비스 프로젝트를 대상으로 한 한 턴 사이클을 빠르게 검증할 수 있다.

## 6. ProjectProfile

ProjectProfile은 Harness가 서비스 프로젝트를 참조하기 위한 최소 정보다.

```json
{
  "project_id": "sample-service",
  "display_name": "Sample Service",
  "repo_full_name": "owner/sample-service",
  "local_path": "../sample-service",
  "default_base_branch": "main",
  "branch_strategy": "feature",
  "allowed_work_types": ["service", "integration"],
  "harness_enabled": true
}
```

초기에는 로컬 경로와 GitHub repo를 함께 사용한다.

- 로컬 작업: `local_path`
- Issue/PR 추적: `repo_full_name`
- 브랜치 기준: `default_base_branch`
- 작업 방식: `branch_strategy`

## 7. WorkOrder

WorkOrder는 사용자 요청을 실행 가능한 작업 단위로 변환한 기록이다.

초기 필드는 다음을 기준으로 한다.

```json
{
  "work_order_id": "WO-0001",
  "work_type": "service",
  "target_project": "sample-service",
  "target_repo": "owner/sample-service",
  "target_path": "../sample-service",
  "agent_role": "implementer",
  "provider_profile": "codex-default",
  "permission_profile": "feature_write",
  "scope": "서비스 프로젝트 기능 구현",
  "out_of_scope": "JKADH 플랫폼 정책 변경",
  "completion_criteria": ["기능 구현", "테스트 통과", "Report 작성"],
  "verification": ["테스트 실행", "diff 확인"],
  "approval_gate": "PR 생성 후 사람 확인"
}
```

WorkOrder는 플랫폼 작업과 서비스 작업의 경계를 명시해야 한다. 서비스 프로젝트 작업에서 JKADH 정책 변경이 필요해지면 별도 platform 작업으로 분리한다.

## 8. AI Provider와 Agent 할당

에이전트 역할과 AI Provider는 직접 결합하지 않는다. 역할은 필요한 능력과 권한을 정의하고, ProviderProfile은 실제 실행 환경을 정의한다.

```text
AgentRole
  ↓
ProviderProfile
  ↓
CredentialRef
  ↓
PermissionProfile
  ↓
BudgetPolicy
  ↓
AuditLog
```

ProviderProfile 예시는 다음과 같다.

```json
{
  "provider_profile_id": "codex-default",
  "provider": "codex",
  "execution_mode": "workspace_agent",
  "credential_ref": "managed:codex-session",
  "allowed_tools": ["filesystem", "shell", "git", "github"],
  "default_model": "gpt-5",
  "usage_tracking": "manual"
}
```

초기 검토 대상은 다음과 같다.

| Provider | 초기 역할 후보 | 비고 |
|---|---|---|
| Codex | 저장소 작업, 문서/코드 수정, PR 흐름 | 초기 기본 실행자 |
| OpenAI API | WorkOrder/Report 구조화, 분류 | API 키 관리 필요 |
| Claude 또는 Claude Code | 긴 문서 검토, 보조 리뷰 | 계정/실행 방식 검토 필요 |
| Gemini | 리서치, 대체 검토 | 계정/도구 연결 검토 필요 |
| GitHub Copilot coding agent | 서비스 프로젝트 구현 보조 | GitHub 권한 모델 검토 필요 |

## 9. 권한과 승인

권한은 에이전트 역할별로 부여한다. 초기 PermissionProfile은 세 단계로 둔다.

| 권한 프로필 | 허용 범위 | 제한 |
|---|---|---|
| read_only | 읽기, 분석, 보고 | 파일 수정, GitHub 쓰기 불가 |
| feature_write | feature branch 생성, 파일 수정, 커밋, push, PR 생성 | dev/stg/main 직접 영향 불가 |
| maintainer | PR Ready/병합, dev 반영, stg/main 승급, Issue 종료 | 게이트와 명시 태그 필요 |

서비스 프로젝트 코드는 기본적으로 feature branch에서 수정한다. `dev`, `stg`, `main` 영향 작업은 역할 권한과 태그 게이트가 모두 충족될 때만 수행한다.

API Key, OAuth Token, CLI 로그인 정보 같은 실제 자격증명은 문서나 WorkOrder에 원문으로 저장하지 않는다. Harness에는 `env:OPENAI_API_KEY`, `managed:codex-session` 같은 참조만 남긴다.

## 10. Harness 강제와 중단 경계

Harness는 에이전트의 모든 판단을 대신하지 않는다. 대신 작업 프로세스에서 반드시 지켜야 하는 선행 조건, 중단 조건, 보고 조건을 강제한다.

강제한다는 것은 에이전트가 다음 단계로 넘어가기 전에 해당 조건을 확인해야 하며, 조건이 비어 있으면 작업을 계속하지 않고 정해진 전환 상태로 이동한다는 뜻이다.

초기 Harness가 강제하는 범위는 다음과 같다.

| 강제 대상 | Harness 처리 | 에이전트 허용 범위 |
|---|---|---|
| 작업 식별자 | Issue 또는 WorkOrder 존재를 확인한다. 없으면 생성 단계 또는 Stop으로 전환한다. | 식별자가 확인된 뒤 작업 범위 분석을 수행한다. |
| 범위와 제외 범위 | 수행 범위, 제외 범위, 완료 조건, 검증 방법을 확인한다. | 확인된 범위 안에서 문서 또는 코드 작업을 수행한다. |
| 기준 브랜치 | 기준 브랜치와 작업 브랜치의 관계를 확인한다. | Harness가 허용한 feature branch에서만 수정한다. |
| 작업 유형 | `platform`, `service`, `integration` 중 하나로 분류한다. | 분류된 작업 유형에 맞는 repo와 문서만 수정한다. |
| 권한 프로필 | 현재 작업이 `read_only`, `feature_write`, `maintainer` 중 어느 권한을 요구하는지 확인한다. | 권한 프로필이 허용한 도구와 상태 변경만 수행한다. |
| 검증 근거 | 완료 조건에 맞는 검증 방법과 결과 기록 위치를 확인한다. | 검증을 실행하거나 검증 불가 사유를 보고한다. |
| 후속 연결 | 결과를 Issue, PR, Report, Backlog, 공식 문서 중 하나 이상에 연결한다. | 연결 대상이 정해진 뒤 결과 보고를 작성한다. |

Harness가 멈춰야 하는 조건은 다음과 같다.

| 중단 조건 | 전환 상태 | 이유 |
|---|---|---|
| Issue 또는 WorkOrder 없이 큰 작업을 시작하려는 경우 | Stop 또는 Work Order Build | 추적 가능한 작업 단위가 없다. |
| 범위, 제외 범위, 완료 조건 중 하나가 비어 있는 경우 | Need Clarification | 실행 결과를 검증할 수 없다. |
| 작업 유형이 둘 이상인데 분리 사유가 없는 경우 | Decompose 또는 Need Approval | 플랫폼 작업과 서비스 작업이 한 PR에 섞일 수 있다. |
| `dev`, `stg`, `main`에 직접 영향이 있는데 태그와 권한이 부족한 경우 | Need Approval 또는 Stop | 되돌리기 어려운 상태 변경이다. |
| Secret, 배포, 외부 시스템 쓰기가 필요한 경우 | Need Approval | 사람 승인 필수 조건이다. |
| 검증 방법이 없거나 실패 기록 위치가 없는 경우 | Stop 또는 Review | 수용 후보로 올릴 근거가 없다. |
| 현재 태그의 책임 범위를 넘는 작업이 필요한 경우 | Stop 또는 다음 태그 대기 | 태그별 책임 경계를 넘는 과해석을 막는다. |

Harness가 멈추지 않고 보고만 해야 하는 경우도 있다.

| 상황 | 처리 |
|---|---|
| 작업은 가능하지만 검증이 일부 생략된 경우 | 생략 사유와 잔여 리스크를 Report에 남긴다. |
| 후속 작업 후보가 발견된 경우 | 현재 Issue에 섞지 않고 Backlog 또는 새 Issue 후보로 보고한다. |
| 종료 후보 Issue가 있지만 검증이 불충분한 경우 | 종료하지 않고 보류 사유를 남긴다. |
| PR 병합 또는 승급은 완료됐지만 Issue 종료 조건이 별도인 경우 | Issue 상태를 보고하고 종료는 `#세션정리`로 넘긴다. |

초기 구현에서 Harness는 다음 작업을 자동으로 수행할 수 있다.

- 상태 조회
- 필수 조건 확인
- WorkOrder 또는 Report 초안 생성
- 브랜치명, Issue, PR 연결 정합성 점검
- 태그별 다음 단계 제안

초기 구현에서 Harness가 단독으로 확정하지 않는 작업은 다음과 같다.

- 제품 방향 변경
- 정책 의미 변경
- 서비스 코드 결과의 최종 수용
- Secret 접근
- 배포
- 외부 시스템 쓰기
- 검증 불충분 상태의 Issue 종료

이 경계는 Harness가 소극적으로 동작해야 한다는 뜻이 아니다. 반복되는 절차 오류를 줄이기 위해 Harness는 가능한 한 빨리 멈추고, 멈춘 이유와 다음 가능한 전환을 명확히 보고해야 한다.

## 11. 샘플 서비스 프로젝트 적용

첫 샘플 서비스 프로젝트는 별도 repo로 둔다.

샘플 서비스 프로젝트는 JKADH 안에 포함하지 않고 별도 repo로 관리한다. Harness는 ProjectProfile로 샘플 서비스 프로젝트를 등록하고, WorkOrder의 `target_project`와 `target_repo`를 통해 작업 대상을 고정한다.

현재 검토 중인 샘플 후보는 PDFowers다. 설계 본문에서는 특정 서비스명을 고정하지 않고, 샘플 코드나 실행 예시에서만 PDFowers를 사용할 수 있다.

첫 한 턴 시나리오는 작은 기능 구현으로 제한한다.

예시:

```text
요청: 샘플 서비스 프로젝트에 작은 기능 또는 테스트 가능한 유틸을 추가한다.
↓
WorkOrder 생성
↓
AgentRole/ProviderProfile/PermissionProfile 확인
↓
서비스 프로젝트 feature branch 생성
↓
코드 수정
↓
테스트 실행
↓
Report 생성
↓
PR 생성
↓
사람 승인 대기
```

## 12. 한 턴 실행 사이클

초기 한 턴 실행 사이클은 다음 순서로 정의한다.

```text
사용자 요청
↓
요청 해석 게이트
↓
WorkOrder 생성
↓
작업 유형 판정(platform/service/integration)
↓
ProjectProfile 확인
↓
AgentRole과 ProviderProfile 확인
↓
PermissionProfile과 승인 게이트 확인
↓
대상 repo feature branch 생성
↓
작업 수행
↓
검증 실행
↓
Report 작성
↓
PR 생성 또는 보류 보고
↓
사람 승인 대기
```

초기 목표는 완전 자동 오케스트레이션이 아니다. JKADH가 요청, 역할, 권한, 검증, Report를 통제하고 Codex가 샘플 서비스 프로젝트의 작은 기능을 구현하는 한 턴을 끝까지 기록하는 것이다.

## 13. 초기 구현 방향

초기 구현 후보는 TypeScript CLI와 JSON 저장이다.

```text
packages/harness-cli/
  src/
    commands/
    schemas/
    gate/
    report/
  data/
    projects/
    work-orders/
    reports/
```

초기 CLI 후보는 다음과 같다.

```bash
jkadh project register
jkadh work-order create
jkadh gate check
jkadh report create
```

초기에는 백엔드 API 서버를 만들지 않는다. 여러 에이전트가 동시에 상태를 공유하거나 대시보드, 자동 토큰 수집, 장기 실행 관리가 필요해질 때 SQLite 또는 API 서버로 확장한다.

## 14. 후속 검토 항목

다음 항목은 후속 설계 또는 구현 작업으로 분리한다.

- Harness가 서비스 프로젝트를 clone/fetch까지 자동 수행할지 여부
- ProviderProfile과 실제 계정/키 운영 정책
- 역할별 허용 Provider 매트릭스
- Token Usage 수동 기록과 자동 수집의 경계
- LangGraph, AutoGen, CrewAI, Temporal 같은 실행 엔진 후보 평가
- 샘플 서비스 프로젝트 첫 기능 구현 시나리오 확정
- JSON 저장에서 SQLite 또는 API 서버로 전환하는 기준

## 15. 관련 문서

- [DSN-001 Harness 운영 모델](./DSN-001_Harness_운영_모델.md)
- [DSN-002 Harness 운영데이터 API 서비스](./DSN-002_Harness_운영데이터_API_서비스.md)
- [ORG-003 Agent Capability Matrix](../02.조직/ORG-003_Agent_Capability_Matrix.md)
- [POL-003 Git 작업관리방안](../03.정책/POL-003_Git_작업관리방안.md)
- [OPS-001 Token 운영](../10.운영/OPS-001_Token_운영.md)

[목차로 이동](#목차)

---

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-10 | [#54](https://github.com/jkoogit/jkadh/issues/54) | Codex | GPT-5 | CTO | jk / Codex | Create | 멀티 repo 기반 Harness 운영구조와 샘플 서비스 프로젝트 적용 방향 최초 정리 |
| 2026-07-12 | [#58](https://github.com/jkoogit/jkadh/issues/58) | Codex | GPT-5 | CTO | jk / Codex | Revise | Harness가 강제하는 조건과 중단해야 하는 경계 보강 |
