create table if not exists hcp.harness_task (
  task_id text primary key,
  session_id text not null,
  task_name text not null,
  status text not null default 'active',
  issue_number integer,
  branch_name text,
  pull_request_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_task_status check (status in ('active', 'closed', 'promoted', 'blocked', 'failed', 'deleted'))
);
comment on table hcp.harness_task is 'Harness 태스크의 생명주기 상태, 연결 Issue, 작업 브랜치 정보를 관리하는 테이블';
comment on column hcp.harness_task.task_id is '태스크를 고유하게 식별하는 Harness 태스크 ID';
comment on column hcp.harness_task.session_id is '태스크가 속한 Harness 세션 ID. 물리 제약 없이 논리 연결로 관리한다';
comment on column hcp.harness_task.task_name is '태스크 목적과 범위를 설명하는 태스크명';
comment on column hcp.harness_task.status is '태스크 상태. active, closed, promoted, blocked, failed, deleted 중 하나';
comment on column hcp.harness_task.issue_number is '태스크와 논리적으로 연결된 GitHub Issue 번호';
comment on column hcp.harness_task.branch_name is '태스크 구현에 사용하는 작업 브랜치명';
comment on column hcp.harness_task.pull_request_number is '태스크와 논리적으로 연결된 GitHub PR 번호';
comment on column hcp.harness_task.created_at is '태스크 행 생성 일시';
comment on column hcp.harness_task.updated_at is '태스크 행 최종 수정 일시';

create table if not exists hcp.harness_task_event (
  task_event_id bigserial primary key,
  task_id text not null,
  session_id text not null,
  event_type text not null,
  event_source text not null default 'harness-cli',
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint harness_task_event_type_format check (event_type ~ '^[a-z][a-z0-9_.]*$')
);
comment on table hcp.harness_task_event is '태스크 상태 변경, 후처리, 검증 등 태스크 단위 이벤트를 기록하는 테이블';
comment on column hcp.harness_task_event.task_event_id is '태스크 이벤트 내부 식별자';
comment on column hcp.harness_task_event.task_id is '이벤트가 속한 Harness 태스크 ID. 물리 제약 없이 논리 연결로 관리한다';
comment on column hcp.harness_task_event.session_id is '이벤트가 속한 Harness 세션 ID. 태스크 조회를 위한 논리 연결로 관리한다';
comment on column hcp.harness_task_event.event_type is '태스크 이벤트 유형. 예: task.start, task.close, task.promote';
comment on column hcp.harness_task_event.event_source is '이벤트를 기록한 시스템 또는 도구 이름';
comment on column hcp.harness_task_event.event_payload is '이벤트 상세 내용을 보관하는 JSON 데이터';
comment on column hcp.harness_task_event.occurred_at is '이벤트가 실제 발생한 일시';
comment on column hcp.harness_task_event.created_at is '태스크 이벤트 행 생성 일시';

create index if not exists harness_task_session_idx on hcp.harness_task(session_id);
create index if not exists harness_task_status_idx on hcp.harness_task(status);
create index if not exists harness_task_issue_idx on hcp.harness_task(issue_number);
create index if not exists harness_task_branch_idx on hcp.harness_task(branch_name);
create index if not exists harness_task_event_task_idx on hcp.harness_task_event(task_id);
create index if not exists harness_task_event_session_idx on hcp.harness_task_event(session_id);
create index if not exists harness_task_event_type_idx on hcp.harness_task_event(event_type);
