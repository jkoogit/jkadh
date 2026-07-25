# REF-011 Harness 루프 기반 개선관리 사용방법

| 항목 | 값 |
|---|---|
| 문서 ID | REF-011 |
| 문서 유형 | 참고 |
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
- [2. 언제 루프를 사용하는가](#2-언제-루프를-사용하는가)
- [3. 태스크와 루프의 명령 순서](#3-태스크와-루프의-명령-순서)
- [4. 루프 분석 준비](#4-루프-분석-준비)
- [5. 루프 실행](#5-루프-실행)
- [6. 발견 항목 처리](#6-발견-항목-처리)
- [7. 보완·중단·승인](#7-보완중단승인)
- [8. 삭제·복원·롤백](#8-삭제복원롤백)
- [9. 여러 루프 선택](#9-여러-루프-선택)
- [10. 태스크 정리 조건](#10-태스크-정리-조건)
- [11. 첫 운영 권장 흐름](#11-첫-운영-권장-흐름)
- [12. 오류 대응](#12-오류-대응)
- [13. 발견 disposition 운영](#13-발견-disposition-운영)
- [14. 관련 문서](#14-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 완료조건이 처음부터 확정되지 않거나 구현·검증·보완이 반복되는 Harness 태스크를 Loop Run으로 처리하는 방법을 설명한다.

루프는 태스크를 대체하지 않는다. 태스크는 작업 목적과 원격 반영 권한을 관리하고, 루프는 태스크 내부 WorkItem의 로컬 구현과 검증을 반복한다.

## 2. 언제 루프를 사용하는가

다음 작업은 루프 사용이 적합하다.

- 여러 단계가 의존관계로 연결된다.
- 각 단계의 허용 파일 경로가 다르다.
- 구현과 검증을 반복해야 한다.
- 실패 시 분석을 보완하고 재시도해야 한다.
- 중간 checkpoint와 evidence가 필요하다.
- 완료조건을 구현 중 구체화해야 한다.

다음 작업은 일반 태스크 처리로 충분하다.

- 변경 파일과 완료조건이 명확한 단일 수정
- 한 번의 구현과 검증으로 끝나는 작업
- 반복·중단·복원 상태를 관리할 필요가 없는 작업

## 3. 태스크와 루프의 명령 순서

기본 순서는 다음과 같다.

```text
#태스크시작
→ #태스크처리
→ #루프분석
→ #루프실행
→ 필요 시 #루프보완 또는 #루프승인
→ 모든 필수 WorkItem 완료
→ #태스크정리
→ #태스크승급
```

`#태스크처리`는 active session·task, 등록 브랜치와 작업 경계를 확인한다. 이 단계가 통과된 뒤에만 태스크 종속 Loop Run을 만든다.

Loop Run은 commit, push, PR 생성·병합, `dev/stg/main` 승급을 수행하지 않는다. 해당 권한은 `#태스크정리`와 `#태스크승급`에만 있다.

## 4. 루프 분석 준비

`#루프분석` 전에 다음 항목을 WorkItem별로 정의한다.

| 항목 | 설명 |
|---|---|
| `id`, `title` | WorkItem 식별자와 목적 |
| `dependencies` | 먼저 완료되어야 하는 WorkItem ID |
| `completionConditions` | 파일·명령·승인 등 판정 가능한 완료조건 |
| `expectedResults` | 허용할 정상결과 유형 |
| `errorCases` | 예상 오류와 중단 사유 |
| `allowedPaths` | 해당 WorkItem이 변경할 수 있는 경로 |
| `verificationCommands` | allowlist에 등록된 검증 명령 |
| `retryPolicy` | 최대 시도 횟수와 재시도 가능 오류 |

다중 WorkItem은 registry JSON으로 정의한다. registry는 저장소 내부의 일반 JSON 파일이어야 하며 외부 경로와 외부를 가리키는 링크는 차단된다.

```text
#루프분석{
sessionId: codex_ses_018_20260720_001
taskId: codex_task_018_002
registryPath: .hcp/registries/issue-124-completion-discovery-loop.json
}
```

분석이 성공하면 `analysis_ready` Loop Run이 생성되고 HCP task의 `loopIds`에 연결된다. 구조 검증에 실패하면 Loop와 연결 evidence를 만들지 않는다.

## 5. 루프 실행

`#루프실행`은 실행 가능한 `ready` WorkItem 하나를 선택한다.

첫 실행은 다음 처리를 한다.

1. before checkpoint 생성
2. Loop lease 획득
3. WorkItem을 `implementing`으로 전환
4. 구현 허용 경로 고정

구현 후 같은 명령에 구현 요약을 제공하면 다음 처리를 한다.

1. after checkpoint 생성
2. 파일별 digest 차이 계산
3. 허용 경로 이탈 검사
4. 검증 명령 실행
5. 완료조건과 정상결과 평가
6. 성공 시 후속 의존 WorkItem 해제

WorkItem은 `pending → ready → implementing → implementation_complete → verifying → completed` 순서로 진행한다. 실패하면 정책에 따라 `blocked` 또는 재시도 가능한 `ready`로 전환한다.

하나의 WorkItem은 보통 두 번의 `#루프실행`으로 처리된다.

1. 첫 실행은 `ready` 항목을 `implementing`으로 전환하고 before checkpoint를 만든다.
2. 로컬 구현 후 다음 실행은 구현 요약을 인계하고 검증하여 `completed`로 전환한다.

출력된 Loop 상태가 `running`이어도 현재 WorkItem은 완료되고 다음 항목만 `ready`일 수 있다. WorkItem별 상태와 verification evidence를 함께 확인한다. 진행 중 항목이 있으면 Harness는 새 `ready` 항목보다 해당 항목의 인계·검증을 항상 우선한다.

## 6. 발견 항목 처리

구현 중 발견한 항목은 다음 중 하나로 분류한다.

| 분류 | 예시 | 처리 |
|---|---|---|
| `required` | 런타임 오류, 거짓 성공, 데이터 손실, 권한 위반, frozen 조건 위반 | 현재 WorkItem 또는 보완 WorkItem에 포함 |
| `follow_up` | 일반화, 편의 개선, 장기 운영 최적화 | Backlog로 분리 |
| `rejected` | 목적과 불일치하거나 비용 대비 가치가 낮음 | 사유 기록 후 제외 |

발견 자체와 처분을 구분해 기록한다. “더 좋아질 수 있다”는 이유만으로 현재 태스크를 다시 열지 않는다.

예를 들어 registry 기반 첫 분석에서 `splitList(undefined)`가 발생하면 루프 생성 자체를 막는 런타임 오류이므로 `required`다. schema template 자동 생성은 루프 실행을 막지 않으므로 `follow_up`이다.

## 7. 보완·중단·승인

실행 중인 루프의 분석은 직접 수정하지 않는다.

```text
#루프중단
→ #루프보완{
  loopId: codex_loop_018_001
  작업항목: work_003
  완료조건: ...
}
```

보완은 지정 WorkItem과 그 후속 의존 항목의 완료 evidence만 무효화한다. 관련 없는 WorkItem은 유지한다.

`manual_approval` 조건은 registry의 `approved: true`만으로 통과하지 않는다. 다음 정보를 별도 evidence로 기록해야 한다.

```text
#루프승인{
  loopId: codex_loop_018_001
  작업항목: work_003
  승인조건: security-review
  승인자: 사용자 식별자
}
```

승인 후에는 완료된 구현을 반복하지 않고 검증 단계부터 재개할 수 있다.

중단 원인이 완료조건·정상결과·오류 사례·허용 경로의 변경이면 `#루프보완`을 사용한다. 반대로 오케스트레이션 우선순위, checkpoint 계산, 검증 실행기처럼 여러 WorkItem에 영향을 주는 엔진 결함이면 `#태스크처리`로 수정한다. 태스크 수준 수정 뒤에는 진행 중 WorkItem의 checkpoint를 재기준화하고 해당 WorkItem의 허용 파일만 digest 차이로 보존한다.

## 8. 삭제·복원·롤백

- `#루프삭제`: evidence를 보존하는 soft delete
- `#루프복원`: 삭제된 루프를 `paused`로 복원
- `#루프롤백.보고`: 제거 가능한 신규 파일과 수동 복구가 필요한 파일 표시
- `#루프롤백`: 명시 승인된 루프 신규 일반 파일만 제거

기존 파일 수정·삭제, 디렉터리, 심볼릭 링크, 브랜치 변경은 자동 롤백하지 않는다. 기존 파일 내용 복구는 별도 설계와 승인이 필요하다.

필수 루프를 삭제할 때에는 대체 Loop ID 또는 제외 승인이 없으면 태스크 정리가 차단된다.

## 9. 여러 루프 선택

명령 대상 후보가 여러 건이면 Harness는 목록과 selection token을 출력한다. 이 상태에서는 어떤 Loop도 변경하지 않는다.

```text
#루프실행{
  loopId: codex_loop_018_001
  selectionToken: 0123456789abcdef
}
```

후보 상태가 바뀌면 이전 token은 만료된다. 목록을 다시 확인해 최신 token으로 선택한다.

## 10. 태스크 정리 조건

태스크 정리 전에 다음을 확인한다.

- 모든 필수 Loop Run이 `completed` 상태다.
- 삭제된 필수 루프에는 대체 Loop 또는 제외 승인이 있다.
- 미처리 `required` 발견 항목이 없다.
- `follow_up`은 Backlog에 기록됐다.
- frozen 완료조건과 검증 evidence가 일치한다.
- `.hcp/` runtime 상태는 커밋 대상에서 제외한다.

Loop가 완료되어도 PR과 승급은 자동 실행되지 않는다. 태스크 단위 변경을 다시 검토한 뒤 `#태스크정리`를 실행한다.

## 11. 첫 운영 권장 흐름

첫 실사용에서는 기능을 한꺼번에 일반화하지 않는다.

1. 문서 WorkItem으로 개념과 경계를 먼저 고정한다.
2. 최소 상태 모델을 구현한다.
3. 기존 명령에만 연결하고 새 명령 증가는 최소화한다.
4. 실제 Loop Run으로 구현 과정을 수행한다.
5. 사용 중 발견한 결함만 `required`로 보완한다.
6. 일반화와 편의 개선은 Backlog로 분리한다.
7. 마지막 WorkItem에서 문서와 구현을 현행화한다.

## 12. 오류 대응

| 상황 | 대응 |
|---|---|
| registry 구조 오류 | 오류 목록을 보완한 뒤 `#루프분석` 재시도 |
| active task 불일치 | `#태스크처리`로 session·task·branch 재확인 |
| lease 만료 | 자동으로 `paused` 전환된 상태를 확인하고 재실행 |
| 허용 경로 이탈 | 변경을 중단하고 범위 수정 또는 파일 복구 판단 |
| 동일 오류 반복 | 무진전으로 중단하고 `#루프보완` 또는 사용자 판단 |
| 검증 실패 | retry policy에 따라 재시도 또는 분석 revision |
| 원격 작업 필요 | 루프에서 수행하지 않고 태스크 lifecycle로 이동 |
| 태스크 보완 파일이 WorkItem 변경으로 계산됨 | 태스크 처리로 엔진을 수정한 뒤 보존 경로를 명시해 checkpoint 재기준화 |
| Windows npm 검증 실패 | 고정 allowlist와 명시적 `ComSpec` 실행 여부 확인; `shell: true`는 사용하지 않음 |
| 루프는 running인데 다음 작업이 시작되지 않음 | 이전 WorkItem 완료와 다음 `ready` 상태를 확인하고 다음 `#루프실행`으로 시작 |

## 13. 발견 disposition 운영

실사용 발견은 처리 전에 다음처럼 분류한다.

- `required`: 현재 결과의 안전성·정확성·재현성을 깨뜨리므로 현재 태스크에서 해결하고 회귀 evidence를 남긴다.
- `follow_up`: 현재 결과를 사용할 수 있으며 일반화·편의·장기 운영 개선에 해당하므로 Backlog 후보로 남긴다.
- `rejected`: 태스크·루프 권한 경계와 충돌하거나 자동화 위험이 큰 항목으로, 제외 근거를 기록한다.

`required` 발견을 해결하거나 재분류할 때는 같은 discovery ID에 새 evidence와 rationale을 기록한다. `follow_up`과 `rejected`는 `blocksCurrentTask=true`로 저장할 수 없다.

## 14. 관련 문서

- [POL-003 Git 작업관리방안](../03.정책/POL-003_Git_작업관리방안.md)
- [DSN-011 완료조건 탐구와 루프 개선관리 설계](../05.설계/DSN-011_Harness_완료조건_탐구와_루프_개선관리_설계.md)
- [REF-005 Harness 태스크시작 사용방법](./REF-005_Harness_태스크시작_사용방법.md)
- [REF-006 Harness 태스크정리 사용방법](./REF-006_Harness_태스크정리_사용방법.md)
- [REF-007 Harness 태스크승급 사용방법](./REF-007_Harness_태스크승급_사용방법.md)

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-23 | [#124](https://github.com/jkoogit/jkadh/issues/124) | Codex | GPT-5 | CTO | jk / Codex | Create | Loop Run 분석·실행·보완·승인·복구와 발견 disposition 사용방법 작성 |
