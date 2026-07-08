# BLG-021 공식문서 Header 표 형식 전체 현행화

> Backlog ID: BLG-021
> 상태: Resolved
> 유형: DOC
> 생성일: 2026-07-07
> 처리시점: 다음 Issue 선정 시
> 우선순위: Medium
> 의존 대상: TPL-001 공식문서 템플릿 검증
> 출처: BLG-005 1차 검토
> 출처 문서:
> - [BLG-005 공식문서 템플릿 검토](../04/BLG-005_공식문서_템플릿_검토.md)
> 관련 문서:
> - [TPL-001 공식문서 템플릿](../../../../../08.템플릿/TPL-001_공식문서_템플릿.md)
> - [POL-001 문서관리방안](../../../../../03.정책/POL-001_문서관리방안.md)
> 연결 Issue: [#41](https://github.com/jkoogit/jkadh/issues/41)
> 연결 PR: None
> 해결 문서:
> - 공식 문서 본문형 파일 Header 표 형식 현행화

## 1. 내용

공식 문서 본문형 파일의 Header를 `TPL-001`의 Markdown 표 형식으로 순차 현행화한다.

## 2. 발생 배경

BLG-005에서 공식 문서 Header 기본 형식을 blockquote에서 Markdown 표로 전환하는 기준과 샘플을 마련했다.

나머지 공식 문서에 같은 기준을 적용하려면 의미 변경 없이 Header 형식만 바꾸는 별도 작업이 필요하다.

## 3. 기대 효과

- 공식 문서 Header 렌더링과 가독성을 통일한다.
- PR에서 서식 변경만 독립적으로 검토할 수 있다.
- Backlog 문서와 README 인덱스는 별도 구조로 유지해 범위 혼선을 줄인다.

## 4. 처리 기준

- 대상은 본문형 공식 문서로 제한한다.
- Backlog 문서와 폴더 `README.md`는 제외한다.
- 문서 본문 의미는 변경하지 않는다.
- 각 문서의 작업 이력에 Header 형식 현행화를 기록한다.

## 5. 연결 이력

| 날짜 | 상태 | 연결 대상 | 내용 |
|---|---|---|---|
| 2026-07-07 | Ready | [#28](https://github.com/jkoogit/jkadh/issues/28), [#27](https://github.com/jkoogit/jkadh/pull/27), [BLG-005](../04/BLG-005_공식문서_템플릿_검토.md) | 공식 문서 Header 표 형식 샘플 적용 후 전체 현행화 후속 작업으로 분리 |
| 2026-07-08 | Resolved | [#41](https://github.com/jkoogit/jkadh/issues/41) | README, Backlog, Backlog 전용 템플릿을 제외한 공식 문서 본문형 파일의 Header를 표 형식으로 현행화 |
