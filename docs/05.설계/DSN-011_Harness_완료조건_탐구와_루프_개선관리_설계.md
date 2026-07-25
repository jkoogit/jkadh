# DSN-011 Harness 완료조건 탐구와 루프 개선관리 설계

| 항목 | 값 |
|---|---|
| 문서 ID | DSN-011 |
| 문서 유형 | 설계 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.2 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/124-backlog-loop-run-evidence |
| 관련 Issue | #124 |
| 최종 수정일 | 2026-07-25 |

## 목차

- [1. 목적](#1-목적)
- [2. 설계 원칙](#2-설계-원칙)
- [3. 태스크와 루프의 책임](#3-태스크와-루프의-책임)
- [4. 완료조건 수명주기](#4-완료조건-수명주기)
- [5. 발견 항목 분류](#5-발견-항목-분류)
- [6. 범위 재개 기준](#6-범위-재개-기준)
- [7. 안정화와 종료 기준](#7-안정화와-종료-기준)
- [8. 최소 상태 모델](#8-최소-상태-모델)
- [9. evidence와 무효화](#9-evidence와-무효화)
- [10. 오류와 중단 기준](#10-오류와-중단-기준)
- [11. 단계적 구현 범위](#11-단계적-구현-범위)
- [12. 검증 기준](#12-검증-기준)
- [13. 1차 실사용 결과와 disposition](#13-1차-실사용-결과와-disposition)
- [14. 구현된 최소 연결](#14-구현된-최소-연결)
- [15. 관련 문서](#15-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

AI 개발 태스크는 시작 시점에 완료조건이 완전하지 않을 수 있고, 구현과 검증 과정에서 필수 결함과 개선 후보가 계속 발견될 수 있다. 본 문서는 발견을 막지 않으면서 현재 태스크의 완료 경계가 무한히 확장되지 않도록 완료조건 탐구, 동결, 발견 분류, 안정화 기준을 정의한다.

본 설계는 기존 태스크 명령과 `#루프xx` 명령을 대체하지 않는다. 태스크 lifecycle 안에서 필요한 경우에만 Loop Run을 하위 실행 수단으로 연결한다.

## 2. 설계 원칙

| 원칙 | 기준 |
|---|---|
| 불완전한 시작 허용 | 태스크 시작 시 목적과 알려진 경계가 있으면 완료조건 초안을 탐구할 수 있다. |
| 조건의 버전 관리 | 완료조건 변경은 덮어쓰지 않고 revision과 사유를 남긴다. |
| 위험 기반 범위 재개 | 동결 후에는 오동작, 손실, 권한 위반, 주문 위반처럼 현재 결과를 무효화하는 발견만 포함한다. |
| 발견과 처분 분리 | 발견 사실과 현재 포함·후속 처리·채택 제외 결정을 별도 evidence로 기록한다. |
| 태스크 권한 유지 | commit, push, PR, merge, 승급은 태스크 lifecycle에만 허용한다. |
| 루프 실행 한정 | Loop Run은 WorkItem의 로컬 구현·검증·보완·checkpoint만 관리한다. |
| 최소 구현 우선 | 실제 사용에서 필요성이 확인되지 않은 상태와 명령은 추가하지 않는다. |

## 3. 태스크와 루프의 책임

```text
Task
 ├─ 작업 목적과 범위
 ├─ 완료조건 revision
 ├─ 발견 항목과 disposition
 ├─ 정리·PR·승급 권한
 └─ Loop Run 0..N
     ├─ WorkItem과 의존관계
     ├─ 구현 evidence
     ├─ verification evidence
     └─ checkpoint·보완·중단
```

단순 태스크는 Loop Run 없이 처리할 수 있다. 반복·다단계·재시도·중간 checkpoint가 필요한 경우에만 루프를 사용한다. 루프 완료는 태스크 완료의 필요조건이 될 수 있지만 그 자체가 태스크 정리나 원격 반영을 의미하지 않는다.

## 4. 완료조건 수명주기

완료조건은 다음 상태를 가진다.

| 상태 | 의미 | 허용 동작 |
|---|---|---|
| `draft` | 탐구 중이며 누락 가능성이 있음 | 조건 추가·수정·삭제 |
| `provisional` | 구현을 시작할 수 있는 임시 기준 | 구현·검증, 근거 있는 revision |
| `frozen` | 현재 태스크 정리 판단의 기준 | 승인된 재개 외 직접 변경 금지 |
| `superseded` | 새 revision으로 대체됨 | 조회만 허용 |

처음부터 완료조건이 명확하면 `provisional`로 시작할 수 있다. 불명확한 태스크는 `draft`에서 탐구한 뒤 목적, 범위, 제외 범위, 검증 방법이 구현 가능한 수준에 도달하면 `provisional`로 전환한다. `#태스크정리.보고`에 사용할 기준은 `frozen` revision이어야 한다.

revision에는 버전, 변경 필드, 사유, 변경 시각, 무효화된 WorkItem과 evidence를 기록한다.

## 5. 발견 항목 분류

발견 항목은 다음 disposition 중 하나를 가져야 한다.

| disposition | 판단 기준 | 현재 태스크 영향 |
|---|---|---|
| `required` | 미처리 시 오동작, 거짓 성공, 손실, 권한 위반 또는 frozen 완료조건 위반 | 현재 범위에 포함하고 완료를 차단 |
| `follow_up` | 현재 결과를 사용할 수 있으나 품질·일반화·편의 개선 가치가 있음 | Backlog로 분리하고 완료를 차단하지 않음 |
| `rejected` | 목적과 맞지 않거나 비용 대비 가치가 낮음 | 사유 기록 후 제외 |

분류에는 발견 유형, 심각도, 관련 완료조건 ID, 근거, 처분 사유를 함께 기록한다. 단순히 더 좋아질 수 있다는 이유만으로 `required`로 분류하지 않는다.

## 6. 범위 재개 기준

`frozen` 이후 현재 범위를 다시 열 수 있는 조건은 다음과 같다.

- 실제 실행이 실패하거나 잘못된 성공을 보고한다.
- 데이터 또는 사용자 변경이 손실될 수 있다.
- 권한 경계나 원격 반영 제한을 위반한다.
- 사용자 주문 또는 frozen 완료조건을 직접 위반한다.
- 기존 evidence가 재현되지 않거나 기준 commit·digest와 불일치한다.

기능 일반화, 추가 명령, 편의 개선, 장기 운영 최적화는 기본적으로 `follow_up`이다. 재개 시 사유, 영향 범위, 무효화 evidence, 재안정화 필요 여부를 남긴다.

## 7. 안정화와 종료 기준

구현을 마친 뒤에는 안정화 구간을 둔다. 안정화 중 허용되는 작업은 회귀 실패, 런타임 오류, 안전 결함, 문서와 동작의 불일치 수정이다. 신규 기능과 일반화는 후속 항목으로 분리한다.

종료 판단은 감사 횟수보다 다음 조건을 우선한다.

- frozen 완료조건이 모두 평가됨
- 실패 또는 미평가 필수조건이 없음
- 허용 경로 이탈이 없음
- 미처리 `required` 발견이 없음
- 마지막 필수 보완 이후 전체 회귀 검증이 통과함
- `follow_up`과 `rejected`의 처분 근거가 기록됨

## 8. 최소 상태 모델

초기 구현은 별도 명령을 늘리지 않고 HCP task에 선택 필드를 추가하는 방식으로 시작한다.

```text
task.phase:
  discovering | implementing | stabilizing | close_ready

criteriaRevisions[]:
  version, status, criteria, reason, changedAt,
  invalidatedWorkItemIds, invalidatedEvidenceIds

discoveries[]:
  discoveryId, category, severity, disposition,
  blocksCurrentTask, criterionIds, evidence, rationale
```

기존 task의 필드가 없으면 `implementing`과 legacy criteria로 해석해 하위 호환을 유지한다. 새 필드는 optional로 시작하며 기존 JSON을 읽을 때 알 수 없는 필드를 삭제하지 않는다.

## 9. evidence와 무효화

완료조건 revision, Loop checkpoint, 구현·검증 결과는 당시 기준 commit과 변경 digest에 연결한다. 완료조건 또는 허용 경로가 변경되면 관련 WorkItem과 후속 의존 WorkItem의 완료 evidence를 무효화하고 재검증한다.

`close_ready`는 단순 상태가 아니라 criteria version, 평가 시각, 기준 commit, 검증 evidence, 미해결 발견 항목, 변경 digest의 스냅샷으로 판단한다. 기준이 달라지면 이전 준비 결과는 재사용하지 않는다.

## 10. 오류와 중단 기준

다음 상황에서는 자동 진행을 중단한다.

- 발견 항목이 `required`인지 `follow_up`인지 사용자 판단이 필요함
- frozen 완료조건 변경이 태스크 목적이나 원격 권한을 확대함
- 동일 오류 fingerprint가 반복됨
- 허용 경로 밖 변경이 발견됨
- checkpoint 또는 evidence가 기준 commit과 불일치함
- 최대 재시도 횟수에 도달함

중단은 실패와 다르다. 보완 가능한 경우 `#루프보완`, 사용자 판단이 필요한 경우 승인 또는 disposition 결정을 받은 뒤 재개한다.

## 11. 단계적 구현 범위

1차 구현은 phase, criteria revision, discovery disposition의 저장과 검증에 한정한다. 기존 태스크·루프 명령을 유지하고 새 명령의 대량 추가는 하지 않는다.

다음 항목은 실사용 결과에 따라 후속 설계한다.

- 자동 criteria 추천과 의미 기반 평가
- 여러 agent의 동시 revision 잠금
- 범위 변경 비용·시간 budget
- 장기 통계와 품질 지표
- 완전 자동 rollback과 외부 시스템 복구

## 12. 검증 기준

- 기존 HCP task JSON을 새 모델로 읽을 수 있다.
- criteria revision 변경 시 관련 evidence가 무효화된다.
- `required`, `follow_up`, `rejected` 처분이 구분된다.
- 미처리 `required` 발견이 있으면 close readiness가 차단된다.
- Loop Run은 원격 저장소 반영 권한을 얻지 않는다.
- 문서의 상태와 실제 명령 동작이 일치한다.
- `npm test`, `npm run check`, `git diff --check`가 통과한다.

## 13. 1차 실사용 결과와 disposition

Issue #124의 첫 Loop Run에서 분석·구현·검증을 실제 수행한 결과는 다음과 같다.

| 발견 | disposition | 결과와 근거 |
|---|---|---|
| registry 분석 시 단일 WorkItem 옵션을 먼저 해석하는 오류 | `required` | 다중 registry 분석을 막으므로 분기 지연과 실패 원자성 검증으로 해결 |
| 진행 중 WorkItem보다 새 `ready` 항목을 먼저 시작하는 오류 | `required` | 복수 `implementing` 상태를 만들므로 단일 활성 invariant와 실행 우선순위로 해결 |
| 태스크 수준 보완이 진행 중 WorkItem 변경으로 귀속되는 오류 | `required` | 허용 경로 거짓 차단을 만들므로 보존 경로 digest와 checkpoint 재기준화로 해결 |
| 허용 경로 이탈 사유가 evidence에 남지 않는 오류 | `required` | 복구 판단을 재현할 수 없으므로 `lastError`와 위반 경로를 구조화해 기록 |
| Windows에서 npm 검증이 실행되지 않거나 `shell: true` 경고가 발생 | `required` | 검증 재현성과 실행 안전성 문제이므로 allowlist 기반 명시적 `ComSpec` 호출로 해결 |
| `required` 발견을 해결·재분류할 갱신 경로 부재 | `required` | 한 번 차단된 태스크를 정상화할 수 없으므로 evidence 기반 발견 갱신을 추가 |
| criteria·discovery 전용 사용자 명령 | `follow_up` | 1차 범위는 상태 모델과 기존 명령 연결이며 사용 빈도 확인 후 별도 명령 여부 결정 |
| 의미 기반 criteria 자동 평가, 다중 agent revision 잠금, 작업 budget | `follow_up` | 현재 로컬 단일 태스크 완료 판단을 막지 않는 운영 고도화 항목 |
| Loop Run의 commit·push·PR·merge·승급 권한 | `rejected` | 태스크 lifecycle의 원격 반영 책임과 충돌하므로 루프 권한으로 추가하지 않음 |
| 기존 파일을 포함한 완전 자동 rollback | `rejected` | 복원 오판 시 사용자 변경을 손실할 위험이 있어 명시 승인된 신규 일반 파일만 유지 |

모든 `required` 발견은 회귀 테스트와 실제 Loop evidence로 해결되었다. `follow_up`은 현재 태스크의 사용 가능성을 차단하지 않으며 [BLG-030 Harness 완료조건·발견관리 운영 고도화](../15.로그/backlog/2026/07/25/BLG-030_Harness_완료조건_발견관리_운영고도화.md)로 관리한다.

## 14. 구현된 최소 연결

- HCP task는 `phase`, `criteriaRevisions`, `discoveries`를 선택 필드로 저장한다.
- 기존 task는 새 필드가 없으면 `implementing`인 legacy task로 읽고 기존 정리 절차를 유지한다.
- criteria revision은 이전 활성 revision을 `superseded`로 보존하고 기존 close evidence를 무효화한다.
- frozen revision 변경에는 무효화할 WorkItem 또는 evidence를 명시해야 한다.
- `#태스크처리`는 유효한 태스크를 구현 단계에 연결한다.
- `#태스크정리`는 구조화된 criteria가 있으면 frozen 기준과 미해결 `required` 발견을 확인한다.
- 발견 갱신은 evidence와 rationale을 요구하며 `follow_up`과 `rejected`가 현재 태스크를 차단하지 못하게 한다.

### Loop 종료 outcome evidence

Loop가 `completed`, `blocked`, `failed`, `cancelled`로 종료되면 WorkItem별 상태를 다시 해석하지 않아도 되도록 `outcomeEvidence`를 저장한다.

```text
outcomeEvidence:
  status, stopReason, resultCounts,
  totalAttempts, verificationCount, recoveryCount,
  unresolvedWorkItemIds, retryExhaustedWorkItemIds,
  recordedAt
```

`completed_changed`와 `completed_no_change`는 결과 분포로 구분한다. 검증 실패 후 WorkItem의 `maxAttempts`를 소진하면 `stopReason=retry_exhausted`로 기록한다. 차단된 항목과 재시도 소진 항목은 ID 목록으로 남겨 사용자 판단 또는 후속 Backlog 분리의 입력으로 사용한다.

Issue #124의 완료 Loop는 WorkItem 6개, 총 시도 6회, 검증 10회, recovery 3회의 evidence를 남겼다. 이 실사용에서는 모든 WorkItem이 한 번의 시도로 완료됐고 의미 기반 평가, 다중 agent revision 잠금, 시간·토큰 budget이 없어서 종료 판단이 실패한 사례는 없었다. 따라서 해당 항목은 자동화하지 않고 후속 재평가 대상으로 유지한다.

## 15. 관련 문서

- [POL-003 Git 작업관리방안](../03.정책/POL-003_Git_작업관리방안.md)
- [REF-005 Harness 태스크시작 사용방법](../16.참고/REF-005_Harness_태스크시작_사용방법.md)
- [REF-006 Harness 태스크정리 사용방법](../16.참고/REF-006_Harness_태스크정리_사용방법.md)
- [REF-007 Harness 태스크승급 사용방법](../16.참고/REF-007_Harness_태스크승급_사용방법.md)

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-23 | [#124](https://github.com/jkoogit/jkadh/issues/124) | Codex | GPT-5 | CTO | jk / Codex | Create | 완료조건 탐구·동결, 발견 disposition, 태스크·루프 책임, 안정화 최소 설계 작성 |
