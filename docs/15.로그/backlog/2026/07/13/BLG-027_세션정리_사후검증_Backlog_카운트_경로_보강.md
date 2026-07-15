# BLG-027 세션정리 사후검증 Backlog 카운트 경로 보강

> Backlog ID: BLG-027
> 상태: Resolved
> 유형: BUG
> 생성일: 2026-07-15
> 처리시점: 다음 Issue 선정 시
> 우선순위: High
> 의존 대상: HCP session close 사후 검증 자동화
> 출처: BLG-026 처리 결과 정합성 점검
> 출처 문서:
> - [BLG-026 세션정리 다음세션 인계와 후처리 정합성 보강](./BLG-026_세션정리_다음세션_인계와_후처리_정합성_보강.md)
> 관련 문서:
> - [Backlog 미해결 인덱스](../../../README.md)
> 연결 Issue: #99
> 연결 PR: None
> 해결 문서: None

## 목차

- [1. 내용](#1-내용)
- [2. 발생 배경](#2-발생-배경)
- [3. 보완 방향](#3-보완-방향)
- [4. 처리 기준](#4-처리-기준)
- [5. 연결 이력](#5-연결-이력)

## 1. 내용

`session close` 사후 검증의 open Backlog 카운트가 실제 `docs/15.로그/backlog/README.md` 문서를 안정적으로 읽는지 보강한다.

현재 `readOpenBacklogCount` 구현은 한글 경로 문자열이 깨진 형태로 남아 있어, 실제 문서가 존재해도 Backlog 카운트를 0으로 계산할 가능성이 있다. 이 경우 `#세션정리` 완료 검증에서 미해결 Backlog 수가 실제보다 작게 표시될 수 있다.

또한 Backlog 생성/추가 절차는 개별 Backlog 문서 생성과 미해결 인덱스 갱신을 하나의 절차로 보아야 한다. 신규 Ready/Open Backlog가 만들어졌는데 README 인덱스에 누락되면 이후 `session close` 사후 검증이 정확한 남은 작업을 보고할 수 없다.

## 2. 발생 배경

BLG-026의 PR #92는 다음 세션 인계, 사후 검증 출력, 병합된 PR 재사용 방지, HCP 상태 stale 방지, Issue 관리 댓글 표시를 구현했다.

정합성 점검 과정에서 사후 검증 자동화 중 Backlog 카운트 경로만 실제 한글 문서 경로와 맞지 않을 가능성이 확인되어 BLG-026의 후속 Backlog로 분리한다.

## 3. 보완 방향

- `readOpenBacklogCount`가 실제 `docs/15.로그/backlog/README.md`를 읽도록 경로 구성을 보강한다.
- 한글 경로를 직접 하드코딩하지 않고 문서 디렉터리 탐색 또는 기존 문서 경로 유틸리티를 활용하는 방식을 검토한다.
- open Backlog가 있는 fixture를 만들어 카운트가 0이 아닌 값으로 검증되는 테스트를 추가한다.
- Backlog 생성/추가 플로우는 개별 Backlog 파일 생성과 `docs/15.로그/backlog/README.md` 미해결 인덱스 갱신을 함께 수행하도록 보강한다.
- `#백로그추가` 실행 결과에는 생성된 Backlog 파일 경로와 README 인덱스 반영 여부를 함께 출력한다.
- 사후 검증은 README를 읽을 수 있는지뿐 아니라 Ready/Open Backlog가 README 인덱스에 누락되지 않았는지도 확인한다.

## 4. 처리 기준

- 실제 backlog README가 존재할 때 `session close` auto status의 `open backlog` 값이 문서 내용과 일치한다.
- 한글 경로가 포함된 문서 구조에서도 테스트가 통과한다.
- Backlog 생성/추가 시 개별 파일과 README 미해결 인덱스가 함께 갱신된다.
- 신규 Ready/Open Backlog가 README 인덱스에 누락되면 검증이 실패하거나 보정 필요 상태로 보고된다.
- `npm test`, `npm run check`가 통과한다.

## 5. 연결 이력

| 날짜 | 상태 | 연결 대상 | 내용 |
|---|---|---|---|
| 2026-07-15 | Ready | BLG-026, Issue #99 | Issue #99에서 BLG-026 처리 결과를 점검하던 중 사후 검증 Backlog 카운트 경로 리스크를 후속 항목으로 분리 |
| 2026-07-15 | Resolved | Issue #99 | `readOpenBacklogCount`가 실제 한글 Backlog README 경로를 읽도록 보강하고, Backlog 인덱스 파서 기준으로 미해결 항목을 계산하도록 수정했다. `#백로그추가` 결과에는 README 인덱스 반영 여부를 표시하도록 보강했다. |

[목차로 이동](#목차)
