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
| 작업 브랜치 | task_codex/054-harness-multirepo-structure |
| 최종 수정일 | 2026-07-10 |

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
- [10. PDFowers 샘플 적용](#10-pdfowers-샘플-적용)
- [11. 한 턴 실행 사이클](#11-한-턴-실행-사이클)
- [12. 초기 구현 방향](#12-초기-구현-방향)
- [13. 후속 검토 항목](#13-후속-검토-항목)
- [14. 관련 문서](#14-관련-문서)
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
- PDFowers를 첫 샘플 서비스 프로젝트로 사용하는 방향
- 한 턴 실행 사이클의 통제 지점

다음 항목은 본 문서에서 구현하지 않는다.

- Harness CLI 실제 구현
- PDFowers 코드 수정
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
  PDFowers/          # 첫 샘플 서비스 프로젝트 repo
  other-service/     # 후속 서비스 프로젝트 repo
```

JKADH는 서비스 프로젝트 코드를 직접 포함하지 않는다. Harness는 ProjectProfile을 통해 서비스 프로젝트의 GitHub repo와 로컬 경로를 참조한다.

작업 유형은 다음처럼 구분한다.

| 작업 유형 | 대상 | 예시 |
|---|---|---|
| platform | JKADH 플랫폼 자체 | Harness, 정책, 에이전트, 스킬, Provider Profile |
| service | 서비스 프로젝트 | PDFowers 기능 구현, 테스트, 버그 수정 |
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

초기에는 백엔드 API 서버보다 TypeScript CLI와 JSON 저장을 우선 후보로 둔다. 이 방식은 구현 비용이 낮고, PDFowers를 대상으로 한 한 턴 사이클을 빠르게 검증할 수 있다.

## 6. ProjectProfile

ProjectProfile은 Harness가 서비스 프로젝트를 참조하기 위한 최소 정보다.

```json
{
  "project_id": "pdfowers",
  "display_name": "PDFowers",
  "repo_full_name": "jkoogit/PDFowers",
  "local_path": "../PDFowers",
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
  "target_project": "pdfowers",
  "target_repo": "jkoogit/PDFowers",
  "target_path": "../PDFowers",
  "agent_role": "implementer",
  "provider_profile": "codex-default",
  "permission_profile": "feature_write",
  "scope": "PDFowers 기능 구현",
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

## 10. PDFowers 샘플 적용

첫 샘플 서비스 프로젝트는 같은 GitHub 계정의 PDFowers로 둔다.

PDFowers는 JKADH 안에 포함하지 않고 별도 repo로 관리한다. Harness는 ProjectProfile로 PDFowers를 등록하고, WorkOrder의 `target_project`와 `target_repo`를 통해 작업 대상을 고정한다.

첫 한 턴 시나리오는 작은 기능 구현으로 제한한다.

예시:

```text
요청: PDFowers에 작은 기능 또는 테스트 가능한 유틸을 추가한다.
↓
WorkOrder 생성
↓
AgentRole/ProviderProfile/PermissionProfile 확인
↓
PDFowers feature branch 생성
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

## 11. 한 턴 실행 사이클

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

## 12. 초기 구현 방향

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

## 13. 후속 검토 항목

다음 항목은 후속 설계 또는 구현 작업으로 분리한다.

- Harness가 서비스 프로젝트를 clone/fetch까지 자동 수행할지 여부
- ProviderProfile과 실제 계정/키 운영 정책
- 역할별 허용 Provider 매트릭스
- Token Usage 수동 기록과 자동 수집의 경계
- LangGraph, AutoGen, CrewAI, Temporal 같은 실행 엔진 후보 평가
- PDFowers 첫 기능 구현 시나리오 확정
- JSON 저장에서 SQLite 또는 API 서버로 전환하는 기준

## 14. 관련 문서

- [DSN-001 Harness 운영 모델](./DSN-001_Harness_운영_모델.md)
- [DSN-002 Harness 운영데이터 API 서비스](./DSN-002_Harness_운영데이터_API_서비스.md)
- [ORG-003 Agent Capability Matrix](../02.조직/ORG-003_Agent_Capability_Matrix.md)
- [POL-003 Git 작업관리방안](../03.정책/POL-003_Git_작업관리방안.md)
- [OPS-001 Token 운영](../10.운영/OPS-001_Token_운영.md)
- [PDFowers Repository](https://github.com/jkoogit/PDFowers)

[목차로 이동](#목차)

---

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-10 | [#54](https://github.com/jkoogit/jkadh/issues/54) | Codex | GPT-5 | CTO | jk / Codex | Create | 멀티 repo 기반 Harness 운영구조와 PDFowers 샘플 적용 방향 최초 정리 |
