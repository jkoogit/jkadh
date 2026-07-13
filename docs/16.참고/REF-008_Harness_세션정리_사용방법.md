# REF-008 Harness 세션정리 사용방법

| 항목 | 값 |
|---|---|
| 문서 ID | REF-008 |
| 문서 유형 | 참고 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.4 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | main |
| 작업 브랜치 | task_codex/073-hcp-session-close-retrospective-guard |
| 최종 수정일 | 2026-07-13 |

## 1. 목적

`#세션정리`는 채팅 세션 단위의 종료 절차를 처리한다. 완료 태스크, 세션명, Issue 현행화, 남은 Backlog/Issue/PR, 회고, 다음 세션 인계를 확인하고, 검증된 Issue만 종료한다.

일반 태스크 변경사항의 PR 생성/머지는 `#태스크정리`, `stg/main` 승급은 `#태스크승급`에서 처리한다. 단, 세션정리 중 생성된 회고 문서, 회고 인덱스, 미정리 세션정리 산출물은 `#세션정리`에서 PR 생성, `dev` 머지, `stg/main` 승급까지 처리할 수 있다.

## 2. 기본 사용

기본 태그는 실행모드다. 보고만 필요하면 `.보고` suffix를 사용한다.

```text
#세션정리
#세션정리.보고
#세션정리 010
```

세션번호를 제공하면 3자리로 정규화한다. 세션번호는 세션명 현행화 보조값이다. 예를 들어 `#세션정리 010 --session-name "Harness_HCP_세션정리"`는 보고서와 회고 산출물에서 `010_Harness_HCP_세션정리`로 다룬다. 세션번호가 없으면 보고서에는 빈값으로 표시한다.

세션번호는 Issue 제목 번호나 PR 순번이 아니다.

## 3. 세션 상태 파일

HCP는 세션별 상태 파일을 관리한다.

```text
.hcp/sessions/{status}/{sessionId}.json
```

세션 ID는 HCP가 발행한다.

```text
{agent}_ses_{sessionNumber|manual}_{yyyymmdd}_{seq}
```

예시는 다음과 같다.

```text
codex_ses_010_20260713_001
```

상태 흐름은 다음과 같다.

```text
active -> closing -> complete -> archived
```

`#세션시작`은 새 세션 파일을 만들고, 이전 `complete` 세션을 `archived`로 전환한다. `#세션정리` 실행 시 선택된 세션은 `closing`으로 전환되고, 세션정리 실행이 성공하면 `complete`가 된다. 판단 필요로 중단되면 `blocked`, 실행 실패는 `failed`로 기록한다.

세션 시작 시 세션명은 필수다. 같은 `agentId + sessionName`의 active 세션이 이미 있으면 새 세션 생성을 차단한다. 같은 agent에 여러 active 세션이 있는 것은 허용하지만, 세션명이 달라야 한다.

```text
#세션시작{
세션번호: 010
세션명: 010_Harness_HCP_세션상태관리_보강
에이전트: codex
}
```

활성 세션이 여러 개이면 `--session-id`로 대상을 지정해야 한다.

세션/태스크/백로그의 단순 이름 변경이나 상태 메모는 기존 태그 실행보다 전용 HCP 명령을 사용한다.

```powershell
node --experimental-strip-types src/cli.ts hcp session update `
  --session-id codex_ses_010_20260713_001 `
  --session-name "010_Harness_HCP_세션상태관리_보강"

node --experimental-strip-types src/cli.ts hcp task update `
  --session-id codex_ses_010_20260713_001 `
  --task-id codex_task_010_001 `
  --task-name "HCP 세션상태 파일 보강"

node --experimental-strip-types src/cli.ts hcp task delete `
  --session-id codex_ses_010_20260713_001 `
  --task-id codex_task_010_001 `
  --reason "태스크 시작 후 실제 작업 없음"
```

세션은 삭제하지 않고 업데이트만 허용한다. 태스크는 `active` 상태일 때만 삭제할 수 있다. `closed`, `promoted` 상태 태스크는 작업 이력이 있으므로 삭제하지 않는다.

백로그는 세션 상태 파일에 논의 메모로 등록, 수정, 삭제할 수 있다.

```powershell
node --experimental-strip-types src/cli.ts hcp backlog add `
  --session-id codex_ses_010_20260713_001 `
  --title "보고 옵션 정리" `
  --note "태스크 중 논의된 후속 검토"

node --experimental-strip-types src/cli.ts hcp backlog update `
  --session-id codex_ses_010_20260713_001 `
  --hcp-backlog-id codex_blg_010_001 `
  --status closed

node --experimental-strip-types src/cli.ts hcp backlog delete `
  --session-id codex_ses_010_20260713_001 `
  --hcp-backlog-id codex_blg_010_001 `
  --reason "논의 결과 불필요"
```

모든 변경은 세션 상태 파일의 `changeLog`에 남긴다.

태그 alias로도 같은 상태관리 명령을 사용할 수 있다.

```text
#세션현행화{
sessionId: codex_ses_010_20260713_001
세션명: 010_Harness_HCP_세션상태관리_보강
}

#태스크현행화{
sessionId: codex_ses_010_20260713_001
taskId: codex_task_010_001
태스크명: HCP 세션상태 파일 보강
}

#백로그추가{
sessionId: codex_ses_010_20260713_001
제목: 보고 옵션 정리
메모: 태스크 중 논의된 후속 검토
}

#백로그수정{
sessionId: codex_ses_010_20260713_001
백로그id: codex_blg_010_001
상태: closed
}

#백로그삭제{
sessionId: codex_ses_010_20260713_001
백로그id: codex_blg_010_001
사유: 논의 결과 불필요
}
```

Issue/PR 제목 변경은 실제 GitHub 변경이 성공한 뒤 세션 상태 파일을 갱신한다. 상태 파일만 바꿔야 하는 경우 `--state-only`를 사용한다.

```powershell
node --experimental-strip-types src/cli.ts hcp issue update `
  --session-id codex_ses_010_20260713_001 `
  --issue 73 `
  --title "[073]_[HCP]_세션정리_회고문서_누락방지_보강"

node --experimental-strip-types src/cli.ts hcp pr update `
  --session-id codex_ses_010_20260713_001 `
  --task-id codex_task_010_001 `
  --pr 74 `
  --title "[073]_(001)_HCP_세션정리_회고문서_누락방지_보강"
```

브랜치명 현행화는 상태 파일 변경을 기본으로 한다. 실제 원격 브랜치 rename은 자동 수행하지 않는다.

```text
#브랜치현행화{
sessionId: codex_ses_010_20260713_001
taskId: codex_task_010_001
브랜치명: task_codex/073-hcp-session-close-retrospective-guard
}
```

오래된 archived 세션은 명시 명령으로 정리한다. 기본 정책은 최근 20개 보존, 90일 초과 archived 세션 삭제다.

```powershell
node --experimental-strip-types src/cli.ts hcp archived cleanup --dry-run
node --experimental-strip-types src/cli.ts hcp archived cleanup --older-than-days 90 --keep 20
```

## 4. 필수 증거

세션정리 보고서가 ready가 되려면 다음 증거가 필요하다.

| 항목 | 옵션 |
|---|---|
| 완료 태스크 | `--completed-task`, `--completed-tasks` |
| 세션명 현행화 | `--session-name` |
| Issue 현행화 | `--issue-update`, 또는 실행 옵션 `--issue-title`, `--issue-body`, `--issue-comment` |
| 남은 Backlog/Issue/PR | `--remaining`, 또는 CLI 자동 조회 |
| 회고 요약 | `--retrospective` |
| 회고 산출물 | `--retrospective-doc`, `--retrospective-deferred`, 또는 실행모드 자동 생성 |
| 다음 세션 인계 | `--handoff` |

판단이 필요한 항목은 보고서의 `decision required` 체크와 JSON `decisionRequired`에 표시된다.

CLI에서 `jkadh session close`를 실행하면 `--remaining`이 없을 때 GitHub open Issue/PR, Backlog 인덱스, 원격 `dev/stg/main` 정렬 상태를 자동 조회한다. 조회가 가능하면 `remaining backlog issue PR` 증거를 자동으로 채우고, 보고서의 `auto status lookup`에 조회 결과를 표시한다.

## 5. 회고 산출물

`--retrospective`가 있고 `--retrospective-doc`, `--retrospective-deferred`가 모두 없으면 실행모드에서 다음 `RET-*` 회고 초안을 생성하고 `docs/12.회고/README.md`를 갱신한다.

세션 상태 파일이 연결되어 있으면 `--handoff`가 없어도 HCP 상태 기반 인계문구 초안을 자동 생성한다. 생성된 회고 문서에는 세션 ID, agent ID, 연결 Issue, 태스크 상태, 백로그 상태 요약을 자동 삽입한다.

```powershell
node --experimental-strip-types src/cli.ts session close `
  --session-number 010 `
  --completed-task "Harness session close guard" `
  --session-name "010_Harness_HCP_세션정리_보강" `
  --issue-update "Issue #73 updated" `
  --remaining "No open PR" `
  --retrospective "RET draft ready" `
  --handoff "Next session starts from generated RET" `
  --execute
```

## 6. Issue 현행화

Issue 현행화 실행은 `--related-issue`를 기준으로 수행한다.

```powershell
--related-issue 73 `
--issue-title "[073]_[HCP]_세션정리_회고문서_누락방지_보강" `
--issue-body "Updated session close scope" `
--issue-comment "Session close artifact PR and promotion completed"
```

`--issue-title`, `--issue-body`, `--issue-comment`가 없더라도 `--related-issue`와 `--issue-update`가 함께 있으면 `--issue-update` 내용을 Issue comment로 남긴다.

Issue 제목은 `[이슈번호]_[그룹명]_제목` 형식을 사용한다. 예시는 `[073]_[HCP]_세션정리_회고문서_누락방지_보강`이다.

## 7. 세션정리 산출물 PR

회고 문서 또는 `--path`로 지정한 세션정리 산출물을 PR로 반영하려면 다음 옵션이 필요하다.

| 옵션 | 설명 |
|---|---|
| `--message` | 커밋 메시지 |
| `--pr-title` | PR 제목. `[이슈번호]_(이슈내PR순번)_제목` 형식 |
| `--related-issue` | PR 본문 `Related #번호` 연결 |
| `--path`, `--paths` | 추가 반영 경로 |
| `--base` | PR base. 기본값 `dev` |
| `--no-merge` | PR 생성 후 머지 생략 |
| `--target-branches` | 승급 대상. 기본값 `stg,main` |
| `--no-promote` | 머지 후 승급 생략 |

PR 순번 `(001)`은 자동 채번하지 않는다. `--pr-title`로 명시한다. 값이 없으면 빈값/필수옵션 누락으로 보고하고 실행을 차단한다. 이 값은 세션번호와 별개다.

승급은 `dev` 머지 결과를 `stg`, `main`에 반영한 뒤 원격 브랜치 커밋이 같은지 검증한다.

## 8. Issue 종료

Issue 종료는 `#세션정리`에서만 가능하다. `--verified-issue`가 있는 경우에만 종료한다.

```powershell
--verified-issue 73
```

검증된 종료 후보가 없으면 Issue 종료 단계에서 `no verified issue close candidate`로 중단한다.

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-13 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness `#세션정리` 사용방법 문서 작성 |
| 2026-07-13 | [#73](https://github.com/jkoogit/jkadh/issues/73) | Codex | GPT-5 | CTO | jk / Codex | Update | 회고 생성, Issue 현행화, 세션정리 산출물 PR/머지/승급/검증 기준 추가 |
| 2026-07-13 | [#73](https://github.com/jkoogit/jkadh/issues/73) | Codex | GPT-5 | CTO | jk / Codex | Update | HCP 상태관리 alias, taskId 주문서, 인계문구 자동 생성, 회고 상태 요약, 제목/브랜치 현행화, archived 정리 정책 추가 |

[목차로 이동](#ref-008-harness-세션정리-사용방법)
