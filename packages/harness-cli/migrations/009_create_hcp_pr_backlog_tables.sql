create table if not exists hcp.harness_pull_request (
  pull_request_id text primary key,
  task_id text not null,
  provider text not null default 'github',
  pull_request_number integer not null,
  url text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, pull_request_number),
  constraint harness_pull_request_provider check (provider in ('github')),
  constraint harness_pull_request_status check (status in ('draft', 'open', 'merged', 'closed'))
);
comment on table hcp.harness_pull_request is 'Harness 태스크와 연결된 GitHub PR 추적 정보를 관리하는 테이블';
comment on column hcp.harness_pull_request.pull_request_id is 'PR 추적 행을 고유하게 식별하는 Harness PR ID';
comment on column hcp.harness_pull_request.task_id is 'PR이 속한 Harness 태스크 ID. 물리 제약 없이 논리 연결로 관리한다';
comment on column hcp.harness_pull_request.provider is 'PR 제공자. 현재는 github만 사용한다';
comment on column hcp.harness_pull_request.pull_request_number is 'GitHub PR 번호';
comment on column hcp.harness_pull_request.url is 'GitHub PR URL';
comment on column hcp.harness_pull_request.status is 'PR 상태. draft, open, merged, closed 중 하나';
comment on column hcp.harness_pull_request.created_at is 'PR 추적 행 생성 일시';
comment on column hcp.harness_pull_request.updated_at is 'PR 추적 행 최종 수정 일시';

create table if not exists hcp.harness_backlog_item (
  backlog_item_id text primary key,
  session_id text not null,
  backlog_id text,
  title text not null,
  status text not null default 'open',
  path text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_backlog_item_status check (status in ('open', 'closed', 'deferred'))
);
comment on table hcp.harness_backlog_item is 'Harness 세션 중 등록된 runtime Backlog 항목의 상태와 연결 정보를 관리하는 테이블';
comment on column hcp.harness_backlog_item.backlog_item_id is 'Backlog 항목을 고유하게 식별하는 Harness Backlog ID';
comment on column hcp.harness_backlog_item.session_id is 'Backlog 항목이 속한 Harness 세션 ID. 물리 제약 없이 논리 연결로 관리한다';
comment on column hcp.harness_backlog_item.backlog_id is '문서화된 Backlog ID. 예: BLG-022';
comment on column hcp.harness_backlog_item.title is 'Backlog 항목 제목';
comment on column hcp.harness_backlog_item.status is 'Backlog 상태. open, closed, deferred 중 하나';
comment on column hcp.harness_backlog_item.path is 'Backlog 문서 경로';
comment on column hcp.harness_backlog_item.note is 'Backlog 처리 메모';
comment on column hcp.harness_backlog_item.created_at is 'Backlog 항목 행 생성 일시';
comment on column hcp.harness_backlog_item.updated_at is 'Backlog 항목 행 최종 수정 일시';

create index if not exists harness_pull_request_task_idx on hcp.harness_pull_request(task_id);
create index if not exists harness_pull_request_status_idx on hcp.harness_pull_request(status);
create index if not exists harness_backlog_item_session_idx on hcp.harness_backlog_item(session_id);
create index if not exists harness_backlog_item_backlog_idx on hcp.harness_backlog_item(backlog_id);
create index if not exists harness_backlog_item_status_idx on hcp.harness_backlog_item(status);
