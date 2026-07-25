# BLG-132-001 타겟서비스 대상 Harness 적용 재검토

> Backlog ID: BLG-132-001
> 상태: Deferred
> 유형: DESIGN
> 생성일: 2026-07-25
> 처리시점: 선행 작업 완료 후
> 우선순위: Medium
> 의존 대상: Loop 기능 보완과 열린 Backlog 정리
> 출처: Issue #132 타겟서비스 개발 운영구조와 배포필요성 검토
> 출처 문서:
> - [DSN-012 타겟서비스 개발운영구조와 배포판단](../../../../../05.설계/DSN-012_타겟서비스_개발운영구조와_배포판단.md)
> 관련 문서:
> - [BLG-028 타겟서비스 개발 운영구조와 배포필요성 검토](../16/BLG-028_타겟서비스_개발_운영구조와_배포필요성_검토.md)
> - [Backlog 미해결 인덱스](../../../README.md)
> 연결 Issue: [#132](https://github.com/jkoogit/jkadh/issues/132)
> 연결 PR: None
> 해결 문서: None

## 목차

- [1. 내용](#1-내용)
- [2. 발생 배경](#2-발생-배경)
- [3. 기대 효과](#3-기대-효과)
- [4. 처리 기준](#4-처리-기준)
- [5. 연결 이력](#5-연결-이력)

## 1. 내용

Loop 기능 보완과 처리 가능한 Backlog 정리를 완료한 뒤 타겟서비스에 적용할 Harness의 최소 범위와 첫 service pilot을 재검토한다.

재검토 범위는 PDFowers ProjectProfile, read/check/report preflight, WorkOrder와 서비스 Issue 연결, 첫 가치 업무 선정 및 service repo evidence 회수 기준이다.

## 2. 발생 배경

Issue #132 조사에서 PDFowers가 실제 타겟서비스 후보이며 별도 저장소·배포 lifecycle을 이미 운영하고 있음을 확인했다. 동시에 PDFowers에는 미커밋 이메일 인증 작업이 존재하고 JKADH의 Loop·Backlog 운영도 추가 정리가 필요해 즉시 service pilot을 시작하면 작업 소유권과 evidence가 충돌할 수 있다.

따라서 타겟서비스 작업은 보류하고, 플랫폼 내부 Loop 기능과 Backlog 상태를 먼저 정리한 뒤 적용 범위를 다시 판단한다.

## 3. 기대 효과

- 미정리된 플랫폼 운영 gap을 타겟서비스 작업에 전가하지 않는다.
- 기존 PDFowers 작업과 충돌하지 않는 시점과 첫 가치 업무를 선택한다.
- ProjectProfile과 WorkOrder 구현을 실제 service lifecycle에 필요한 최소 범위로 제한한다.

## 4. 처리 기준

- BLG-030 또는 동등한 Loop 기능 보완 작업의 검증 결과를 확인한다.
- 열린 Backlog가 evidence에 따라 해결, 보류, 채택 제외 또는 추가 확인으로 정리되어 있어야 한다.
- PDFowers 기존 이메일 인증 작업의 완료 상태와 열린 Issue/PR을 다시 확인한다.
- PDFowers 작업트리가 clean하거나 별도 clean worktree 사용이 승인되어야 한다.
- ProjectProfile preflight의 저장소 접근, AGENTS 탐색, branch·dirty 상태, Issue/PR read-only 조회 기준을 확정한다.
- 첫 service pilot의 범위, 제외범위, 완료조건과 검증방법을 PDFowers Issue와 JKADH WorkOrder에 분리해 기록한다.
- 배포, Secret, OAuth 수동 검증과 외부 시스템 쓰기는 사람 승인 대상으로 유지한다.

## 5. 연결 이력

| 날짜 | 상태 | 연결 대상 | 내용 |
|---|---|---|---|
| 2026-07-25 | Deferred | [Issue #132](https://github.com/jkoogit/jkadh/issues/132) | Loop 기능과 Backlog 정리를 우선하기 위해 타겟서비스 Harness 적용 재검토를 후속으로 분리 |

[목차로 이동](#목차)
