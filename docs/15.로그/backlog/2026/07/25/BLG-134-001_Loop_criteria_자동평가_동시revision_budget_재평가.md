# BLG-134-001 Loop criteria 자동평가·동시 revision·budget 재평가

> Backlog ID: BLG-134-001
> 상태: Deferred
> 유형: HCP
> 생성일: 2026-07-25
> 처리시점: 정기 점검 시
> 우선순위: Low
> 의존 대상: 반복 Loop 운영 evidence
> 출처: Issue #134 Loop 종료 outcome evidence 보완
> 출처 문서:
> - [DSN-011 Harness 완료조건 탐구와 루프 개선관리 설계](../../../../../05.설계/DSN-011_Harness_완료조건_탐구와_루프_개선관리_설계.md)
> 관련 문서:
> - [BLG-030 Harness 완료조건·발견관리 운영 고도화](./BLG-030_Harness_완료조건_발견관리_운영고도화.md)
> - [Backlog 미해결 인덱스](../../../README.md)
> 연결 Issue: [#134](https://github.com/jkoogit/jkadh/issues/134)
> 연결 PR: None
> 해결 문서: None

## 목차

- [1. 내용](#1-내용)
- [2. 발생 배경](#2-발생-배경)
- [3. 기대 효과](#3-기대-효과)
- [4. 처리 기준](#4-처리-기준)
- [5. 연결 이력](#5-연결-이력)

## 1. 내용

Loop criteria·discovery 전용 사용자 명령, 의미 기반 criteria 자동평가, 다중 agent revision 잠금, 시간·토큰 budget을 반복 운영 evidence가 쌓인 뒤 재평가한다.

## 2. 발생 배경

Issue #124의 완료 Loop는 WorkItem 6개가 모두 한 번의 시도로 완료됐고 recovery 3건도 기존 checkpoint·lease·revision 경로로 복구됐다. Issue #134에서는 종료 결과, 시도·검증·복구 횟수, 미해결 항목과 retry 소진을 `outcomeEvidence`로 구조화했다.

현재 evidence에는 의미 기반 평가 부재로 인한 거짓 완료, 다중 agent의 동시 revision 충돌, 시간·토큰 budget 부재로 인한 무한 실행 사례가 없다. 사용 사례 없이 전용 명령과 잠금·budget 모델을 추가하면 현재 Loop 운영보다 상태와 승인 경계가 먼저 복잡해질 수 있어 보류한다.

## 3. 기대 효과

- 실제 반복 실패 유형에 맞는 자동화만 선택한다.
- 기존 retry policy, lease, outcome evidence로 충분한 범위를 중복 구현하지 않는다.
- 의미 평가와 토큰 budget 도입 시 필요한 측정 source와 승인 경계를 먼저 확보한다.

## 4. 처리 기준

- 같은 criteria/discovery 변경을 반복해 전용 명령 필요성이 확인된다.
- 구조화 조건만으로 평가할 수 없는 거짓 완료 사례가 재현된다.
- 둘 이상의 agent가 같은 task revision을 동시에 변경해 충돌한다.
- retry policy와 lease만으로 통제되지 않는 장기 Loop 실행이 재현된다.
- 시간·토큰 사용량의 신뢰 가능한 측정 source가 마련된다.
- 각 조건이 재현되기 전에는 현재 Deferred 상태를 유지한다.

## 5. 연결 이력

| 날짜 | 상태 | 연결 대상 | 내용 |
|---|---|---|---|
| 2026-07-25 | Deferred | [Issue #134](https://github.com/jkoogit/jkadh/issues/134) | 실제 실패 근거가 부족한 Loop 고급 자동화 항목을 후속 재평가 대상으로 분리 |

[목차로 이동](#목차)
