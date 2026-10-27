-- 1/3: Fresh database schema and source defaults. Run as the database administrator.
-- Supabase supplies auth.users, auth.uid(), auth.jwt(), auth.role(), and API roles.
-- owner_id means the user who owns a resource; signup has no email allowlist.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.user_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique check(username ~ '^[a-z0-9_]{3,32}$'),
 created_at timestamptz not null default now()
);

create table public.research_projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 title text not null check(length(title) between 1 and 160), mode text not null check(mode in ('niche','problem','competitor')),
 icp text not null default '', geography text, keywords jsonb not null default '[]', includes jsonb not null default '[]', excludes jsonb not null default '[]', competitors jsonb not null default '[]',
 enabled_sources jsonb not null default '["hacker_news","manual"]', scheduled boolean not null default false,
 created_at timestamptz not null default now(), unique(id,owner_id)
);
create table public.source_policies (
 source_id text primary key, source_name text not null, access_mode text not null, approval_status text not null,
 enabled boolean not null default false, allowed_purpose text not null, disabled_reason text,
 limits jsonb not null, retention_days integer not null check(retention_days between 1 and 365),
 attribution text not null, automated_fetch boolean not null default false, last_verified_at timestamptz
);
insert into public.source_policies values
 ('hacker_news','Hacker News','official_public_api','approved',true,'Public discussion research via official Firebase API only',null,'{"max_items":60,"requests_per_second":4}',30,'Hacker News / original author; link to original item',true,now()),
 ('manual','Permitted manual import','pasted_text','operator_permission',true,'Operator-permitted public professional discussion excerpts; no URL fetch',null,'{"max_chars":12000}',30,'Original source URL and author when known',false,now()),
 ('reddit','Reddit','authorized_api','not_authorized',false,'Requires explicit commercial-use authorization','Disabled: authorization, credentials and storage/deletion terms not configured','{}',7,'Original Reddit attribution required',false,null),
 ('linkedin','LinkedIn','manual_notes_only','not_authorized',false,'Manual public professional notes only','Disabled: no automated access or messaging permitted','{}',30,'Operator-supplied public profile link',false,null),
 ('other','Other websites and communities','manual_only','not_authorized',false,'Only operator-permitted pasted excerpts','Disabled: no domain/API policy or authorization verified','{}',30,'Original URL',false,null);

create table public.discovery_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, project_id uuid not null,
 state text not null default 'queued' check(state in ('queued','running','completed','partial','failed')),
 started_at timestamptz, ended_at timestamptz, created_at timestamptz not null default now(),
 fetched integer not null default 0, accepted integer not null default 0, duplicates integer not null default 0, analyzed integer not null default 0, errors integer not null default 0,
 error_summary text, triggering_actor text not null, ai_enabled boolean not null default false,
 max_items integer not null default 30 check(max_items between 1 and 60), max_ai_calls integer not null default 5 check(max_ai_calls between 1 and 20),
 ai_calls integer not null default 0, input_tokens integer not null default 0, output_tokens integer not null default 0,
 foreign key(project_id,owner_id) references public.research_projects(id,owner_id) on delete cascade,
 unique(id,owner_id)
);
create unique index one_active_run_per_project on public.discovery_runs(project_id) where state in ('queued','running');
create table public.source_items (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 source text not null references public.source_policies(source_id), external_id text not null, canonical_url text not null check(canonical_url ~ '^https://'),
 author_handle text, published_at timestamptz, collected_at timestamptz not null default now(), title text not null,
 permitted_excerpt text not null check(length(permitted_excerpt) <= 12000), content_hash text not null,
 metadata jsonb not null default '{}', removal_requested_at timestamptz, expires_at timestamptz not null,
 search_text tsvector generated always as (to_tsvector('english',coalesce(title,'') || ' ' || permitted_excerpt)) stored,
 unique(owner_id,source,external_id), unique(owner_id,source,canonical_url), unique(owner_id,source,content_hash), unique(id,owner_id)
);
create table public.project_source_items (
 owner_id uuid not null, project_id uuid not null, item_id uuid not null,
 primary key(project_id,item_id),
 foreign key(project_id,owner_id) references public.research_projects(id,owner_id) on delete cascade,
 foreign key(item_id,owner_id) references public.source_items(id,owner_id) on delete cascade
);
create table public.pain_signals (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, project_id uuid not null, item_id uuid not null,
 extraction jsonb not null, summary text not null, category text,
 score numeric not null check(score between 0 and 100), evidence_completeness numeric not null check(evidence_completeness between 0 and 1),
 score_components jsonb not null, rules_version text not null, status text not null default 'new' check(status in ('new','saved','rejected')),
 model_id text not null, prompt_version text not null, created_at timestamptz not null default now(),
 foreign key(project_id,owner_id) references public.research_projects(id,owner_id) on delete cascade,
 foreign key(item_id,owner_id) references public.source_items(id,owner_id) on delete cascade,
 unique(project_id,item_id), unique(id,owner_id)
);
create table public.pain_clusters (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, project_id uuid not null,
 canonical_problem text not null, summary text not null, evidence_count integer not null default 0, distinct_authors integer not null default 0, distinct_discussions integer not null default 0,
 score numeric not null default 0, manual_review_status text not null default 'unreviewed',
 foreign key(project_id,owner_id) references public.research_projects(id,owner_id) on delete cascade,
 unique(project_id,canonical_problem), unique(id,owner_id)
);
create table public.cluster_members (
 owner_id uuid not null, cluster_id uuid not null, pain_signal_id uuid not null,
 primary key(cluster_id,pain_signal_id),
 foreign key(cluster_id,owner_id) references public.pain_clusters(id,owner_id) on delete cascade,
 foreign key(pain_signal_id,owner_id) references public.pain_signals(id,owner_id) on delete cascade
);
create table public.prospects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, project_id uuid not null, source_item_id uuid not null,
 display_name text, public_handle text, public_profile_url text, company text, professional_role text,
 role_verified boolean not null default false, identity_verified boolean not null default false,
 verification_notes text not null default '', buyer_classification text not null default 'unknown' check(buyer_classification in ('author','affected_user','influencer','economic_buyer','unknown')),
 status text not null default 'shortlisted', do_not_contact boolean not null default false, added_at timestamptz not null default now(),
 foreign key(project_id,owner_id) references public.research_projects(id,owner_id) on delete cascade,
 foreign key(source_item_id,owner_id) references public.source_items(id,owner_id) on delete cascade,
 unique(project_id,source_item_id), unique(id,owner_id),
 check(not role_verified or (professional_role is not null and length(verification_notes)>0)),
 check(not identity_verified or (display_name is not null and length(verification_notes)>0)),
 constraint verified_buyer_classification check(buyer_classification<>'economic_buyer' or role_verified)
);
create table public.contact_suppressions (
 owner_id uuid not null references auth.users(id), identity_key text not null, created_at timestamptz not null default now(), primary key(owner_id,identity_key)
);
create table public.outreach_drafts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, prospect_id uuid not null, source_item_id uuid not null,
 channel text not null check(channel in ('linkedin','email')), approach text not null check(approach in ('interview','helpful','pilot')),
 body text not null check(length(body) between 1 and 3000),
 review_status text not null default 'draft' check(review_status in ('draft','reviewed','copied','contacted_manually','responded','interviewed','not_interested','pilot_candidate')),
 evidence_urls jsonb not null, claimed_facts jsonb not null, claims_confirmed boolean not null default false,
 model_id text not null default 'evidence-template-v1', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(prospect_id,owner_id) references public.prospects(id,owner_id) on delete cascade,
 foreign key(source_item_id,owner_id) references public.source_items(id,owner_id) on delete cascade,
 check(review_status='draft' or claims_confirmed)
);
create table public.interview_notes (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, prospect_id uuid not null, interview_date date not null,
 notes text not null, pain_confirmed boolean, purchasing_authority boolean, current_spend text,
 paid_pilot_interest text not null check(paid_pilot_interest in ('unknown','yes','no','maybe')), next_action text,
 foreign key(prospect_id,owner_id) references public.prospects(id,owner_id) on delete cascade
);
create table public.job_errors (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, run_id uuid not null, code text not null, message text not null, created_at timestamptz not null default now(),
 foreign key(run_id,owner_id) references public.discovery_runs(id,owner_id) on delete cascade
);
create table public.source_cursors (
 owner_id uuid not null, project_id uuid not null, source text not null, last_id bigint not null default 0,
 primary key(project_id,source), foreign key(project_id,owner_id) references public.research_projects(id,owner_id) on delete cascade
);


create table public.source_removals (
 owner_id uuid not null references auth.users(id), source text not null, external_id text not null, content_hash text not null, canonical_url text not null,
 removed_at timestamptz not null default now(), primary key(owner_id,source,external_id)
);

create table public.analysis_results (
 owner_id uuid not null, project_id uuid not null, item_id uuid not null, is_relevant boolean not null, model_id text not null,
 analyzed_at timestamptz not null default now(), primary key(project_id,item_id),
 foreign key(project_id,owner_id) references public.research_projects(id,owner_id) on delete cascade,
 foreign key(item_id,owner_id) references public.source_items(id,owner_id) on delete cascade
);

insert into public.source_policies(source_id,source_name,access_mode,approval_status,enabled,allowed_purpose,disabled_reason,limits,retention_days,attribution,automated_fetch,last_verified_at) values
 ('g2','G2','licensed_api_or_export','permission_required',false,'Licensed public review research only',
  'Disabled: no permission for automated collection or analysis has been provided; connector not implemented.','{}',7,'G2 / original review URL and author',false,null),
 ('capterra','Capterra','licensed_api_or_export','permission_required',false,'Research only with express written permission covering collection and analysis',
  'Disabled: terms require express prior written consent for automated collection; no authorization or connector configured.','{}',7,'Capterra / original review URL and author',false,now())
 on conflict(source_id) do nothing;

insert into public.source_policies(source_id,source_name,access_mode,approval_status,enabled,allowed_purpose,disabled_reason,limits,retention_days,attribution,automated_fetch) values
 ('public_web','Approved public pages','permissioned_public_pages','not_authorized',false,
 'Public discussion pages with recorded domain permission covering collection, storage and AI analysis',
 'Disabled: configure exact pages, current permission review, robots compliance and administrator approval first.',
 '{"max_items":10,"pages":[]}',7,'Original public page URL; author unknown unless independently verified',false);


create index projects_owner on public.research_projects(owner_id);
create index runs_project_date on public.discovery_runs(project_id,created_at desc);
create index sources_expiry on public.source_items(expires_at);
create index sources_owner_source_date on public.source_items(owner_id,source,published_at desc);
create index source_search on public.source_items using gin(search_text);
create index signals_project_score on public.pain_signals(project_id,score desc);
create index signals_status_date on public.pain_signals(status,created_at desc);
create index prospects_owner_project on public.prospects(owner_id,project_id);
create index drafts_owner_status on public.outreach_drafts(owner_id,review_status);
create index interviews_prospect on public.interview_notes(prospect_id);
create index members_signal on public.cluster_members(pain_signal_id);

create index signals_source_item on public.pain_signals(item_id);
create index prospects_source_item on public.prospects(source_item_id);
create index drafts_source_item on public.outreach_drafts(source_item_id);
create index errors_run on public.job_errors(run_id);
create index links_source_item on public.project_source_items(item_id);
create index removals_hash on public.source_removals(owner_id,source,content_hash);

-- Keep all application tables inaccessible while the remaining migrations are applied.
do $$ declare t text; begin
 foreach t in array array['user_profiles','research_projects','source_policies','discovery_runs','source_items',
 'project_source_items','pain_signals','pain_clusters','cluster_members','prospects','contact_suppressions',
 'outreach_drafts','interview_notes','job_errors','source_cursors','source_removals','analysis_results'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
 end loop;
end $$;

-- Scores are persisted by the worker: four equal categories, up to 25 points each.
comment on column public.pain_signals.score is 'Research score /100: 5 * (severity + frequency + evidence_of_spend + buyer_accessibility); unknowns contribute 0.';
comment on column public.pain_signals.rules_version is 'Current scoring rules: equal-points-v2.';
commit;
