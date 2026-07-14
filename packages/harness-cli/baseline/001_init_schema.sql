create schema if not exists meta;
comment on schema meta is 'Harness CLI와 DB 마이그레이션 실행 이력을 관리하는 메타 스키마';

create table if not exists meta.schema_migration (
  version integer primary key,
  name text not null unique,
  checksum text not null,
  applied_at timestamptz not null default now()
);
comment on table meta.schema_migration is 'DB 스키마 변경 마이그레이션 적용 이력을 기록하는 테이블';
comment on column meta.schema_migration.version is '3자리 파일 순번에 대응하는 마이그레이션 버전 번호';
comment on column meta.schema_migration.name is '적용된 마이그레이션 SQL 파일명';
comment on column meta.schema_migration.checksum is '마이그레이션 SQL 내용의 SHA-256 체크섬';
comment on column meta.schema_migration.applied_at is '마이그레이션이 DB에 적용된 일시';

create schema if not exists dict;
comment on schema dict is '프로젝트 표준 도메인, 용어, 별칭, 권장어, 금지어를 관리하는 스키마';

create table if not exists dict.domain (
  domain_id bigserial primary key,
  domain_key text not null unique,
  ko_name text not null,
  en_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint domain_key_format check (domain_key ~ '^[a-z][a-z0-9_]*$')
);
comment on table dict.domain is '업무 도메인과 기술 도메인을 관리하는 테이블';
comment on column dict.domain.domain_id is '도메인 내부 식별자';
comment on column dict.domain.domain_key is '코드와 문서에서 사용하는 도메인 표준 키';
comment on column dict.domain.ko_name is '도메인의 한국어 표시명';
comment on column dict.domain.en_name is '도메인의 영어 표시명';
comment on column dict.domain.description is '도메인의 목적과 적용 범위 설명';
comment on column dict.domain.is_active is '도메인 사용 여부';
comment on column dict.domain.created_at is '도메인 행 생성 일시';
comment on column dict.domain.updated_at is '도메인 행 최종 수정 일시';

create table if not exists dict.term (
  term_id bigserial primary key,
  domain_id bigint not null,
  term_key text not null,
  description text,
  lifecycle_status text not null default 'active',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain_id, term_key),
  constraint term_key_format check (term_key ~ '^[a-z][a-z0-9_]*$'),
  constraint term_lifecycle_status check (lifecycle_status in ('active', 'deprecated', 'reserved'))
);
comment on table dict.term is '도메인별 표준 용어를 관리하는 테이블';
comment on column dict.term.term_id is '용어 내부 식별자';
comment on column dict.term.domain_id is '용어가 속한 도메인 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term.term_key is '코드와 문서에서 사용하는 용어 표준 키';
comment on column dict.term.description is '용어의 의미와 사용 기준 설명';
comment on column dict.term.lifecycle_status is '용어 생명주기 상태. active는 사용 중, deprecated는 폐기 예정, reserved는 예약 상태';
comment on column dict.term.is_active is '용어 사용 여부';
comment on column dict.term.created_at is '용어 행 생성 일시';
comment on column dict.term.updated_at is '용어 행 최종 수정 일시';

create table if not exists dict.term_label (
  term_label_id bigserial primary key,
  term_id bigint not null,
  language_code text not null,
  label text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (term_id, language_code, label),
  constraint term_label_language check (language_code in ('ko', 'en'))
);
comment on table dict.term_label is '용어의 언어별 표시명을 관리하는 테이블';
comment on column dict.term_label.term_label_id is '용어 표시명 내부 식별자';
comment on column dict.term_label.term_id is '표시명이 연결된 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_label.language_code is '표시명 언어 코드. ko 또는 en을 사용';
comment on column dict.term_label.label is '사용자에게 표시할 용어명';
comment on column dict.term_label.is_primary is '해당 언어의 대표 표시명 여부';
comment on column dict.term_label.created_at is '용어 표시명 행 생성 일시';

create table if not exists dict.term_alias (
  term_alias_id bigserial primary key,
  term_id bigint not null,
  alias text not null,
  alias_type text not null default 'alias',
  language_code text,
  note text,
  created_at timestamptz not null default now(),
  unique (term_id, alias),
  constraint term_alias_type check (alias_type in ('alias', 'tag', 'slug', 'legacy', 'abbreviation')),
  constraint term_alias_language check (language_code is null or language_code in ('ko', 'en'))
);
comment on table dict.term_alias is '용어의 태그, 약어, 옛 명칭, slug 같은 별칭을 관리하는 테이블';
comment on column dict.term_alias.term_alias_id is '용어 별칭 내부 식별자';
comment on column dict.term_alias.term_id is '별칭이 연결된 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_alias.alias is '문서, 코드, 명령에서 발견될 수 있는 용어 별칭';
comment on column dict.term_alias.alias_type is '별칭 유형. alias, tag, slug, legacy, abbreviation 중 하나';
comment on column dict.term_alias.language_code is '별칭 언어 코드. ko, en 또는 언어 구분 없음';
comment on column dict.term_alias.note is '별칭 사용 배경이나 보정 메모';
comment on column dict.term_alias.created_at is '용어 별칭 행 생성 일시';

create table if not exists dict.term_policy (
  term_policy_id bigserial primary key,
  term_id bigint not null,
  expression text not null,
  policy_type text not null,
  replacement text,
  reason text,
  created_at timestamptz not null default now(),
  unique (term_id, expression, policy_type),
  constraint term_policy_type check (policy_type in ('preferred', 'forbidden', 'deprecated'))
);
comment on table dict.term_policy is '용어 권장어, 금지어, 폐기 예정 표현 정책을 관리하는 테이블';
comment on column dict.term_policy.term_policy_id is '용어 정책 내부 식별자';
comment on column dict.term_policy.term_id is '정책이 연결된 표준 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_policy.expression is '검사 대상 표현';
comment on column dict.term_policy.policy_type is '용어 정책 유형. preferred는 권장어, forbidden은 금지어, deprecated는 폐기 예정 표현';
comment on column dict.term_policy.replacement is '정책 위반 또는 폐기 표현의 권장 대체 표현';
comment on column dict.term_policy.reason is '정책을 둔 이유와 적용 기준';
comment on column dict.term_policy.created_at is '용어 정책 행 생성 일시';

create table if not exists dict.term_relation (
  term_relation_id bigserial primary key,
  source_term_id bigint not null,
  target_term_id bigint not null,
  relation_type text not null,
  created_at timestamptz not null default now(),
  unique (source_term_id, target_term_id, relation_type),
  constraint term_relation_not_self check (source_term_id <> target_term_id),
  constraint term_relation_type check (relation_type in ('references', 'contains', 'replaces', 'related'))
);
comment on table dict.term_relation is '표준 용어 사이의 참조, 포함, 대체, 관련 관계를 관리하는 테이블';
comment on column dict.term_relation.term_relation_id is '용어 관계 내부 식별자';
comment on column dict.term_relation.source_term_id is '관계의 출발 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_relation.target_term_id is '관계의 대상 용어 식별자. FK 없이 논리 참조와 검증 쿼리로 관리한다';
comment on column dict.term_relation.relation_type is '용어 관계 유형. references, contains, replaces, related 중 하나';
comment on column dict.term_relation.created_at is '용어 관계 행 생성 일시';

create index if not exists term_domain_idx on dict.term(domain_id);
create index if not exists term_label_term_idx on dict.term_label(term_id);
create index if not exists term_alias_lookup_idx on dict.term_alias(alias);
create index if not exists term_policy_lookup_idx on dict.term_policy(expression, policy_type);
create index if not exists term_relation_source_idx on dict.term_relation(source_term_id);
create index if not exists term_relation_target_idx on dict.term_relation(target_term_id);

create schema if not exists hcp;
comment on schema hcp is 'Harness Control Plane 세션과 태스크 실행 상태를 관리하는 스키마';

create table if not exists hcp.harness_session (
  session_id text primary key,
  session_number text not null,
  session_name text not null,
  agent_id text not null,
  status text not null default 'active',
  linked_issue_number integer,
  linked_issue_title text,
  linked_issue_url text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_session_status check (status in ('active', 'complete', 'blocked', 'failed', 'archived')),
  constraint harness_session_number_format check (session_number ~ '^[0-9]{3}$')
);
comment on table hcp.harness_session is 'Codex Harness 세션의 식별자, 상태, 연결 Issue 정보를 관리하는 테이블';
comment on column hcp.harness_session.session_id is '세션을 고유하게 식별하는 Harness 세션 ID';
comment on column hcp.harness_session.session_number is '세션 순서를 나타내는 3자리 번호';
comment on column hcp.harness_session.session_name is '세션 목적과 범위를 설명하는 세션명';
comment on column hcp.harness_session.agent_id is '세션을 수행하는 에이전트 식별자';
comment on column hcp.harness_session.status is '세션 상태. active, complete, blocked, failed, archived 중 하나';
comment on column hcp.harness_session.linked_issue_number is '세션과 논리적으로 연결된 GitHub Issue 번호';
comment on column hcp.harness_session.linked_issue_title is '세션과 논리적으로 연결된 GitHub Issue 제목';
comment on column hcp.harness_session.linked_issue_url is '세션과 논리적으로 연결된 GitHub Issue URL';
comment on column hcp.harness_session.started_at is '세션 시작 일시';
comment on column hcp.harness_session.completed_at is '세션 완료 일시';
comment on column hcp.harness_session.archived_at is '세션 보관 일시';
comment on column hcp.harness_session.created_at is '세션 행 생성 일시';
comment on column hcp.harness_session.updated_at is '세션 행 최종 수정 일시';

create table if not exists hcp.harness_session_event (
  session_event_id bigserial primary key,
  session_id text not null,
  event_type text not null,
  event_source text not null default 'harness-cli',
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint harness_session_event_type_format check (event_type ~ '^[a-z][a-z0-9_.]*$')
);
comment on table hcp.harness_session_event is '세션 상태 변경, 후처리, 검증 등 세션 단위 이벤트를 기록하는 테이블';
comment on column hcp.harness_session_event.session_event_id is '세션 이벤트 내부 식별자';
comment on column hcp.harness_session_event.session_id is '이벤트가 속한 Harness 세션 ID. 물리 제약 없이 논리 연결로 관리한다';
comment on column hcp.harness_session_event.event_type is '세션 이벤트 유형. 예: session.start, session.close, task.promote';
comment on column hcp.harness_session_event.event_source is '이벤트를 기록한 시스템 또는 도구 이름';
comment on column hcp.harness_session_event.event_payload is '이벤트 상세 내용을 보관하는 JSON 데이터';
comment on column hcp.harness_session_event.occurred_at is '이벤트가 실제 발생한 일시';
comment on column hcp.harness_session_event.created_at is '세션 이벤트 행 생성 일시';

create index if not exists harness_session_status_idx on hcp.harness_session(status);
create index if not exists harness_session_issue_idx on hcp.harness_session(linked_issue_number);
create index if not exists harness_session_event_session_idx on hcp.harness_session_event(session_id);
create index if not exists harness_session_event_type_idx on hcp.harness_session_event(event_type);
