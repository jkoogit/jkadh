comment on schema harness_meta is 'Harness CLI와 DB 마이그레이션 실행 이력을 관리하는 메타 스키마';
comment on table harness_meta.schema_migration is 'DB 스키마 변경 마이그레이션 적용 이력을 기록하는 테이블';
comment on column harness_meta.schema_migration.version is '3자리 파일 순번에 대응하는 마이그레이션 버전 번호';
comment on column harness_meta.schema_migration.name is '적용된 마이그레이션 SQL 파일명';
comment on column harness_meta.schema_migration.checksum is '마이그레이션 SQL 내용의 SHA-256 체크섬';
comment on column harness_meta.schema_migration.applied_at is '마이그레이션이 DB에 적용된 일시';

comment on schema dictionary is '프로젝트 표준 도메인, 용어, 별칭, 권장어, 금지어를 관리하는 스키마';

comment on table dictionary.domain is '업무 도메인과 기술 도메인을 관리하는 테이블';
comment on column dictionary.domain.domain_id is '도메인 내부 식별자';
comment on column dictionary.domain.domain_key is '코드와 문서에서 사용하는 도메인 표준 키';
comment on column dictionary.domain.ko_name is '도메인의 한국어 표시명';
comment on column dictionary.domain.en_name is '도메인의 영어 표시명';
comment on column dictionary.domain.description is '도메인의 목적과 적용 범위 설명';
comment on column dictionary.domain.is_active is '도메인 사용 여부';
comment on column dictionary.domain.created_at is '도메인 행 생성 일시';
comment on column dictionary.domain.updated_at is '도메인 행 최종 수정 일시';

comment on table dictionary.term is '도메인별 표준 용어를 관리하는 테이블';
comment on column dictionary.term.term_id is '용어 내부 식별자';
comment on column dictionary.term.domain_id is '용어가 속한 도메인 식별자';
comment on column dictionary.term.term_key is '코드와 문서에서 사용하는 용어 표준 키';
comment on column dictionary.term.description is '용어의 의미와 사용 기준 설명';
comment on column dictionary.term.lifecycle_status is '용어 생명주기 상태. active는 사용 중, deprecated는 폐기 예정, reserved는 예약 상태';
comment on column dictionary.term.is_active is '용어 사용 여부';
comment on column dictionary.term.created_at is '용어 행 생성 일시';
comment on column dictionary.term.updated_at is '용어 행 최종 수정 일시';

comment on table dictionary.term_label is '용어의 언어별 표시명을 관리하는 테이블';
comment on column dictionary.term_label.term_label_id is '용어 표시명 내부 식별자';
comment on column dictionary.term_label.term_id is '표시명이 연결된 용어 식별자';
comment on column dictionary.term_label.language_code is '표시명 언어 코드. ko 또는 en을 사용';
comment on column dictionary.term_label.label is '사용자에게 표시할 용어명';
comment on column dictionary.term_label.is_primary is '해당 언어의 대표 표시명 여부';
comment on column dictionary.term_label.created_at is '용어 표시명 행 생성 일시';

comment on table dictionary.term_alias is '용어의 태그, 약어, 옛 명칭, slug 같은 별칭을 관리하는 테이블';
comment on column dictionary.term_alias.term_alias_id is '용어 별칭 내부 식별자';
comment on column dictionary.term_alias.term_id is '별칭이 연결된 용어 식별자';
comment on column dictionary.term_alias.alias is '문서, 코드, 명령에서 발견될 수 있는 용어 별칭';
comment on column dictionary.term_alias.alias_type is '별칭 유형. alias, tag, slug, legacy, abbreviation 중 하나';
comment on column dictionary.term_alias.language_code is '별칭 언어 코드. ko, en 또는 언어 구분 없음';
comment on column dictionary.term_alias.note is '별칭 사용 배경이나 보정 메모';
comment on column dictionary.term_alias.created_at is '용어 별칭 행 생성 일시';

comment on table dictionary.term_policy is '용어 권장어, 금지어, 폐기 예정 표현 정책을 관리하는 테이블';
comment on column dictionary.term_policy.term_policy_id is '용어 정책 내부 식별자';
comment on column dictionary.term_policy.term_id is '정책이 연결된 표준 용어 식별자';
comment on column dictionary.term_policy.expression is '검사 대상 표현';
comment on column dictionary.term_policy.policy_type is '용어 정책 유형. preferred는 권장어, forbidden은 금지어, deprecated는 폐기 예정 표현';
comment on column dictionary.term_policy.replacement is '정책 위반 또는 폐기 표현의 권장 대체 표현';
comment on column dictionary.term_policy.reason is '정책을 둔 이유와 적용 기준';
comment on column dictionary.term_policy.created_at is '용어 정책 행 생성 일시';

comment on table dictionary.term_relation is '표준 용어 사이의 참조, 포함, 대체, 관련 관계를 관리하는 테이블';
comment on column dictionary.term_relation.term_relation_id is '용어 관계 내부 식별자';
comment on column dictionary.term_relation.source_term_id is '관계의 출발 용어 식별자';
comment on column dictionary.term_relation.target_term_id is '관계의 대상 용어 식별자';
comment on column dictionary.term_relation.relation_type is '용어 관계 유형. references, contains, replaces, related 중 하나';
comment on column dictionary.term_relation.created_at is '용어 관계 행 생성 일시';
