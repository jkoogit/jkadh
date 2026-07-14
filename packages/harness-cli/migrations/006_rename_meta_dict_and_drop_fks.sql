do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'harness_meta')
    and not exists (select 1 from information_schema.schemata where schema_name = 'meta') then
    alter schema harness_meta rename to meta;
  end if;

  if exists (select 1 from information_schema.schemata where schema_name = 'dictionary')
    and not exists (select 1 from information_schema.schemata where schema_name = 'dict') then
    alter schema dictionary rename to dict;
  end if;
end
$$;

alter table if exists dict.term drop constraint if exists term_domain_id_fkey;
alter table if exists dict.term_label drop constraint if exists term_label_term_id_fkey;
alter table if exists dict.term_alias drop constraint if exists term_alias_term_id_fkey;
alter table if exists dict.term_policy drop constraint if exists term_policy_term_id_fkey;
alter table if exists dict.term_relation drop constraint if exists term_relation_source_term_id_fkey;
alter table if exists dict.term_relation drop constraint if exists term_relation_target_term_id_fkey;

comment on schema meta is 'Harness CLI와 DB 마이그레이션 실행 이력을 관리하는 메타 스키마';
comment on schema dict is '프로젝트 표준 도메인, 용어, 별칭, 권장어, 금지어를 관리하는 스키마';

comment on column dict.term.domain_id is '용어가 속한 도메인 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_label.term_id is '표시명이 연결된 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_alias.term_id is '별칭이 연결된 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_policy.term_id is '정책이 연결된 표준 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_relation.source_term_id is '관계의 출발 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_relation.target_term_id is '관계의 대상 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
