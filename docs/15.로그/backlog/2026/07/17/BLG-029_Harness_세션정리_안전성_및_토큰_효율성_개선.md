# BLG-029 Harness 세션정리 안전성 및 토큰 효율성 개선

> Backlog ID: BLG-029
> 상태: Resolved
> 유형: HCP
> 생성일: 2026-07-17
> 처리시점: 다음 Issue 선정 시
> 우선순위: Medium
> 의존 대상: REF-011 세션 태스크 범위확장 판단기준, REF-008 세션정리 사용방법, 세션 016 정리 중 dev 브랜치 직접 커밋/PR head=base 실패 사례
> 출처: Session 016 close retrospective and user feedback
> 출처 문서:
> - -
> 관련 문서:
> - -
> 연결 Issue: [#117](https://github.com/jkoogit/jkadh/issues/117)
> 연결 PR: [#118](https://github.com/jkoogit/jkadh/pull/118)
> 해결 문서: [REF-008 Harness 세션정리 사용방법](../../../../16.참고/REF-008_Harness_세션정리_사용방법.md)

## 목차

- [1. 내용](#1-내용)
- [2. 발생 배경](#2-발생-배경)
- [3. 기대 효과](#3-기대-효과)
- [4. 처리 기준](#4-처리-기준)
- [5. 연결 이력](#5-연결-이력)

## 1. 내용

세션정리 실행 중 현재 브랜치가 dev인 상태에서 회고 문서 커밋과 push가 먼저 수행되고, 이후 PR 생성 단계에서 base와 head가 모두 dev가 되어 실패했다. 최종 정합성은 수동 보정과 승급으로 맞췄지만, 세션정리 프로세스에는 실행 전 브랜치 게이트와 복구 리포트가 필요하다. 동시에 REF-011 같은 에이전트 운영 기준을 매번 전문 출력하지 않고 정책 ID와 짧은 판정 요약으로 공유해 토큰 효율성을 개선할 필요가 있다.

## 2. 발생 배경

세션 016에서 #세션정리 실행은 최종적으로 성공했지만 중간에 자동 PR 생성이 실패했다. 원인은 세션정리 전용 브랜치가 아니라 dev 브랜치에서 실행된 점과 Harness가 head/base 동일 조건을 사전에 차단하지 못한 점이다. 또한 세션/태스크 범위 판단 기준을 에이전트 간 공유하려면 REF 전문을 반복 주입하기보다 appliedPolicies, scopeDecision 같은 요약 구조가 필요하다는 논의가 있었다.

## 3. 기대 효과

- 세션정리 실행 전 위험 조건을 차단하고, 실패 시 어디까지 실행됐는지 복구 가능한 리포트를 제공한다. Harness report는 규칙 전문 대신 정책 ID와 판정 요약을 사용해 토큰 사용량을 줄이고 에이전트 간 일관성을 유지한다.

## 4. 처리 기준

- Resolved 전환 기준: session close --execute가 dev/stg/main에서 직접 실행될 때 blocked 처리한다. PR head와 base가 같으면 쓰기 작업 전에 blocked 처리한다. 회고 생성 전 git diff --check 또는 생성 직후 check 실패 시 승급을 막는다. PR 실패 시 생성된 커밋, push 여부, 남은 조치가 recovery report로 출력된다. 태스크/세션 report에 appliedPolicies와 scopeDecision 요약 구조가 반영된다.

## 5. 연결 이력

| 날짜 | 상태 | 연결 대상 | 내용 |
|---|---|---|---|
| 2026-07-17 | Open | - | Backlog 최초 등록 |
| 2026-07-18 | Issue Linked | [#117](https://github.com/jkoogit/jkadh/issues/117) | Harness 세션정리 안전성 및 토큰 효율성 개선 작업 Issue로 연결 |
| 2026-07-21 | Resolved | [#117](https://github.com/jkoogit/jkadh/issues/117), [#118](https://github.com/jkoogit/jkadh/pull/118), [REF-008](../../../../16.참고/REF-008_Harness_세션정리_사용방법.md) | 세션정리 실행 안전 게이트, diff check 차단, recovery report, appliedPolicies/scopeDecision 요약 구조 반영 |

[목차로 이동](#목차)
