# REF-008 Harness CLI 5차구현 사용방법

| 항목 | 값 |
|---|---|
| 문서 ID | REF-008 |
| 문서 유형 | 참고 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/064-harness-cli-minimal |
| 최종 수정일 | 2026-07-12 |

## 목차

- [1. 목적](#1-목적)
- [2. 5차 구현 변경점](#2-5차-구현-변경점)
- [3. 세션 시작 report 추가 항목](#3-세션-시작-report-추가-항목)
- [4. 채팅 세션 주문 방법](#4-채팅-세션-주문-방법)
- [5. CLI 실행 방법](#5-cli-실행-방법)
- [6. 현재 적용 상태](#6-현재-적용-상태)
- [7. 제외 범위](#7-제외-범위)
- [8. 검증 방법](#8-검증-방법)
- [9. 후속 사용방법 문서화 기준](#9-후속-사용방법-문서화-기준)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 Harness CLI 5차 구현 시점의 사용방법을 정리한다.

5차 구현의 목적은 `#세션시작` report가 최신 회고와 Backlog를 대조해 다음 작업 후보, 초기 세션명, 추천 작업 브랜치명, 관련 Issue, 참고문서 리뷰 대상을 함께 제안하도록 보강하는 것이다.

본 문서는 5차 구현 시점의 사용방법 스냅샷이다. 이전 사용방법은 `REF-004`부터 `REF-007`까지의 문서에 남겨 둔다.

## 2. 5차 구현 변경점

5차 구현에서 추가된 항목은 다음과 같다.

| 항목 | 설명 |
|---|---|
| 최신 회고 상세 파싱 | 최신 `RET-*` 본문에서 다음 세션 추천 세션명, 권장 시작점, 남은 Backlog를 읽는다. |
| 세션 계획 생성 | 초기 세션명, 세션 번호 상태, 추천 작업 브랜치명, 관련 Issue, 추천 다음 작업을 만든다. |
| 관련 Issue 연결 | 열린 Issue 제목과 회고의 추천 작업을 대조해 관련 Issue를 찾는다. |
| 참고문서 리뷰 대상 | 최신 회고의 관련 문서 목록을 session start report에 표시한다. |

## 3. 세션 시작 report 추가 항목

현재 `session start` report는 다음 항목을 포함한다.

| 항목 | 상태 |
|---|---|
| 원격 `dev`, `stg`, `main` 일치 여부 | 적용 |
| 현재 브랜치와 작업트리 상태 | 적용 |
| 최신 회고 문서 | 적용 |
| 최신 회고의 다음 세션 권장 시작점 | 적용 |
| 미해결 Backlog 요약 | 적용 |
| 최신 회고와 다음 작업 후보를 반영한 초기 세션명 | 적용 |
| 세션명 번호 | 부분 적용. 저장소에서 안정적으로 알 수 없어 `manual_required`로 표시 |
| 추천 작업 브랜치명 | 적용 |
| 관련 Issue 존재 여부 | 적용. GitHub 조회 가능 시 열린 Issue와 대조 |
| 필요 시 Issue 등록 단계 | 적용. 관련 Issue가 없으면 `create issue before task start`로 표시 |
| 추천 다음 작업 | 적용 |
| 참고문서 리뷰 대상 | 적용. 최신 회고의 관련 문서 목록을 표시 |

## 4. 채팅 세션 주문 방법

채팅 세션에서는 다음처럼 주문한다.

```text
#세션시작

ProjectProfile은 jkadh를 사용하고,
내부 원격레포 기준으로 세션 시작 점검을 수행해줘.
원격 dev/stg/main 정합성, 작업트리, 최신 회고, Backlog, 열린 Issue/PR을 확인하고
다음 작업 후보를 기준으로 초기 세션명, 세션 번호 상태, 추천 브랜치명, 관련 Issue, 참고문서 리뷰 대상을 보고해줘.
쓰기 작업은 하지 말고 read/check/report로만 처리해줘.
```

## 5. CLI 실행 방법

현재 CLI는 아직 배포 또는 전역 설치하지 않는다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
node --experimental-strip-types src/cli.ts session start jkadh
```

GitHub 조회가 가능한 환경에서는 관련 Issue가 연결된다.

```text
session manual_required; Harness_CLI_1차구현_착수; branch task_codex/064-harness-cli-initial; issue #64 Harness CLI 1차 구현: read/check/report 최소 골격; next Harness CLI 1차 구현 착수
```

GitHub 조회가 불가능한 환경에서는 관련 Issue가 `not found`로 표시될 수 있다. 이 경우 세션 시작 report는 계속 생성된다.

## 6. 현재 적용 상태

현재 구현의 실제 출력 기준은 다음과 같다.

| 항목 | 현재 결과 |
|---|---|
| 브랜치 정합성 | `dev/stg/main: aligned` |
| 작업트리 상태 | 작업 중 변경 때문에 `dirty` |
| Backlog 후보 | `BLG-022`, `BLG-025` |
| 최신 회고 | `RET-008` |
| GitHub 열린 작업 | 승인 실행 기준 열린 Issue 1개, 열린 PR 0개 |
| 초기 세션명 | `Harness_CLI_1차구현_착수` |
| 세션 번호 | `manual_required` |
| 추천 브랜치명 | `task_codex/064-harness-cli-initial` |
| 관련 Issue | `#64 Harness CLI 1차 구현: read/check/report 최소 골격` |
| 추천 다음 작업 | `Harness CLI 1차 구현 착수` |

## 7. 제외 범위

5차 구현에서도 다음 작업은 수행하지 않는다.

- 세션 번호 자동 채번
- Issue 생성
- 작업 브랜치 생성
- PR 생성 또는 병합
- `dev`, `stg`, `main` 승급
- 외부 repo `env` 접근모드 실제 처리
- 참고문서 본문 요약 또는 품질 리뷰
- JSON report 파일 저장 옵션

## 8. 검증 방법

현재 구현 검증은 다음 명령으로 수행한다.

```powershell
cd D:\dev\workspace\ai.codex\jkadh\packages\harness-cli
npm test
npm run check
node --experimental-strip-types src/cli.ts session start jkadh
```

GitHub 조회까지 확인하려면 `gh` 네트워크 접근이 가능한 환경에서 같은 명령을 실행한다.

기대 결과는 다음과 같다.

- 테스트가 모두 통과한다.
- CLI 문법 확인이 통과한다.
- 최신 회고의 다음 세션 권장 시작점이 report에 표시된다.
- 초기 세션명과 추천 브랜치명이 표시된다.
- GitHub 조회 가능 시 관련 Issue가 연결된다.
- 참고문서 리뷰 대상이 표시된다.

## 9. 후속 사용방법 문서화 기준

다음 사용법 변경은 본 문서를 수정 누적하지 않고 별도 `REF-*` 문서로 남긴다.

후속 후보는 다음과 같다.

| 후보 | 설명 |
|---|---|
| 세션 번호 자동화 | Codex 채팅세션 번호 또는 사용자 입력값을 안정적으로 반영한다. |
| 참고문서 본문 리뷰 | 관련 문서의 존재 여부뿐 아니라 본문 요약과 확인 포인트를 report에 포함한다. |
| `#태스크시작` 실제화 | Issue/WorkOrder와 브랜치 생성 가능 조건을 실제로 확인한다. |
| JSON report 저장 | 세션 시작 report를 파일로 저장한다. |

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness CLI 5차 구현 사용방법 참고문서 작성 |

[목차로 이동](#목차)
