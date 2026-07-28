# REF-012 HCP 세션 작업 Work Item 관리 사용방법

## 목적

HCP Work Item은 태스크 내부에서 파생되는 세부 작업과 종속성을 세션 runtime에 기록한다. 현재 태스크 안에서 완료될 작업은 Work Item으로 관리하고, 별도 주제로 넘겨야 할 미완료 작업만 세션정리에서 Backlog 전환 후보로 제시한다.

## 상태

`candidate`, `ready`, `active`, `done`, `blocked`, `deferred`, `cancelled`, `backlogged`를 사용한다. 상태를 변경할 때는 `--reason`이 필수이며 필요하면 `--detail`에 검증 결과나 실패 증거를 기록한다.

세션정리의 종결 상태는 `done`, 근거가 있는 `cancelled`, Backlog ID 또는 경로가 연결된 `backlogged`다. 나머지 상태가 하나라도 있으면 회고 파일을 만들기 전에 세션정리를 차단하고 세션을 `active`로 유지한다.

`candidate`, `blocked`, `deferred` 상태에는 `candidate:<workItemId>` 형식의 안정적인 Backlog 후보 ID가 부여된다. 세션정리를 재시도해도 같은 후보 ID가 재사용되며 Backlog 문서는 자동 생성하지 않는다.

## 관계와 표시

- `sourceTaskId`: Work Item이 속한 HCP 태스크
- `parentId`: 계층상 부모 Work Item
- `derivedFromId`: 발견이나 실패가 파생된 원본 Work Item
- `dependsOnIds`: 완료를 선행해야 하는 Work Item 목록
- `displayId`: `T4.1`, `T4.1.1`처럼 사람이 읽는 계층 번호
- `workItemId`: 재정렬과 관계없이 유지되는 영구 ID

## CLI

```powershell
node --experimental-strip-types src/cli.ts hcp work add `
  --session-id codex_ses_023_20260727_001 `
  --title "상태 모델 구현" `
  --status active `
  --source-task-id codex_task_023_004 `
  --reason "구현 시작"

node --experimental-strip-types src/cli.ts hcp work update `
  --session-id codex_ses_023_20260727_001 `
  --work-item-id codex_work_023_001 `
  --status done `
  --reason "전체 테스트 통과" `
  --detail "npm test"

node --experimental-strip-types src/cli.ts hcp work graph `
  --session-id codex_ses_023_20260727_001
```

`graph`는 태스크와 Work Item을 포함한 텍스트 트리와 Mermaid 관계도를 함께 출력한다. 태스크 간 파생·의존 관계는 다음처럼 등록한다.

```powershell
node --experimental-strip-types src/cli.ts hcp task relate `
  --session-id codex_ses_023_20260727_001 `
  --task-id codex_task_023_004 `
  --derived-from-task-id codex_task_023_003 `
  --depends-on-task codex_task_023_001,codex_task_023_002,codex_task_023_003 `
  --reason "세션정리 보완 논의에서 파생"
```

추가 시 `--parent-id`, `--derived-from-id`, `--depends-on`을 선택적으로 지정한다. 자기 자신 참조, 존재하지 않는 관계, 부모 순환은 차단한다.

## 미완료 항목 결정

세션정리가 미완료 항목을 발견하면 항목별로 추가 태스크, Backlog, 취소 중 하나를 요구한다. 자연어 피드백만으로 HCP 상태를 변경하지 않으며 HCP 실행 요청을 받은 뒤 `work decide`로 증거를 연결한다.

```powershell
# 연결 태스크가 promoted되면 done, 아니면 deferred로 유지
node --experimental-strip-types src/cli.ts hcp work decide --session-id <session> --work-item-id <work> --decision task --resolution-task-id <task> --reason "추가 태스크 처리"

# 후보 marker가 같은 기존 Backlog를 재사용하거나 문서와 인덱스를 생성·검증한 뒤 backlogged
node --experimental-strip-types src/cli.ts hcp work decide --session-id <session> --work-item-id <work> --decision backlog --reason "Backlog 전환 승인"

# 사유를 증거로 남기고 cancelled
node --experimental-strip-types src/cli.ts hcp work decide --session-id <session> --work-item-id <work> --decision cancel --reason "처리 불필요 근거"
```

Backlog 결정은 `HCP candidate:<workItemId>` marker로 재시도 대상을 식별한다. 문서 생성 뒤 상태 저장이 실패해도 다음 시도에서 같은 문서와 인덱스를 찾아 재사용하므로 중복 Backlog를 만들지 않는다.

## 세션정리

회고에는 태스크·Work Item 통합 텍스트 트리와 Mermaid 관계도가 포함된다. `done`과 `cancelled`는 세션 이력으로 보존한다. `candidate`, `blocked`, `deferred`는 `Backlog conversion candidates`에 표시하지만 사용자 승인 전에는 문서 Backlog로 전환하지 않는다. 승인된 후보는 `--status backlogged --backlog-id <id> --backlog-path <path>`로 연결 증거를 기록한다. 추가 태스크로 처리할 때는 `--resolution-task-id`를 기록하며 해당 태스크가 promoted된 후에만 원본 Work Item을 `done`으로 종결한다.

기존 HCP runtime에는 `workItems`가 없어도 빈 목록으로 해석하므로 소급 수정이 필요하지 않다.
# 응답 기반 자동등록과 피드백 보정

`#태스크시작`, `#태스크처리`, `#백로그추가` 실행 응답에서 새로 확정한 작업은 현재 HCP 세션의 Work Item으로 자동 등록한다. 동일 태스크·부모·정규화 제목의 조합은 fingerprint로 식별하여 반복 응답에서 중복 생성하지 않고, 상태가 달라졌으면 변경하며 같으면 기존 항목을 재사용한다.

응답에는 다음 순서로 표시한다.

1. 이번 응답의 변경 세트: 신규 등록, 상태 변경, 기존 재사용, 등록 제외 제안
2. 전체 세션 작업 텍스트 트리: 이번 응답에서 신규 등록된 항목에는 `[NEW]` 표시
3. 동일 범위의 Mermaid 그래프

`[NEW]`는 영구 상태가 아니라 해당 응답의 change set에만 속하는 표시다. 코드 검색, 테스트 실행처럼 독립적으로 추적할 필요가 없는 수행 행위는 등록 제외 제안에 명시할 수 있다.

사용자의 자연어 피드백은 즉시 상태를 바꾸지 않는다. 보정 내용은 pending feedback으로 기록하고, 다음 `#태스크시작`, `#태스크처리`, `#백로그추가` 실행 초기에 원자적으로 적용한다. 제목·상태·부모·의존관계를 보정할 수 있으며 적용 결과는 세션 변경 이력과 Work Item 증거에 남긴다.

pending 피드백은 모든 항목을 메모리 상태에 먼저 적용하고 관계·상태 전환을 검증한 뒤 세션 파일을 한 번만 저장한다. 하나라도 검증에 실패하면 전체 보정을 저장하지 않고 모든 항목을 pending으로 유지한다.

각 태그 orchestration은 실행 직전의 change set 개수를 기준으로 정확히 하나의 새 change set이 생성됐는지 확인한다. source command와 source task도 일치해야 하며, 누락되거나 다른 변경 세트가 기록되면 성공 응답을 중단한다. 이 게이트는 문서 Backlog가 활성 HCP 세션 안에서 생성되는 경우와 HCP 세션 Backlog 등록에도 동일하게 적용한다.

응답 Work Item 동기화도 제안 전체와 change set을 메모리에서 구성·검증한 뒤 세션 파일을 한 번만 저장한다. 중간 제안이 유효하지 않으면 앞선 Work Item 추가·상태 변경과 change set을 모두 저장하지 않는다.

피드백 일괄 적용이 실패하면 Work Item은 변경하지 않고 피드백을 pending으로 유지하면서 `applyAttempts`, `lastAttemptedAt`, `lastApplyError`를 기록한다. 따라서 다음 태그 실행에서 실패 원인을 보정한 뒤 동일 피드백을 다시 적용할 수 있다.

활성 HCP 세션에서 문서 Backlog를 추가할 때는 세션 ID와 정규화 제목으로 안정적인 `HCP response-backlog` marker를 문서에 기록한다. 문서·인덱스 생성 후 HCP 연결이 실패한 경우 다음 동일 요청은 marker가 있는 기존 문서를 재사용하고 Work Item 및 change set 연결만 재시도한다.
