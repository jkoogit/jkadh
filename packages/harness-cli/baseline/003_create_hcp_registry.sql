create table if not exists hcp.harness_repository (
  repository_id bigserial primary key,
  repository_key text not null unique,
  provider text not null default 'github',
  repository_full_name text not null,
  canonical_url text not null,
  lifecycle_policy text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, repository_full_name),
  constraint harness_repository_key_format check (repository_key ~ '^[A-Z][A-Z0-9-]*$'),
  constraint harness_repository_provider check (provider in ('github')),
  constraint harness_repository_full_name_format check (repository_full_name ~ '^[^/[:space:]]+/[^/[:space:]]+$'),
  constraint harness_repository_full_name_lowercase check (repository_full_name = lower(repository_full_name)),
  constraint harness_repository_canonical_url check (canonical_url = 'https://github.com/' || repository_full_name),
  constraint harness_repository_status check (status in ('active', 'deprecated'))
);

create or replace function hcp.prevent_repository_key_change()
returns trigger
language plpgsql
as $$
begin
  if new.repository_key <> old.repository_key then
    raise exception 'repository_key is immutable: %', old.repository_key;
  end if;
  return new;
end;
$$;

drop trigger if exists harness_repository_key_immutable on hcp.harness_repository;
create trigger harness_repository_key_immutable
before update on hcp.harness_repository
for each row execute function hcp.prevent_repository_key_change();

create or replace function hcp.prevent_repository_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'repository registry rows are tombstones and cannot be deleted: %', old.repository_key;
end;
$$;

drop trigger if exists harness_repository_delete_blocked on hcp.harness_repository;
create trigger harness_repository_delete_blocked
before delete on hcp.harness_repository
for each row execute function hcp.prevent_repository_delete();

alter table hcp.harness_issue
  add column if not exists repository_id bigint;
alter table hcp.harness_issue
  drop constraint if exists harness_issue_provider_issue_number_key;
create unique index if not exists harness_issue_repository_provider_number_uidx
  on hcp.harness_issue(repository_id, provider, issue_number);

alter table hcp.harness_task
  add column if not exists repository_id bigint,
  add column if not exists work_group_id text,
  add column if not exists execution_issue_id text,
  add column if not exists issue_sequence integer,
  add column if not exists allocation_key text,
  add column if not exists issue_policy text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'harness_task_issue_policy'
      and conrelid = 'hcp.harness_task'::regclass
  ) then
    alter table hcp.harness_task
      add constraint harness_task_issue_policy
      check (issue_policy is null or issue_policy in ('dedicated', 'shared_umbrella'));
  end if;
end;
$$;

create table if not exists hcp.harness_work_group (
  work_group_id text primary key,
  repository_id bigint not null,
  registration_issue_id text not null,
  issue_sequence integer not null,
  allocation_key text not null unique,
  title text not null,
  issue_policy text not null default 'dedicated',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repository_id, registration_issue_id, issue_sequence),
  constraint harness_work_group_id_format check (work_group_id ~ '^WG-[A-Z][A-Z0-9-]*-[0-9]+-[0-9]{3,}$'),
  constraint harness_work_group_issue_sequence check (issue_sequence > 0),
  constraint harness_work_group_issue_policy check (issue_policy in ('dedicated', 'shared_registration')),
  constraint harness_work_group_status check (status in ('planned', 'active', 'completed', 'blocked', 'failed', 'canceled', 'superseded'))
);

create table if not exists hcp.harness_issue_role (
  issue_role_id bigserial primary key,
  issue_id text not null,
  owner_type text not null,
  owner_id text not null,
  issue_role text not null,
  created_at timestamptz not null default now(),
  unique (issue_id, owner_type, owner_id, issue_role),
  constraint harness_issue_role_owner_type check (owner_type in ('work_group', 'task')),
  constraint harness_issue_role_value check (issue_role in ('registration', 'execution', 'related', 'handoff')),
  constraint harness_issue_role_owner_role check (
    issue_role in ('related', 'handoff')
    or (issue_role = 'registration' and owner_type = 'work_group')
    or (issue_role = 'execution' and owner_type = 'task')
  )
);

create table if not exists hcp.harness_work_group_counter (
  repository_id bigint not null,
  registration_issue_number integer not null,
  issue_policy text not null,
  last_sequence integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (repository_id, registration_issue_number),
  constraint harness_work_group_counter_issue_number check (registration_issue_number > 0),
  constraint harness_work_group_counter_issue_policy check (issue_policy in ('dedicated', 'shared_registration')),
  constraint harness_work_group_counter_sequence check (last_sequence >= 0)
);

create table if not exists hcp.harness_task_counter (
  repository_id bigint not null,
  execution_issue_number integer not null,
  issue_policy text not null,
  last_sequence integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (repository_id, execution_issue_number),
  constraint harness_task_counter_issue_number check (execution_issue_number > 0),
  constraint harness_task_counter_issue_policy check (issue_policy in ('dedicated', 'shared_umbrella')),
  constraint harness_task_counter_sequence check (last_sequence >= 0)
);

create table if not exists hcp.harness_id_allocation (
  allocation_id bigserial primary key,
  allocation_key text not null unique,
  request_fingerprint text not null,
  entity_type text not null,
  repository_id bigint not null,
  issue_id text not null,
  issue_number integer not null,
  issue_sequence integer not null,
  entity_id text not null,
  status text not null default 'reserved',
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (entity_type, entity_id),
  unique (repository_id, entity_type, issue_number, issue_sequence),
  constraint harness_id_allocation_fingerprint_format check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint harness_id_allocation_entity_type check (entity_type in ('work_group', 'task')),
  constraint harness_id_allocation_issue_number check (issue_number > 0),
  constraint harness_id_allocation_issue_sequence check (issue_sequence > 0),
  constraint harness_id_allocation_status check (status in ('reserved', 'allocated', 'tombstoned'))
);

create unique index if not exists harness_task_allocation_key_uidx
  on hcp.harness_task(allocation_key)
  where allocation_key is not null;
create unique index if not exists harness_task_repository_issue_sequence_uidx
  on hcp.harness_task(repository_id, execution_issue_id, issue_sequence)
  where repository_id is not null and execution_issue_id is not null and issue_sequence is not null;
create unique index if not exists harness_task_dedicated_issue_uidx
  on hcp.harness_task(repository_id, execution_issue_id)
  where issue_policy = 'dedicated';
create index if not exists harness_repository_status_idx on hcp.harness_repository(status);
create index if not exists harness_work_group_repository_idx on hcp.harness_work_group(repository_id);
create index if not exists harness_work_group_registration_issue_idx on hcp.harness_work_group(registration_issue_id);
create index if not exists harness_work_group_status_idx on hcp.harness_work_group(status);
create unique index if not exists harness_work_group_dedicated_issue_uidx
  on hcp.harness_work_group(repository_id, registration_issue_id)
  where issue_policy = 'dedicated';

create or replace function hcp.prevent_work_group_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.work_group_id <> old.work_group_id
     or new.repository_id <> old.repository_id
     or new.registration_issue_id <> old.registration_issue_id
     or new.issue_sequence <> old.issue_sequence
     or new.allocation_key <> old.allocation_key
     or new.issue_policy <> old.issue_policy then
    raise exception 'registry WG identity is immutable: %', old.work_group_id;
  end if;
  return new;
end;
$$;

create or replace function hcp.prevent_work_group_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'registry allocations are tombstones and cannot be deleted: %', old.work_group_id;
end;
$$;

drop trigger if exists harness_work_group_identity_immutable on hcp.harness_work_group;
create trigger harness_work_group_identity_immutable
before update on hcp.harness_work_group
for each row execute function hcp.prevent_work_group_identity_change();

drop trigger if exists harness_work_group_delete_blocked on hcp.harness_work_group;
create trigger harness_work_group_delete_blocked
before delete on hcp.harness_work_group
for each row execute function hcp.prevent_work_group_delete();

create or replace function hcp.prevent_registry_task_identity_change()
returns trigger
language plpgsql
as $$
begin
  if old.repository_id is not null and (
       new.task_id is distinct from old.task_id
       or new.repository_id is distinct from old.repository_id
       or new.work_group_id is distinct from old.work_group_id
       or new.execution_issue_id is distinct from old.execution_issue_id
       or new.issue_sequence is distinct from old.issue_sequence
       or new.allocation_key is distinct from old.allocation_key
       or new.issue_policy is distinct from old.issue_policy
     ) then
    raise exception 'registry Task identity is immutable: %', old.task_id;
  end if;
  return new;
end;
$$;

create or replace function hcp.prevent_registry_task_delete()
returns trigger
language plpgsql
as $$
begin
  if old.repository_id is not null then
    raise exception 'registry Task allocations are tombstones and cannot be deleted: %', old.task_id;
  end if;
  return old;
end;
$$;

drop trigger if exists harness_task_registry_identity_immutable on hcp.harness_task;
create trigger harness_task_registry_identity_immutable
before update on hcp.harness_task
for each row execute function hcp.prevent_registry_task_identity_change();

drop trigger if exists harness_task_registry_delete_blocked on hcp.harness_task;
create trigger harness_task_registry_delete_blocked
before delete on hcp.harness_task
for each row execute function hcp.prevent_registry_task_delete();

create or replace function hcp.prevent_id_allocation_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.allocation_key is distinct from old.allocation_key
     or new.request_fingerprint is distinct from old.request_fingerprint
     or new.entity_type is distinct from old.entity_type
     or new.repository_id is distinct from old.repository_id
     or new.issue_id is distinct from old.issue_id
     or new.issue_number is distinct from old.issue_number
     or new.issue_sequence is distinct from old.issue_sequence
     or new.entity_id is distinct from old.entity_id then
    raise exception 'ID allocation identity is immutable: %', old.allocation_key;
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'reserved' and new.status in ('allocated', 'tombstoned')) then
    raise exception 'invalid ID allocation status transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

create or replace function hcp.prevent_id_allocation_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ID allocation tombstones cannot be deleted: %', old.allocation_key;
end;
$$;

drop trigger if exists harness_id_allocation_identity_immutable on hcp.harness_id_allocation;
create trigger harness_id_allocation_identity_immutable
before update on hcp.harness_id_allocation
for each row execute function hcp.prevent_id_allocation_identity_change();

drop trigger if exists harness_id_allocation_delete_blocked on hcp.harness_id_allocation;
create trigger harness_id_allocation_delete_blocked
before delete on hcp.harness_id_allocation
for each row execute function hcp.prevent_id_allocation_delete();
create index if not exists harness_issue_role_issue_idx on hcp.harness_issue_role(issue_id);
create index if not exists harness_issue_role_owner_idx on hcp.harness_issue_role(owner_type, owner_id);
create unique index if not exists harness_issue_role_registration_owner_uidx
  on hcp.harness_issue_role(owner_type, owner_id)
  where owner_type = 'work_group' and issue_role = 'registration';
create unique index if not exists harness_issue_role_execution_owner_uidx
  on hcp.harness_issue_role(owner_type, owner_id)
  where owner_type = 'task' and issue_role = 'execution';
create index if not exists harness_task_work_group_idx on hcp.harness_task(work_group_id);

comment on table hcp.harness_repository is 'Coordination과 execution 저장소의 불변 key, 원격 좌표와 lifecycle 정책을 관리하는 registry';
comment on column hcp.harness_repository.repository_id is 'Repository registry 내부 식별자';
comment on column hcp.harness_repository.repository_key is 'WG와 Task 영구 ID에 사용하는 생성 후 변경 불가 저장소 key';
comment on column hcp.harness_repository.provider is '원격 저장소 제공자';
comment on column hcp.harness_repository.repository_full_name is 'provider 내부 저장소 복합 원격 좌표 owner/repository';
comment on column hcp.harness_repository.canonical_url is '복합 원격 좌표와 일치해야 하는 저장소 정규 URL';
comment on column hcp.harness_repository.lifecycle_policy is '저장소 branch 승급과 lifecycle 운영 정책';
comment on column hcp.harness_repository.status is 'Repository registry 활성 또는 폐기 상태';
comment on column hcp.harness_repository.created_at is 'Repository registry 생성 일시';
comment on column hcp.harness_repository.updated_at is 'Repository registry 최종 변경 일시';

comment on column hcp.harness_issue.repository_id is 'Issue가 속한 Repository registry 내부 식별자';

comment on table hcp.harness_work_group is '등록 Issue가 선행 생성된 뒤 issue-local counter로 확정한 지속 작업목표';
comment on column hcp.harness_work_group.work_group_id is '저장소 key, 등록 Issue 번호와 issue-local 순번으로 구성한 영구 WG ID';
comment on column hcp.harness_work_group.repository_id is 'WG 등록 Issue가 속한 coordination Repository 내부 식별자';
comment on column hcp.harness_work_group.registration_issue_id is 'WG 등록과 조정 범위를 소유하는 Issue snapshot ID';
comment on column hcp.harness_work_group.issue_sequence is '등록 Issue 범위에서 재사용하지 않는 WG 순번';
comment on column hcp.harness_work_group.allocation_key is '같은 할당 요청의 counter 중복 증가를 막는 idempotency key';
comment on column hcp.harness_work_group.title is 'WG 목표를 나타내는 제목';
comment on column hcp.harness_work_group.issue_policy is '등록 Issue의 dedicated 또는 승인된 shared_registration 정책';
comment on column hcp.harness_work_group.status is 'WG lifecycle 상태';
comment on column hcp.harness_work_group.created_at is 'WG 생성 일시';
comment on column hcp.harness_work_group.updated_at is 'WG 최종 변경 일시';

comment on table hcp.harness_issue_role is 'Issue의 registration, execution, related, handoff 역할 연결';
comment on column hcp.harness_issue_role.issue_role_id is 'Issue 역할 연결 내부 식별자';
comment on column hcp.harness_issue_role.issue_id is '역할을 부여한 Issue snapshot ID';
comment on column hcp.harness_issue_role.owner_type is 'Issue 역할을 소유하는 work_group 또는 task 유형';
comment on column hcp.harness_issue_role.owner_id is 'Issue 역할을 소유하는 WG 또는 Task 영구 ID';
comment on column hcp.harness_issue_role.issue_role is 'Issue에 부여한 registration, execution, related 또는 handoff 역할';
comment on column hcp.harness_issue_role.created_at is 'Issue 역할 연결 생성 일시';

comment on table hcp.harness_work_group_counter is '저장소와 등록 Issue 범위에서 WG 순번을 원자 할당하는 권한 counter';
comment on column hcp.harness_work_group_counter.repository_id is 'WG 순번을 할당하는 coordination Repository 내부 식별자';
comment on column hcp.harness_work_group_counter.registration_issue_number is 'WG 순번 범위를 소유하는 등록 Issue 번호';
comment on column hcp.harness_work_group_counter.issue_policy is '첫 할당 시 결합되며 동시 dedicated/shared 정책 혼합을 차단하는 Issue 정책';
comment on column hcp.harness_work_group_counter.last_sequence is '예약과 tombstone을 포함해 마지막으로 소비한 WG 순번';
comment on column hcp.harness_work_group_counter.updated_at is 'WG counter 최종 증가 일시';

comment on table hcp.harness_task_counter is '저장소와 실행 Issue 범위에서 Task 순번을 원자 할당하는 권한 counter';
comment on column hcp.harness_task_counter.repository_id is 'Task 순번을 할당하는 execution Repository 내부 식별자';
comment on column hcp.harness_task_counter.execution_issue_number is 'Task 순번 범위를 소유하는 실행 Issue 번호';
comment on column hcp.harness_task_counter.issue_policy is '첫 할당 시 결합되며 동시 dedicated/shared 정책 혼합을 차단하는 Issue 정책';
comment on column hcp.harness_task_counter.last_sequence is '예약과 tombstone을 포함해 마지막으로 소비한 Task 순번';
comment on column hcp.harness_task_counter.updated_at is 'Task counter 최종 증가 일시';

comment on table hcp.harness_id_allocation is 'WG와 Task ID reservation, 요청 fingerprint와 실패 tombstone을 보존하는 비재사용 원장';
comment on column hcp.harness_id_allocation.allocation_id is 'ID allocation 원장 내부 식별자';
comment on column hcp.harness_id_allocation.allocation_key is '동일 할당 요청을 식별하는 idempotency key';
comment on column hcp.harness_id_allocation.request_fingerprint is '할당 요청의 불변 입력을 정규화한 SHA-256 fingerprint';
comment on column hcp.harness_id_allocation.entity_type is '할당 대상 work_group 또는 task 유형';
comment on column hcp.harness_id_allocation.repository_id is '영구 ID에 포함되는 Repository registry 내부 식별자';
comment on column hcp.harness_id_allocation.issue_id is '할당 범위를 소유하는 등록 또는 실행 Issue snapshot ID';
comment on column hcp.harness_id_allocation.issue_number is 'issue-local 순번 범위를 소유하는 원격 Issue 번호';
comment on column hcp.harness_id_allocation.issue_sequence is '실패와 취소 후에도 재사용하지 않는 issue-local 순번';
comment on column hcp.harness_id_allocation.entity_id is '예약된 WG 또는 Task 영구 ID';
comment on column hcp.harness_id_allocation.status is 'reserved, allocated 또는 tombstoned 할당 상태';
comment on column hcp.harness_id_allocation.failure_reason is 'tombstone 전환을 발생시킨 생성 실패 요약';
comment on column hcp.harness_id_allocation.created_at is 'ID reservation 생성 일시';
comment on column hcp.harness_id_allocation.updated_at is 'ID allocation 상태 최종 변경 일시';
comment on column hcp.harness_id_allocation.finalized_at is 'allocated 또는 tombstoned로 확정된 일시';

comment on column hcp.harness_task.repository_id is 'Task 변경이 실행되는 Repository registry 내부 ID';
comment on column hcp.harness_task.work_group_id is 'Task가 속한 영구 WG ID';
comment on column hcp.harness_task.execution_issue_id is 'Task 실행 범위를 소유하는 Issue snapshot ID';
comment on column hcp.harness_task.issue_sequence is '실행 Issue 범위에서 재사용하지 않는 Task 순번';
comment on column hcp.harness_task.allocation_key is '같은 Task 할당 요청의 counter 중복 증가를 막는 idempotency key';
comment on column hcp.harness_task.issue_policy is '실행 Issue의 dedicated 또는 승인된 shared_umbrella 정책';
