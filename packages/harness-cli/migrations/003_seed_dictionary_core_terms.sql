insert into dictionary.domain (domain_key, ko_name, en_name, description)
values
  ('hcp', 'HCP', 'Harness Command Pack', 'Harness lifecycle commands and runtime state'),
  ('document', '문서', 'Document', 'Repository documents and document lifecycle'),
  ('database', '데이터베이스', 'Database', 'Database schema, migration, and storage terms')
on conflict (domain_key) do nothing;

with hcp_domain as (
  select domain_id from dictionary.domain where domain_key = 'hcp'
), document_domain as (
  select domain_id from dictionary.domain where domain_key = 'document'
), database_domain as (
  select domain_id from dictionary.domain where domain_key = 'database'
), inserted_terms as (
  insert into dictionary.term (domain_id, term_key, description)
  select domain_id, term_key, description
  from (
    select hcp_domain.domain_id, 'session_start' as term_key, 'Start-session read/check/report command' as description from hcp_domain
    union all select hcp_domain.domain_id, 'task_start', 'Task boundary and branch preparation command' from hcp_domain
    union all select hcp_domain.domain_id, 'session_close', 'Session retrospective and close command' from hcp_domain
    union all select hcp_domain.domain_id, 'backlog', 'Deferred or follow-up work item' from hcp_domain
    union all select document_domain.domain_id, 'retrospective', 'Session retrospective document' from document_domain
    union all select database_domain.domain_id, 'migration', 'Versioned database schema change' from database_domain
  ) seeds
  on conflict (domain_id, term_key) do nothing
  returning term_id, term_key
)
insert into dictionary.term_label (term_id, language_code, label, is_primary)
select t.term_id, labels.language_code, labels.label, true
from dictionary.term t
join dictionary.domain d on d.domain_id = t.domain_id
join (
  values
    ('hcp', 'session_start', 'ko', '세션시작'),
    ('hcp', 'session_start', 'en', 'Session Start'),
    ('hcp', 'task_start', 'ko', '태스크시작'),
    ('hcp', 'task_start', 'en', 'Task Start'),
    ('hcp', 'session_close', 'ko', '세션정리'),
    ('hcp', 'session_close', 'en', 'Session Close'),
    ('hcp', 'backlog', 'ko', '백로그'),
    ('hcp', 'backlog', 'en', 'Backlog'),
    ('document', 'retrospective', 'ko', '회고'),
    ('document', 'retrospective', 'en', 'Retrospective'),
    ('database', 'migration', 'ko', '마이그레이션'),
    ('database', 'migration', 'en', 'Migration')
) as labels(domain_key, term_key, language_code, label)
  on labels.domain_key = d.domain_key and labels.term_key = t.term_key
on conflict (term_id, language_code, label) do nothing;

insert into dictionary.term_alias (term_id, alias, alias_type, language_code)
select t.term_id, aliases.alias, aliases.alias_type, aliases.language_code
from dictionary.term t
join dictionary.domain d on d.domain_id = t.domain_id
join (
  values
    ('hcp', 'session_start', '#세션시작', 'tag', 'ko'),
    ('hcp', 'session_start', '#sessionstart', 'tag', 'en'),
    ('hcp', 'task_start', '#태스크시작', 'tag', 'ko'),
    ('hcp', 'task_start', '#taskstart', 'tag', 'en'),
    ('hcp', 'session_close', '#세션정리', 'tag', 'ko'),
    ('hcp', 'session_close', '#sessionclose', 'tag', 'en')
) as aliases(domain_key, term_key, alias, alias_type, language_code)
  on aliases.domain_key = d.domain_key and aliases.term_key = t.term_key
on conflict (term_id, alias) do nothing;

insert into dictionary.term_policy (term_id, expression, policy_type, replacement, reason)
select t.term_id, policies.expression, policies.policy_type, policies.replacement, policies.reason
from dictionary.term t
join dictionary.domain d on d.domain_id = t.domain_id
join (
  values
    ('hcp', 'session_close', '스킬형 세션종료', 'forbidden', '세션정리', 'HCP command terminology uses tag procedure names'),
    ('hcp', 'session_close', 'session cleanup', 'deprecated', 'session close', 'Use the standard HCP lifecycle term'),
    ('database', 'migration', '전체쿼리', 'deprecated', 'migration', 'Use versioned migration terminology for schema changes')
) as policies(domain_key, term_key, expression, policy_type, replacement, reason)
  on policies.domain_key = d.domain_key and policies.term_key = t.term_key
on conflict (term_id, expression, policy_type) do nothing;
