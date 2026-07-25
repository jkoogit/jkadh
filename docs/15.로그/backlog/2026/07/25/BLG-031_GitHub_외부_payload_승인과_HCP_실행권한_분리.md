# BLG-031 GitHub 외부 payload 승인과 HCP 실행권한 분리

> Backlog ID: BLG-031
> 상태: Open
> 유형: HCP
> 생성일: 2026-07-25
> 처리시점: 승인 차단 재현 또는 권한 모델 정비 시
> 우선순위: Medium
> 의존 대상: 세션 019 GitHub 외부 전송 승인 검토
> 출처: codex_blg_019_001
> 연결 Issue: -
> 연결 PR: -
> 해결 문서: -

## 1. 내용

GitHub Issue·PR·댓글의 외부 payload와 HCP lifecycle 실행권한을 분리하고, 대상·payload preview 또는 digest·민감정보 여부·승인 범위·재승인 조건을 구조화하는 절차를 검토한다.

## 2. 발생 배경

세션 019에서 기존에는 별도 승인이 없던 GitHub 작업이 실행 환경의 외부 전송 검토에 의해 추가 승인을 요구할 수 있음을 확인했다. 이는 Harness 태그의 의미 변화나 CLI 권한 해제와 구분해야 하며, 실행 환경 승인과 HCP lifecycle 권한을 동일한 상태로 오해하지 않도록 별도 evidence가 필요하다.

## 3. 기대 효과

- 어떤 GitHub 대상과 payload가 승인됐는지 재현한다.
- 네트워크 재시도와 외부 payload 재승인을 구분한다.
- 완료된 action을 반복하지 않으면서 승인 범위가 달라질 때만 재확인한다.

## 4. 처리 기준

- Issue·PR·댓글별 대상과 payload digest 필드를 정의한다.
- 민감정보 점검 결과와 승인 주체·시각·범위를 기록한다.
- payload, 대상 저장소, action이 바뀔 때의 재승인 조건을 정의한다.
- Codex 실행 환경의 승인과 HCP gate 결과를 독립 evidence로 저장한다.
- 실제 승인 차단 사례 또는 운영 요구가 확보되기 전에는 현재 workflow를 확장하지 않는다.

## 5. 연결 이력

| 날짜 | 상태 | 연결 대상 | 내용 |
|---|---|---|---|
| 2026-07-25 | Open | codex_blg_019_001 | 세션 메모를 Medium 공식 Backlog로 전환 |

[목차로 이동](#blg-031-github-외부-payload-승인과-hcp-실행권한-분리)
