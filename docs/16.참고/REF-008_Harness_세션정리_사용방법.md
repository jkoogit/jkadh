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

`complete`는 `#세션정리`가 성공한 시점의 종료 결과이고 `completedAt`을 기록한다. `archived`는 다음 `#세션시작`에서 완료 세션을 현재 작업 대상과 분리한 보관 상태이며, 기존 `completedAt`을 유지한 채 `archivedAt`을 추가한다. 따라서 `archived`는 완료가 취소되거나 다른 결과로 바뀐 상태가 아니다.

회고의 HCP block은 문서가 생성된 snapshot 시점 상태를 `Session status at snapshot`으로 기록한다. 세션정리 도중 생성된 회고에는 `closing`과 함께 성공 후 최종 상태가 `complete`임을 표시한다. 회고는 종료 당시 evidence이므로 후속 세션에서 runtime이 `archived`로 전환되어도 회고 상태를 `archived`로 소급 수정하지 않는다. 현재 HCP runtime을 조회하는 보고서는 현재 상태인 `archived`와 `completedAt`, `archivedAt`을 기준으로 해석한다.

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

## 8. 실행 안전 게이트와 요약 출력

`session close --execute`는 쓰기 작업 전에 현재 브랜치를 확인한다. 현재 브랜치가 `dev`, `stg`, `main`이면 회고 작성, 커밋, push, PR 생성, 승급, Issue 종료를 시작하지 않고 blocked로 중단한다. 세션정리 산출물은 별도 작업 브랜치에서 생성해야 한다.

PR 산출물 반영이 요청된 경우 현재 브랜치가 PR base와 같으면 head/base 동일 조건으로 보고 쓰기 작업 전에 blocked로 중단한다. 이 조건은 GitHub PR 생성 실패가 난 뒤 복구하는 대신, 로컬 파일 쓰기와 원격 push 전에 차단하는 것을 목표로 한다.

회고 산출물을 자동 생성할 때는 생성 전과 생성 직후 `git diff --check`를 실행한다. 둘 중 하나라도 실패하면 이후 commit, push, PR, 승급 단계로 진행하지 않는다.

PR 생성 또는 이후 쓰기 단계에서 예외가 발생하면 실행 결과에 recovery report를 출력한다. recovery report에는 실패 action, 현재 branch, commit 생성 여부, push 여부, 남은 조치를 포함한다.

세션정리 report는 REF 전문을 반복 출력하지 않고 다음 요약 구조를 사용한다.

| 구조 | 용도 |
|---|---|
| `appliedPolicies` | 적용한 REF/POL ID와 짧은 적용 판단 요약 |
| `scopeDecision` | 세션정리 범위의 허용/차단 판단과 핵심 사유 |

REF 전문은 신규 기준을 처음 정의하거나 사람이 전문 확인을 요청한 경우에만 별도로 열람한다. 일반 보고와 HCP handoff에는 정책 ID와 판정 요약만 남긴다.

### 8.1 차단 시 조치

| 차단 조건 | 의미 | 조치 |
|---|---|---|
| protected branch | 현재 브랜치가 `dev`, `stg`, `main`이라 주요 브랜치 직접 쓰기 위험이 있다. | `origin/main` 또는 현재 기준 커밋에서 `session_codex/*` 또는 `task_codex/*` 작업 브랜치를 만들고 다시 실행한다. |
| head/base 동일 | PR base와 현재 브랜치가 같아 GitHub PR 생성이 실패할 조건이다. | `--base dev`는 유지하고 현재 브랜치를 별도 작업 브랜치로 전환한다. 이미 커밋이 있으면 커밋을 작업 브랜치로 옮긴 뒤 다시 실행한다. |
| pre-retrospective diff check 실패 | 회고 생성 전 작업트리에 공백/패치 오류가 있다. | 기존 변경의 `git diff --check` 오류를 먼저 수정한 뒤 재실행한다. |
| post-retrospective diff check 실패 | 자동 생성된 회고 또는 인덱스 변경에 공백/패치 오류가 있다. | 생성된 회고 문서와 `docs/12.회고/README.md`의 오류를 수정한 뒤 commit/push/PR 단계를 다시 시도한다. |
| open PR 재사용 차단 | 현재 브랜치에 open PR이 있고 명시 재사용 승인이 없다. | 기존 PR을 갱신하려면 `#세션정리.PR재사용` 승인 흐름으로 재실행한다. 새 PR이 필요하면 브랜치를 분리한다. |

차단은 실패가 아니라 쓰기 작업을 시작하기 전 위험 조건을 확인한 결과다. 차단된 경우에는 출력된 조건을 해소한 뒤 같은 명령을 다시 실행한다.

### 8.2 Recovery Report 해석

`recovery report`는 예외 발생 시 실행이 어디까지 진행됐는지 판단하기 위한 복구 정보다.

| 항목 | 해석 |
|---|---|
| `failed action` | 실패가 발생한 실행 단계다. `create_pr`이면 commit/push 이후 PR 생성에서 실패했을 수 있다. |
| `branch` | 실패 당시 작업 브랜치다. 후속 조치는 이 브랜치를 기준으로 확인한다. |
| `created commit` | `yes`이면 로컬 커밋이 생성된 상태다. amend, 추가 commit, PR 생성 중 하나를 선택한다. |
| `pushed branch` | `yes`이면 원격 브랜치에도 push된 상태다. 원격 PR 생성/갱신 또는 브랜치 정리 여부를 확인한다. |
| `remaining action` | Harness가 권장하는 다음 조치다. 사람이 현재 브랜치와 PR 상태를 확인한 뒤 이어간다. |
| `failure` | 원본 예외 메시지다. 네트워크, 인증, GitHub API 응답, 명령 옵션 오류를 구분하는 근거로 사용한다. |

`created commit: no`, `pushed branch: no`이면 보통 로컬 파일 수정 전 또는 커밋 전 차단이므로 조건을 수정하고 재실행하면 된다. `created commit: yes`, `pushed branch: no`이면 로컬 커밋만 있는 상태이므로 커밋 내용을 확인한 뒤 push 또는 amend를 선택한다. `pushed branch: yes`이면 원격 상태가 이미 바뀌었으므로 PR 생성/갱신, 브랜치 정리, 재실행 중 하나를 명시적으로 선택한다.

## 9. 관련 Issue 결산과 종료

세션정리는 HCP 세션의 `linkedIssue`와 모든 태스크의 `issueNumber`를 중복 없이 수집하고 GitHub 원격 상태를 확인한다. 각 Issue는 다음 중 하나로 분류한다.

| 분류 | 의미 |
|---|---|
| `closed` | 원격에서 이미 CLOSED인 Issue다. 별도 종료 명령을 실행하지 않는다. |
| `close` | 작업 범위가 완료되어 이번 세션정리의 PR 머지와 환경 승급 검증 뒤 종료한다. |
| `keep` | Issue를 OPEN으로 유지한다. 사유와 후속 위치가 필요하다. |
| `handoff` | 다음 세션 또는 별도 작업으로 넘긴다. 사유와 후속 위치가 필요하다. |

원격 상태가 OPEN인데 결정이 없거나, `keep`·`handoff`에 사유와 후속 위치가 없으면 HCP 세션을 `closing`으로 전환하기 전에 세션정리를 차단한다. Backlog 상태는 Issue 결산과 독립적이며 Deferred 또는 분리된 후속 Backlog가 남아 있어도 완료된 Issue를 종료할 수 있다.

Issue 종료는 `#세션정리`에서만 가능하다. `--verified-issue`는 해당 OPEN Issue를 `close`로 명시한다.

```powershell
--verified-issue 73
```

`keep`과 `handoff`는 `이슈번호|사유|후속 위치` 형식으로 지정한다.

```powershell
--keep-issue "74|외부 승인 대기|BLG-031" `
--handoff-issue "75|다음 세션에서 별도 검증|025_HCP_후속검증"
```

`close` 대상이 없고 모든 관련 Issue가 `closed`·`keep`·`handoff`로 결산된 경우 Issue 종료 명령은 실행하지 않는다. 다만 OPEN `keep`·`handoff` Issue에는 회고 marker, PR 머지, 환경 승급 검증이 끝난 최종 Issue 결산 단계에서 결정·사유·후속 위치를 댓글로 남긴다. `close` Issue는 같은 단계에서 결산 댓글과 함께 종료한다.

회고와 다음 세션 인계에는 관련 Issue별 상태·결정·사유·후속 위치를 기록하며, 추천 다음 작업 프롬프트는 복사 가능한 `text` 코드 블록으로 구분한다. 이 블록에는 `keep`·`handoff` Issue의 사유와 후속 위치를 자동으로 포함한다.

`keep`·`handoff` 댓글에는 세션·Issue·결정과 결산 내용 digest로 구성한 marker를 기록한다. 동일 marker가 이미 있으면 재실행에서 댓글을 재사용하고, 사유 또는 후속 위치가 변경되어 digest가 달라지면 새 결산 내용을 반영한다. 여러 Issue 중 후속 Issue 처리에 재시도 가능한 실패가 발생하면 recovery report의 `completed issue settlements`에 이미 반영된 Issue 번호를 기록하고 HCP 세션을 `active`로 복구한다. 재실행은 기존 marker 댓글을 건너뛴 뒤 남은 Issue부터 처리할 수 있다.

Issue 결산 직전까지 회고 생성·PR 머지·환경 승급이 완료된 경우에는 HCP 세션 runtime의 `sessionCloseCheckpoint`에 회고 경로, PR 번호, 승급 commit과 대상 브랜치, 완료된 Issue 결산 번호를 저장한다. 프로세스를 다시 시작한 뒤 `#세션정리`를 재실행하면 회고 파일 존재, PR `MERGED`, 대상 브랜치 SHA를 검증하고 성공한 경우 앞선 Git·PR·승급 단계를 반복하지 않고 `close_issue`부터 재개한다. checkpoint 검증 실패는 새 회고나 PR을 만들지 않고 세션을 `active`로 복구해 증거 보정을 요구한다. 세션정리가 성공하면 checkpoint를 삭제한다.

재실행에서는 checkpoint에 저장된 `close`·`keep`·`handoff` 결정과 사유·후속 위치를 복원하되 관련 Issue의 원격 OPEN/CLOSED 상태는 항상 다시 조회한다. 따라서 원격 처리는 성공했지만 CLI 응답만 실패한 경우 CLOSED 상태를 확인해 같은 Issue 종료를 반복하지 않는다.

checkpoint 검증 중 GitHub 또는 Git 명령이 실패하면 예외를 CLI 밖으로 전파하지 않고 failure category와 `retryable`을 포함한 recovery report를 생성하며 세션을 `active`로 복구한다. Issue 결산 실패 뒤 checkpoint 저장까지 실패한 경우에도 기존 checkpoint를 덮어쓰지 않고 세션을 `active`로 복구하며, checkpoint 저장소를 보정하기 전에는 즉시 재시도할 수 없는 실패로 기록한다.

marker 조회는 GitHub Issue comment API를 `per_page=100`, `--paginate`, `--slurp`로 끝까지 조회하여 오래된 marker도 재사용할 수 있게 한다.

## 10. 대화 요청 범위와 Backlog 확인

자연어 요청은 실행 승인이 아니므로 코드나 HCP 상태를 변경하지 않는다. `jkadh hcp request check`는 활성 태스크의 범위와 제외범위를 읽어 요청을 `in_scope`, `out_of_scope`, `unknown`으로 점검한다. 실행은 `#태스크처리`, `#백로그추가`와 같은 HCP 태그 또는 alias가 입력된 뒤 해당 실행 게이트에서만 시작한다.

```powershell
jkadh hcp request check `
  --session-id codex_ses_024_20260728_001 `
  --task-id codex_task_024_002 `
  --request "배포 작업도 진행해줘" `
  --scope-decision out_of_scope
```

범위 밖 자연어 요청은 `backlog_confirmation_required`로 차단하고, 사용자에게 등록 여부를 확인할 `#백로그추가` 프롬프트를 별도의 `text` 코드 블록으로 출력한다. 이 점검만으로는 Backlog를 등록하지 않으며 사용자가 alias를 승인한 뒤에만 세션 Backlog를 생성한다. 범위 안 자연어 요청도 바로 실행하지 않고 복사용 `#태스크처리` 블록을 반환한다.

추천 다음 작업 프롬프트는 `formatCopyablePrompt`를 사용해 항상 별도의 `text` 코드 블록으로 표시한다. 요청에서 생성하는 필드 값은 줄바꿈·중괄호·중첩 코드 fence를 제거해 복사 블록 구조가 깨지지 않게 한다.

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-13 | [#64](https://github.com/jkoogit/jkadh/issues/64) | Codex | GPT-5 | CTO | jk / Codex | Create | Harness `#세션정리` 사용방법 문서 작성 |
| 2026-07-13 | [#73](https://github.com/jkoogit/jkadh/issues/73) | Codex | GPT-5 | CTO | jk / Codex | Update | 회고 생성, Issue 현행화, 세션정리 산출물 PR/머지/승급/검증 기준 추가 |
| 2026-07-13 | [#73](https://github.com/jkoogit/jkadh/issues/73) | Codex | GPT-5 | CTO | jk / Codex | Update | HCP 상태관리 alias, taskId 주문서, 인계문구 자동 생성, 회고 상태 요약, 제목/브랜치 현행화, archived 정리 정책 추가 |
| 2026-07-27 | [#154](https://github.com/jkoogit/jkadh/issues/154) | Codex | GPT-5 | CTO | jk / Codex | Update | `complete` 종료 결과와 후속 `archived` 보관 상태의 표시 기준, timestamp 및 회고 snapshot 해석 기준 명확화 |

[목차로 이동](#ref-008-harness-세션정리-사용방법)
