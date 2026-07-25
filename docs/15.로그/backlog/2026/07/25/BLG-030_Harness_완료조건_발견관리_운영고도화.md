# BLG-030 Harness 완료조건·발견관리 운영 고도화

> Backlog ID: BLG-030
> 상태: Resolved
> 유형: HCP
> 생성일: 2026-07-25
> 처리시점: 해결 완료
> 우선순위: Low
> 의존 대상: Issue #124 완료조건 revision·discovery disposition 최소 상태 모델의 운영 결과
> 출처: Issue #124 Loop Run 실사용
> 연결 Issue: [#134](https://github.com/jkoogit/jkadh/issues/134)
> 연결 PR: -
> 해결 문서: [DSN-011 Harness 완료조건 탐구와 루프 개선관리 설계](../../../../05.설계/DSN-011_Harness_완료조건_탐구와_루프_개선관리_설계.md)

## 목차

- [1. 내용](#1-내용)
- [2. 발생 배경](#2-발생-배경)
- [3. 기대 효과](#3-기대-효과)
- [4. 처리 기준](#4-처리-기준)
- [5. 연결 이력](#5-연결-이력)

## 1. 내용

완료조건 revision과 discovery disposition 최소 상태 모델의 실사용 빈도와 운영 비용을 확인한 뒤 전용 사용자 명령, 의미 기반 criteria 평가, 다중 agent revision 잠금, 작업 budget을 단계적으로 검토한다.

## 2. 발생 배경

Issue #124는 새 명령을 대량 추가하지 않고 HCP task 선택 필드와 기존 `#태스크처리`·`#태스크정리` 연결만 구현했다. 첫 Loop Run에서 최소 모델의 필요성은 확인했지만 전용 명령과 자동화 수준은 반복 사용 근거가 부족하므로 현재 태스크 완료를 막지 않는 후속 항목으로 분리한다.

## 3. 기대 효과

- 실제 사용 빈도에 맞는 명령 체계를 선택하고, 동시 revision 충돌과 장기 루프 비용을 필요한 수준에서 통제한다.

## 4. 처리 기준

- 전용 criteria·discovery 명령의 사용 사례와 입력 필드를 확정한다.
- 의미 기반 자동 평가가 기존 구조화 evidence보다 필요한 사례를 제시한다.
- 다중 agent가 같은 task revision을 변경하는 충돌 시나리오와 잠금 정책을 정의한다.
- 시간·재시도·토큰 budget의 중단 및 승인 기준을 정의한다.
- 원격 반영 권한은 계속 태스크 lifecycle에만 둔다.

## 5. 연결 이력

| 날짜 | 상태 | 연결 대상 | 내용 |
|---|---|---|---|
| 2026-07-25 | Open | [DSN-011](../../../../05.설계/DSN-011_Harness_완료조건_탐구와_루프_개선관리_설계.md) | Issue #124 실사용 후속 운영 고도화 항목 등록 |
| 2026-07-25 | Issue Linked | [#134](https://github.com/jkoogit/jkadh/issues/134) | 완료 Loop evidence를 재평가하고 종료 outcome evidence 최소 보완을 태스크로 시작 |
| 2026-07-25 | Issue Linked | [BLG-134-001](./BLG-134-001_Loop_criteria_자동평가_동시revision_budget_재평가.md) | 반복 근거가 부족한 전용 명령, 의미 평가, 동시 revision 잠금과 시간·토큰 budget을 Deferred 후속으로 분리 |
| 2026-07-25 | Resolved | [DSN-011](../../../../05.설계/DSN-011_Harness_완료조건_탐구와_루프_개선관리_설계.md) | Loop 종료 outcome evidence, CLI 요약과 retry 소진 판정을 구현·검증하고 고급 자동화 잔여를 후속 Backlog로 분리 |

[목차로 이동](#목차)
