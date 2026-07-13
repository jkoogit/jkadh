create schema if not exists dictionary;

create table if not exists dictionary.domain (
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

create table if not exists dictionary.term (
  term_id bigserial primary key,
  domain_id bigint not null references dictionary.domain(domain_id),
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

create table if not exists dictionary.term_label (
  term_label_id bigserial primary key,
  term_id bigint not null references dictionary.term(term_id) on delete cascade,
  language_code text not null,
  label text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (term_id, language_code, label),
  constraint term_label_language check (language_code in ('ko', 'en'))
);

create table if not exists dictionary.term_alias (
  term_alias_id bigserial primary key,
  term_id bigint not null references dictionary.term(term_id) on delete cascade,
  alias text not null,
  alias_type text not null default 'alias',
  language_code text,
  note text,
  created_at timestamptz not null default now(),
  unique (term_id, alias),
  constraint term_alias_type check (alias_type in ('alias', 'tag', 'slug', 'legacy', 'abbreviation')),
  constraint term_alias_language check (language_code is null or language_code in ('ko', 'en'))
);

create table if not exists dictionary.term_policy (
  term_policy_id bigserial primary key,
  term_id bigint not null references dictionary.term(term_id) on delete cascade,
  expression text not null,
  policy_type text not null,
  replacement text,
  reason text,
  created_at timestamptz not null default now(),
  unique (term_id, expression, policy_type),
  constraint term_policy_type check (policy_type in ('preferred', 'forbidden', 'deprecated'))
);

create table if not exists dictionary.term_relation (
  term_relation_id bigserial primary key,
  source_term_id bigint not null references dictionary.term(term_id) on delete cascade,
  target_term_id bigint not null references dictionary.term(term_id) on delete cascade,
  relation_type text not null,
  created_at timestamptz not null default now(),
  unique (source_term_id, target_term_id, relation_type),
  constraint term_relation_not_self check (source_term_id <> target_term_id),
  constraint term_relation_type check (relation_type in ('references', 'contains', 'replaces', 'related'))
);

create index if not exists term_domain_idx on dictionary.term(domain_id);
create index if not exists term_label_term_idx on dictionary.term_label(term_id);
create index if not exists term_alias_lookup_idx on dictionary.term_alias(alias);
create index if not exists term_policy_lookup_idx on dictionary.term_policy(expression, policy_type);
