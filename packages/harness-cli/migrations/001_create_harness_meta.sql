create schema if not exists harness_meta;

create table if not exists harness_meta.schema_migration (
  version integer primary key,
  name text not null unique,
  checksum text not null,
  applied_at timestamptz not null default now()
);
