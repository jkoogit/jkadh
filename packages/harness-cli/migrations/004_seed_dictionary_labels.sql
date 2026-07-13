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
