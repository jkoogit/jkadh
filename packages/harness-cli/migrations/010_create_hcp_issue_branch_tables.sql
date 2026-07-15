create table if not exists hcp.harness_issue (
  issue_id text primary key,
  session_id text,
  task_id text,
  provider text not null default 'github',
  issue_number integer not null,
  title text,
  url text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, issue_number),
  constraint harness_issue_provider check (provider in ('github')),
  constraint harness_issue_status check (status in ('open', 'closed'))
);
comment on table hcp.harness_issue is 'Harness 세션과 태스크에 연결된 GitHub Issue snapshot 정보를 관리하는 테이블';
comment on column hcp.harness_issue.issue_id is 'Issue snapshot 행을 고유하게 식별하는 Harness Issue ID';
comment on column hcp.harness_issue.session_id is 'Issue가 연결된 Harness 세션 ID. 물리 제약 없이 논리 연결로 관리한다';
comment on column hcp.harness_issue.task_id is 'Issue가 연결된 Harness 태스크 ID. 물리 제약 없이 논리 연결로 관리한다';
comment on column hcp.harness_issue.provider is 'Issue 제공자. 현재는 github만 사용한다';
comment on column hcp.harness_issue.issue_number is 'GitHub Issue 번호';
comment on column hcp.harness_issue.title is 'GitHub Issue 제목 snapshot';
comment on column hcp.harness_issue.url is 'GitHub Issue URL';
comment on column hcp.harness_issue.status is 'Issue 상태. open, closed 중 하나';
comment on column hcp.harness_issue.created_at is 'Issue snapshot 행 생성 일시';
comment on column hcp.harness_issue.updated_at is 'Issue snapshot 행 최종 수정 일시';

create table if not exists hcp.harness_branch (
  branch_id text primary key,
  session_id text,
  task_id text,
  branch_name text not null,
  branch_role text not null default 'work',
  base_branch text,
  target_branch text,
  target_commit_sha text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_branch_role check (branch_role in ('work', 'base', 'promote_target')),
  constraint harness_branch_status check (status in ('active', 'merged', 'promoted', 'deleted'))
);
comment on table hcp.harness_branch is 'Harness 작업 브랜치와 기준 브랜치, 승급 대상 브랜치 추적 정보를 관리하는 테이블';
comment on column hcp.harness_branch.branch_id is '브랜치 추적 행을 고유하게 식별하는 Harness Branch ID';
comment on column hcp.harness_branch.session_id is '브랜치가 연결된 Harness 세션 ID. 물리 제약 없이 논리 연결로 관리한다';
comment on column hcp.harness_branch.task_id is '브랜치가 연결된 Harness 태스크 ID. 물리 제약 없이 논리 연결로 관리한다';
comment on column hcp.harness_branch.branch_name is '추적 대상 브랜치명';
comment on column hcp.harness_branch.branch_role is '브랜치 역할. work, base, promote_target 중 하나';
comment on column hcp.harness_branch.base_branch is '작업 브랜치가 시작된 기준 브랜치명';
comment on column hcp.harness_branch.target_branch is '승급 대상 브랜치명';
comment on column hcp.harness_branch.target_commit_sha is '브랜치 승급 또는 병합 기준 commit SHA';
comment on column hcp.harness_branch.status is '브랜치 상태. active, merged, promoted, deleted 중 하나';
comment on column hcp.harness_branch.created_at is '브랜치 추적 행 생성 일시';
comment on column hcp.harness_branch.updated_at is '브랜치 추적 행 최종 수정 일시';

create index if not exists harness_issue_session_idx on hcp.harness_issue(session_id);
create index if not exists harness_issue_task_idx on hcp.harness_issue(task_id);
create index if not exists harness_issue_number_idx on hcp.harness_issue(issue_number);
create index if not exists harness_issue_status_idx on hcp.harness_issue(status);
create index if not exists harness_branch_session_idx on hcp.harness_branch(session_id);
create index if not exists harness_branch_task_idx on hcp.harness_branch(task_id);
create index if not exists harness_branch_name_idx on hcp.harness_branch(branch_name);
create index if not exists harness_branch_status_idx on hcp.harness_branch(status);
