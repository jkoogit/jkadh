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
