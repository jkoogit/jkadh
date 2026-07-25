# REF-009 Harness 환경대응 호환성 이력

## 현행 구현 기준

이 문서는 Harness 기능이 외부 실행 환경, 승인 레이어, 도구 정책과 충돌했을 때의 대응 이력을 관리한다. 태그 자체보다 영향받은 기능을 중심으로 기록한다.

| 항목 | 값 |
|---|---|
| 문서 ID | REF-009 |
| 문서명 | Harness 환경대응 호환성 이력 |
| 상태 | Draft |
| 기준 Issue | [#97](https://github.com/jkoogit/jkadh/issues/97) |
| 기준 태스크 | codex_task_013_004 |

## 기록 기준

환경대응 이력은 다음 항목으로 기록한다.

| 항목 | 설명 |
|---|---|
| 증상 | 외부 환경에서 관찰된 차단, 오해석, 제한 |
| 영향받은 기능 | 태그가 아니라 실제 영향을 받은 Harness 기능 |
| 관련 태그/명령 | 기능을 호출하는 사용자 태그, CLI 명령 |
| 외부 환경 | 승인 레이어, GitHub, Git, 셸, OS 등 |
| 대응 | 호환성 보강 방식 |
| 기본 동작 유지 여부 | 기존 사용자 문법과 표준 의미를 유지하는지 |
| 사용자 피드백 | 사용자가 다음에 붙여넣거나 판단할 수 있는 안내 |
| 폐기 조건 | 대응을 제거하거나 Deprecated 처리할 조건 |
| 검증 방법 | 테스트, 문서, 수동 확인 방법 |

## 이력

### 2026-07-25 GitHub 실패 recovery evidence 공통화

GitHub 명령 실패는 완료된 로컬·원격 action을 반복하지 않도록 다음 구조로 보고한다.

| 필드 | 의미 |
|---|---|
| `failed action` | 실패한 `create_issue`, `create_pr`, `merge_pr`, `update_issue` 등의 action |
| `failure category` | `network`, `authentication`, `api`, `command`, `unknown` 중 하나 |
| `retryable` | 동일 payload를 즉시 재전송해도 되는지에 대한 기술적 판단. 사용자 승인 범위를 의미하지 않는다. |
| `recovery action` | 완료된 action을 보존하고 실패 action만 재시도하기 위한 다음 조치 |
| `failure` | stderr를 우선 사용해 공백을 정규화한 원본 실패 근거 |

태스크 시작·정리 실행 결과는 위 항목을 `recovery` 객체로도 반환한다. 태스크 정리 중 GitHub action이 실패하면 같은 구조가 HCP task의 `recoveryEvidence[]`와 `task.record_recovery_evidence` 변경 이력에 저장된다. `completedActions`와 `failedAction`을 분리해 커밋·push처럼 이미 성공한 action을 반복하지 않는다. 브랜치 생성, 커밋, 파일 쓰기 같은 Git·파일 오류는 GitHub API 실패로 분류하지 않는다.

네트워크 DNS·timeout·connection reset은 `network/retryable=yes`로 분류한다. 인증·권한 오류는 자격과 권한을 복구하기 전까지 재시도하지 않는다. API validation과 명령 옵션 오류는 대상 상태 또는 명령을 먼저 교정한다. `retryable=yes`도 GitHub 외부 payload에 대한 새로운 권한을 부여하지 않으며, 기존 HCP 실행 승인 범위 안에서 실패 action만 복구할 수 있다는 뜻이다.

### UTF-8 안전 편집 기준

- 저장소의 텍스트 파일은 UTF-8로 읽고 쓴다. Node API와 명령 실행은 `encoding: "utf8"`을 명시한다.
- 기존 한글 파일 수정은 `apply_patch` 또는 UTF-8을 명시하는 프로젝트 도구를 사용한다.
- PowerShell `Set-Content`, `Out-File`, `>` 리다이렉션은 버전별 기본 인코딩과 BOM·개행 동작이 다를 수 있으므로 기존 저장소 파일 편집에 사용하지 않는다.
- 불가피하게 PowerShell로 새 파일을 생성할 때도 `-Encoding utf8`을 명시하고, 기존 파일 전체 재기록은 피한다.
- 편집 후 `git diff --check`, 한글 문자열 회귀 테스트, 의도하지 않은 전체 파일 변경 여부를 확인한다.
- 콘솔 글자 깨짐만으로 파일 손상을 판단하지 않는다. UTF-8 명시 재읽기와 diff를 근거로 구분한다.

검증은 GitHub network/auth/API/command 분류 단위 테스트, 태스크 시작·정리·세션 정리 recovery 출력 테스트, 실제 한글 문자열 보존 테스트로 수행한다.

### 2026-07-15 #태스크정리 dev merge 승인 차단 대응

| 항목 | 내용 |
|---|---|
| 증상 | 단독 `#태스크정리`가 Harness 표준상 `dev` merge를 포함해도 외부 승인 레이어가 공유 브랜치 merge 명시 부족으로 차단했다. |
| 영향받은 기능 | 태스크 정리의 PR 생성 및 `dev` merge 실행 기능 |
| 관련 태그/명령 | `#태스크정리`, `#태스크정리.PR머지`, `jkadh task close --execute` |
| 외부 환경 | Codex 실행 승인 레이어 |
| 대응 | `#태스크정리.PR머지` suffix를 추가하고, 단독 `#태스크정리` merge 차단 시 붙여넣기 가능한 재승인 주문서를 출력한다. |
| 기본 동작 유지 여부 | `#태스크정리`의 표준 의미는 commit, push, PR 생성, `dev` merge 포함으로 유지한다. |
| 사용자 피드백 | 차단 시 `#태스크정리.PR머지`, 대상 PR, base `dev`, 차단 사유를 포함한 주문서를 출력한다. |
| 폐기 조건 | 외부 승인 레이어가 프로젝트 DSL의 merge 등가성을 안정적으로 인정하면 `#태스크정리.PR머지` 사용을 Deprecated 처리한다. |
| 검증 방법 | `npm test`, `npm run check`, tag-adapter/task-close 테스트, `jkadh tag "#태스크정리"` 출력 확인 |

[목차로 이동](./README.md)
