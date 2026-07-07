# TPL-002 Backlog 템플릿

> 문서 ID: TPL-002
> 문서 유형: 템플릿
> 상태: Draft
> 성숙도: Candidate
> 버전: v0.1
> 소유자: jk
> 작성 에이전트: Codex
> 기준 브랜치: main
> 작업 브랜치: codex/033-backlog-template
> 최종 수정일: 2026-07-08

## 1. 목적

본 문서는 JKADH Backlog 항목을 작성할 때 사용하는 기본 형식을 정의한다.

Backlog는 공식 문서 본문과 달리 확정 기준을 담는 문서가 아니라, 후속 작업 후보와 보류 항목을 추적하기 위한 작업 기록이다.

## 2. 적용 범위

이 템플릿은 `docs/15.로그/backlog` 아래에 새 Backlog 파일을 작성할 때 적용한다.

기존 Backlog 파일은 안정적인 링크와 이력을 유지하기 위해 이 템플릿에 맞춰 소급 변경하지 않는다.

## 3. 작성 원칙

- Backlog 파일은 생성일 기준 날짜 폴더에 둔다.
- 해결 여부에 따라 파일 위치를 이동하지 않는다.
- Backlog에는 별도 작업 이력을 두지 않는다.
- 상태 변경, 관련 Issue, 관련 PR, 해결 문서는 `연결 이력`에 남긴다.
- 신규 Backlog ID는 Issue 기반 작업 중 생성하는 경우 `BLG-{GitHub Issue 번호}-{Issue 안 Backlog 순번}` 형식을 우선 사용한다.
- Issue 없이 생성된 기존 `BLG-###` 형식은 소급 변경하지 않는다.

## 4. 기본 형식

```markdown
# BLG-{ID} {Backlog 제목}

> Backlog ID: BLG-{ID}
> 상태: Open
> 유형: {유형}
> 생성일: YYYY-MM-DD
> 처리시점: {처리시점}
> 우선순위: {우선순위}
> 의존 대상: {의존 대상 또는 -}
> 출처: {출처}
> 출처 문서:
> - {출처 문서 또는 -}
> 관련 문서:
> - {관련 문서 또는 -}
> 연결 Issue: {GitHub Issue 링크 또는 None}
> 연결 PR: {GitHub PR 링크 또는 None}
> 해결 문서: {해결 문서 링크 또는 None}

## 1. 내용

{Backlog로 남길 작업 후보 또는 보류 항목을 간결하게 설명한다.}

## 2. 발생 배경

{왜 이 항목이 현재 작업에 바로 포함되지 않고 Backlog로 분리되었는지 적는다.}

## 3. 기대 효과

- {이 항목을 해결했을 때 기대되는 효과}

## 4. 처리 기준

- {Issue로 승격하거나 해결할 때 확인할 기준}

## 5. 연결 이력

| 날짜 | 상태 | 연결 대상 | 내용 |
|---|---|---|---|
| YYYY-MM-DD | Open | - | Backlog 최초 등록 |
```

## 5. 필드 기준

| 필드 | 기준 |
|---|---|
| `상태` | `Open`, `Ready`, `Blocked`, `Deferred`, `Issue Linked`, `Resolved`, `Rejected` 중 하나를 사용한다. |
| `유형` | `POLICY`, `PROCESS`, `TEMPLATE`, `ORG`, `DOC`, `DESIGN`, `OPS`, `CHECK`처럼 분류 목적을 드러내는 값을 사용한다. |
| `처리시점` | `즉시`, `Issue 종료 시`, `다음 Issue 선정 시`, `선행 작업 완료 후`, `정기 점검 시` 중 하나를 우선 사용한다. |
| `우선순위` | `High`, `Medium`, `Low` 중 하나를 우선 사용한다. |
| `의존 대상` | 해결 전에 필요한 문서, Issue, 결정, 외부 조건을 적고 없으면 `-`로 둔다. |
| `연결 이력` | 상태 변경, Issue 승격, PR 연결, 해결 근거를 시간순으로 남긴다. |

## 6. 관련 문서

- [POL-002 Issue 작성정책](../03.정책/POL-002_Issue_작성정책.md)
- [Backlog 미해결 인덱스](../15.로그/backlog/README.md)

---

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-08 | [#33](https://github.com/jkoogit/jkadh/issues/33) | Codex | GPT-5 | CTO | jk / Codex | Create | Backlog 전용 템플릿 최초 작성 |
