# POL-002 Issue 작성정책

| 항목 | 값 |
|---|---|
| 문서 ID | POL-002 |
| 문서 유형 | 정책 |
| 상태 | Draft |
| 성숙도 | Candidate |
| 버전 | v0.1 |
| 소유자 | jk |
| 작성 에이전트 | Codex |
| 기준 브랜치 | dev |
| 작업 브랜치 | task_codex/001-docs-governance-foundation |
| 최종 수정일 | 2026-07-08 |

## 목차

- [1. 목적](#1-목적)
- [2. 적용 범위](#2-적용-범위)
- [3. Issue의 역할](#3-issue의-역할)
- [4. 작성 원칙](#4-작성-원칙)
- [5. Issue 유형](#5-issue-유형)
- [6. 제목 규칙](#6-제목-규칙)
- [7. 본문 구조](#7-본문-구조)
- [8. 현재 작업 Issue 예시](#8-현재-작업-issue-예시)
- [9. Branch, Commit, PR 연결](#9-branch-commit-pr-연결)
- [10. Backlog 처리](#10-backlog-처리)
- [11. 관련 문서](#11-관련-문서)
- [작업 이력](#작업-이력)

## 1. 목적

본 문서는 JKADH에서 GitHub Issue를 작성하고 작업 단위로 사용하는 기준을 정의한다.

Issue는 단순한 할 일 목록이 아니라 대화에서 도출된 내용을 공식 작업으로 승격하는 Work Order 역할을 한다.

## 2. 적용 범위

이 문서는 JKADH의 모든 작업 Issue에 적용한다.

다음 항목은 본 문서의 적용 대상이다.

- Issue 제목
- Issue 유형
- Issue 본문 구조
- 작업 범위와 제외 범위
- 완료 조건
- Branch, Commit, PR과의 연결
- 후속 작업과 Backlog 처리

## 3. Issue의 역할

JKADH에서 Issue는 다음 역할을 가진다.

| 역할 | 설명 |
|---|---|
| 작업 요청서 | 무엇을 할지 정의한다. |
| 범위 잠금 장치 | 무엇을 하지 않을지 정의한다. |
| 검토 기준 | 완료 조건을 명시한다. |
| 추적 단위 | Branch, Commit, PR, Review와 연결한다. |
| 대화 승격 단위 | 대화에서 나온 내용을 공식 작업으로 승격한다. |

## 4. 작성 원칙

Issue 작성 원칙은 다음과 같다.

- 하나의 Issue는 하나의 세션 또는 업무 단위를 가진다.
- 하나의 `task_` 브랜치는 하나의 Issue와 연결한다.
- 하나의 Issue는 하나의 PR로 닫는 것을 기본으로 하되, 같은 Issue 안에서 검토 가능한 정리 단위가 나뉘면 여러 PR을 연결할 수 있다.
- Issue에는 반드시 완료 조건을 작성한다.
- Issue에는 반드시 제외 범위를 작성한다.
- 실행 중 나온 새 아이디어는 현재 Issue에 즉시 섞지 않는다.
- 새 아이디어는 Backlog 또는 후속 Issue 후보로 분리한다.
- PR 본문에는 기본적으로 `Related #이슈번호`를 포함한다.
- 완료 조건이 모두 충족되어 해당 PR 머지만으로 Issue를 닫아도 되는 경우에만 `Closes #이슈번호` 같은 자동 종료 키워드를 사용한다.

## 5. Issue 유형

초기 Issue 유형은 다음 값을 사용한다.

| 유형 | 의미 |
|---|---|
| DOC | 문서 작성 또는 수정 |
| POLICY | 정책 수립 또는 변경 |
| DESIGN | 설계 정리 |
| IMPL | 구현 |
| REVIEW | 검토 또는 점검 |

필요한 경우 다음 유형을 추가할 수 있다.

- BUG
- OPS
- EXP
- RETRO

## 6. 제목 규칙

Issue 제목은 다음 형식을 사용한다.

```text
[이슈번호]_[작업유형]_<이슈명>
```

예:

```text
[001]_[POL]_문서_거버넌스_기반_구축
[002]_[ORG]_에이전트_운영규칙_및_태스크_흐름_정리
[005]_[RET]_세션_회고_정리
[006]_[STA]_세션_시작_및_태스크_정리_절차_보강
```

규칙은 다음과 같다.

- `[이슈번호]`는 GitHub가 Issue와 PR을 섞어 부여하는 번호가 아니라, 작업 Issue만 따로 센 3자리 순번을 사용한다.
- `[작업유형]`은 변경되는 공식 문서의 대표 문서 ID prefix 하나를 사용한다.
- 여러 유형이 함께 변경되면 작업 목적을 가장 잘 나타내는 대표 유형 하나만 제목에 표시하고, 나머지 유형은 Issue 본문 작업 범위에 남긴다.
- 이슈명은 한글을 사용할 수 있으며, 단어 구분은 `_`를 사용한다.
- Issue 생성 전에는 순번을 확정할 수 없으므로, Issue 생성 직후 기존 작업 Issue 목록을 기준으로 순번을 확정하고 제목을 보정한다.
- 문서 prefix가 아직 정해지지 않은 작업은 가장 가까운 작업 유형을 사용하고, 필요하면 Issue 본문에 판단 근거를 남긴다.
- GitHub Issue URL의 `#번호`는 링크와 종료 판단에만 사용하고, 제목의 Issue 순번으로 사용하지 않는다.

## 7. 본문 구조

Issue 본문은 다음 구조를 기본으로 한다.

```markdown
## 목적

이 Issue의 목적을 작성한다.

## 배경

이 작업이 필요한 이유와 논의 출처를 작성한다.

## 작업 범위

- [ ] 수행할 작업 1
- [ ] 수행할 작업 2
- [ ] 수행할 작업 3

## 제외 범위

- 제외 항목 1
- 제외 항목 2

## 완료 조건

- [ ] 결과물이 저장소에 반영되어 있다.
- [ ] 관련 문서 링크가 깨지지 않는다.
- [ ] 필요한 검증을 수행했다.
- [ ] PR이 `dev`를 대상으로 생성되어 있다.
- [ ] PR 본문에 `Related #이슈번호`가 포함되어 있다.

## 관련 문서

- 관련 문서 링크

## 관련 브랜치

```text
task_codex/NNN-scope
```

## 관련 PR

PR 생성 후 링크를 추가한다.

## 후속 작업

- 후속 Issue 후보
```

## 8. 현재 작업 Issue 예시

첫 작업 Issue는 다음 형태를 기준으로 작성한다.

```markdown
# [DOC] 문서관리방안 및 문서 폴더 인덱스 구축

## 목적

JKADH 공식 문서의 관리 기준을 정의하고, 초기 문서 폴더 구조와 각 폴더 README 인덱스를 구축한다.

## 배경

GPT 세션과 Codex 작업 과정에서 문서 포맷, 파일명, 폴더 구조, 브랜치 규칙이 계속 흔들리는 문제가 확인되었다.

서비스 구조 문서보다 먼저 문서관리방안과 Issue 작성정책을 수립해 이후 문서 작업의 기준을 고정한다.

## 작업 범위

- [ ] `POL-001_문서관리방안.md` 작성
- [ ] `POL-002_Issue_작성정책.md` 작성
- [ ] 문서 폴더 prefix 정의
- [ ] 문서 ID와 파일명 규칙 정의
- [ ] 문서 Header와 작업 이력 규칙 정의
- [ ] `docs/README.md` 작성
- [ ] 각 문서 폴더 `README.md` 작성

## 제외 범위

- 대화운영규칙 작성
- 에이전트 역할별 운영규칙 작성
- Git 작업관리방안 상세 작성
- 실제 서비스 설계 문서 작성
- 템플릿 문서 작성

## 완료 조건

- [ ] `docs/03.정책/POL-001_문서관리방안.md`가 작성되어 있다.
- [ ] `docs/03.정책/POL-002_Issue_작성정책.md`가 작성되어 있다.
- [ ] `docs/README.md`가 작성되어 있다.
- [ ] `00.시작`부터 `14.학습`까지 각 폴더에 `README.md`가 있다.
- [ ] Markdown 링크 검증이 통과한다.
- [ ] `git diff --check`가 통과한다.
- [ ] PR이 `dev` 대상으로 생성되어 있다.
- [ ] PR 본문에 `Related #이슈번호`가 포함되어 있다.

## 관련 브랜치

```text
task_codex/001-docs-governance-foundation
```
```

## 9. Branch, Commit, PR 연결

Issue와 Git 작업은 다음 흐름으로 연결한다.

```text
Issue
↓
task_ branch
↓
commit
↓
PR to dev
↓
merge
↓
Issue close
↓
new Issue or next Issue
↓
new task_ branch
```

원칙은 다음과 같다.

- Issue 번호는 PR 제목 또는 본문에 포함한다.
- PR 본문에는 기본적으로 `Related #이슈번호`를 포함한다.
- PR 머지만으로 Issue를 닫아도 되는 경우에만 `Closes #이슈번호` 같은 자동 종료 키워드를 사용한다.
- PR이 `dev`에 머지되더라도 해당 Issue의 완료 조건 충족 여부를 별도로 확인한다.
- 이어서 작업할 경우 최신 `origin/dev`에서 새 `task_` 브랜치를 만든다.

## 10. Backlog 처리

작업 중 새 아이디어가 나오면 현재 Issue에 즉시 추가하지 않는다.

Backlog는 진행 중인 태스크가 있을 때, 그 태스크의 완료 조건과 분리해야 하는 번외 또는 후속 주제를 보관하는 경로다. 진행 중인 태스크가 없는 상태의 새 작업 주제는 Backlog가 아니라 `#태스크시작` 대상으로 처리한다.

새 아이디어는 다음 중 하나로 분리한다.

| 분류 | 의미 |
|---|---|
| 후속 Issue 후보 | 다음 작업 단위로 만들 가능성이 있는 항목 |
| Backlog | 좋지만 지금은 작업하지 않을 항목 |
| Rejected | 이번에는 제외할 항목 |

현재 Issue의 완료 조건을 먼저 끝내는 것을 우선한다.

세션 회고와 종료 정리는 별도 Issue로 분리하지 않고 현재 Issue의 마무리 태스크로 처리한다. 회고가 독립적인 정책, 설계, 운영 개선 작업으로 커지면 Backlog 또는 새 Issue 후보로 분리한다.

Issue 진행 중 현재 태스크와 맞지 않는 주제가 들어오면 즉시 작업하지 않고 먼저 분류한다.

| 분류 | 판단 기준 | 처리 |
|---|---|---|
| 현재 Issue 반영 | 현재 Issue의 목적, 완료 조건, 변경 파일과 직접 연결된다. | 현재 태스크 범위에 포함하고 필요하면 Issue명 또는 완료 조건을 현행화한다. |
| `[번외]` 기록 | 현재 Issue와 맥락은 있지만 주 완료 조건은 아니다. 작고 되돌리기 쉬우며 현재 흐름을 크게 방해하지 않는다. | 같은 Issue 안에서 `[번외]`로 표시하고 PR 본문 또는 Report에 별도 항목으로 남긴다. |
| Backlog 분리 | 주제가 독립적이거나, 판단이 필요하거나, 작업량이 크거나, 현재 완료 조건을 흔든다. | Backlog로 등록하고 다음 Issue 선정 시 검토한다. |
| 새 Issue 후보 | 즉시 또는 가까운 시점에 별도 업무 단위로 진행할 가치가 크다. | Backlog에 새 Issue 후보로 남기거나 사람 리드에게 Issue 승격을 제안한다. |

`[번외]`로 처리한 항목도 작업이 커지거나 정책, 설계, 승인 경계에 영향을 주면 Backlog 또는 새 Issue 후보로 전환한다.

미해결 Backlog는 [Backlog 미해결 인덱스](../15.로그/backlog/README.md)에서 관리한다.

신규 Backlog 파일을 작성할 때는 [TPL-002 Backlog 템플릿](../08.템플릿/TPL-002_Backlog_템플릿.md)을 따른다. Backlog는 공식 문서와 달리 작업 이력을 두지 않고 연결 이력으로 상태 변경과 해결 근거를 추적한다.

Backlog 개별 파일은 생성일 기준 날짜 폴더에 고정하며, 해결되더라도 파일을 이동하지 않는다.

Issue 기반 작업 중 새로 생성하는 Backlog ID는 다음 형식을 우선 사용한다.

```text
BLG-{GitHub Issue 번호}-{Issue 안 Backlog 순번}
```

예:

```text
BLG-123-001_후속_처리기준_정리.md
BLG-123-002_동시작업_충돌방지_정리.md
```

규칙은 다음과 같다.

- `{GitHub Issue 번호}`는 GitHub URL의 `#번호`를 3자리로 적는다.
- `{Issue 안 Backlog 순번}`은 같은 Issue에서 발생한 Backlog만 따로 센 3자리 순번이다.
- Backlog Header에는 `연결 Issue`를 링크로 유지한다. ID는 정렬과 충돌 방지 기준이고, `연결 Issue`는 추적 링크다.
- Issue 없이 생성된 기존 `BLG-###` 형식은 소급 변경하지 않는다.
- 기존 Backlog 파일명과 링크는 안정성을 위해 유지하고, 새 형식은 신규 Backlog부터 적용한다.

Backlog 상태는 다음 값을 사용한다.

| 상태 | 한글명 | 의미 |
|---|---|---|
| Open | 등록 | 등록만 되었고 아직 분류하지 않음 |
| Ready | 준비 | 바로 Issue로 승격 가능 |
| Blocked | 차단 | 선행 Issue, 결정, 문서가 필요함 |
| Deferred | 보류 | 필요하지만 당장 우선순위가 낮음 |
| Issue Linked | 이슈 연결 | GitHub Issue로 승격됨 |
| Resolved | 해결 | 해결됨 |
| Rejected | 채택 제외 | 채택하지 않음 |

Backlog 처리시점은 다음 값을 사용한다.

| 처리시점 | 의미 |
|---|---|
| 즉시 | 현재 Issue 범위를 해치지 않고 바로 처리 가능 |
| Issue 종료 시 | 현재 Issue 완료 전 정리 필요 |
| 다음 Issue 선정 시 | 다음 작업 후보로 검토 |
| 선행 작업 완료 후 | 의존 대상이 해결되면 재검토 |
| 정기 점검 시 | 장기 보류 항목 점검 |

Issue 진행 중에는 백로그를 해결하려고 하지 않고 등록과 최소 분류를 우선한다.

Issue 종료 전에는 다음 순서로 백로그를 정리한다.

```text
Open 확인
↓
현재 Issue에서 해결된 항목 Resolved 처리
↓
즉시 처리 가능한 항목 Ready 분류
↓
선행 작업이 필요한 항목 Blocked 분류
↓
장기 보류 항목 Deferred 분류
↓
미해결 인덱스 갱신
```

해결된 Backlog는 개별 파일의 상태를 `Resolved`로 바꾸고, 미해결 인덱스에서 제거한다.

Backlog가 해결되면 다음 항목을 확인한다.

- Backlog 파일의 상태, 연결 Issue, 연결 PR, 해결 문서를 갱신한다.
- `backlog/README.md`의 미해결 목록에서 제거한다.
- 출처 문서 또는 관련 문서의 내용이 더 이상 맞지 않으면 해당 문서를 함께 수정한다.
- 출처 문서 또는 관련 문서가 여전히 유효하면 수정하지 않는다.
- Backlog에는 별도 작업 이력을 두지 않고 연결 이력에 상태 변경, 관련 Issue, 관련 PR, 해결 문서를 기록한다.

## 11. 관련 문서

- [POL-001 문서관리방안](./POL-001_문서관리방안.md)
- [TPL-002 Backlog 템플릿](../08.템플릿/TPL-002_Backlog_템플릿.md)
- [Backlog 미해결 인덱스](../15.로그/backlog/README.md)

[목차로 이동](#목차)

---

## 작업 이력

| 작업일시 | 관련 Issue | 작업 도구 | AI 모델 | 에이전트 역할 | 작성자 | 변경 유형 | 내용 |
|---|---|---|---|---|---|---|---|
| 2026-07-04 | - | Codex | GPT-5 | 문서 작성 | jk / Codex | Create | Issue 작성정책 최초 작성 |
| 2026-07-04 | - | Codex | GPT-5 | 문서 작성 | jk / Codex | Revise | Backlog 미해결 인덱스와 날짜 기반 파일 관리 원칙 반영 |
| 2026-07-04 | - | Codex | GPT-5 | 문서 작성 | jk / Codex | Revise | Backlog 해결 시 출처/관련 문서 조건부 현행화 규칙 추가 |
| 2026-07-04 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | 에이전트 역할체계 문서명 반영 |
| 2026-07-04 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | 작업 이력에 AI 모델 정보를 포함하도록 수정 |
| 2026-07-04 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | 작업 이력 Header를 에이전트와 역할 중심으로 단순화 |
| 2026-07-04 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | 작업 이력을 작업 도구, AI 모델, 에이전트 역할로 분리 |
| 2026-07-04 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | Backlog 상태와 처리시점 기준 추가 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | Backlog 상태 정의에 한글명 병기 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | 진행 중 끼어든 주제의 현재 Issue, 번외, Backlog 분류 기준 추가 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | Issue를 세션 또는 업무 단위로 운용하고 회고를 현재 Issue의 마무리 태스크로 처리하는 기준 추가 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | PR 본문 기본 연결 문구를 Related로 바꾸고 Issue 자동 종료 키워드를 예외 기준으로 제한 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | Issue 제목 형식과 생성 후 제목 보정 기준 추가 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | Issue 제목 번호를 GitHub 채번이 아닌 Issue 전용 순번으로 변경 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | Issue 제목의 ISS prefix 제거 |
| 2026-07-05 | - | Codex | GPT-5 | CTO | jk / Codex | Revise | Issue 제목 작업유형을 대표 prefix 하나로 단순화 |
| 2026-07-06 | [#19](https://github.com/jkoogit/jkadh/issues/19) | Codex | GPT-5 | CTO | jk / Codex | Revise | Issue 번호 기반 Backlog ID와 연결 이력 기준 추가 |
| 2026-07-08 | [#33](https://github.com/jkoogit/jkadh/issues/33) | Codex | GPT-5 | CTO | jk / Codex | Revise | 신규 Backlog 작성 기준을 Backlog 전용 템플릿으로 연결 |
| 2026-07-08 | [#41](https://github.com/jkoogit/jkadh/issues/41) | Codex | GPT-5 | CTO | jk / Codex | Revise | 공식 문서 Header 표 형식 현행화 |
| 2026-07-08 | [#46](https://github.com/jkoogit/jkadh/issues/46) | Codex | GPT-5 | CTO | jk / Codex | Revise | Backlog 생성 조건을 진행 중 태스크의 번외 또는 후속 주제로 한정 |
