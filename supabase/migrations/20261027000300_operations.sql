-- 3/3: Shared worker queue, bounded actions, retention/removal and final grants.
begin;

create function public.check_worker_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and email is not null);
$$;

create function public.claim_discovery(p_owner uuid default null) returns setof public.discovery_runs
language plpgsql security definer set search_path = '' as $$
begin
 if p_owner is not null and not public.check_worker_user(p_owner) then raise exception 'Worker user is not confirmed'; end if;
 update public.discovery_runs set state='failed',ended_at=now(),error_summary='Worker lease expired; review and start a new run'
 where (p_owner is null or owner_id=p_owner) and state='running' and started_at<now()-interval '20 minutes';
 return query with candidate as (
   select r.id from public.discovery_runs r join auth.users u on u.id=r.owner_id
   where r.state='queued' and u.email_confirmed_at is not null and (p_owner is null or r.owner_id=p_owner)
   order by r.created_at,r.id for update of r skip locked limit 1
 ) update public.discovery_runs r set state='running',started_at=now() from candidate c where r.id=c.id returning r.*;
end $$;

create function public.pending_manual_sources(p_owner uuid,p_project uuid,p_cap integer) returns setof public.source_items
language sql security definer set search_path = '' as $$
 select i.* from public.source_items i
 join public.project_source_items l on l.item_id=i.id and l.owner_id=i.owner_id
 join public.research_projects p on p.id=l.project_id and p.owner_id=i.owner_id
 join auth.users u on u.id=i.owner_id and u.email_confirmed_at is not null
 where i.owner_id=p_owner and l.project_id=p_project and i.source='manual'
   and i.expires_at>now() and i.removal_requested_at is null
   and not exists(select 1 from public.analysis_results a where a.project_id=p_project and a.item_id=i.id)
   and not exists(select 1 from public.pain_signals s where s.project_id=p_project and s.item_id=i.id)
 order by i.collected_at desc limit least(greatest(p_cap,0),60);
$$;

create function public.enqueue_scheduled_discoveries() returns integer
language plpgsql security definer set search_path = '' as $$
declare added integer;
begin
 perform pg_advisory_xact_lock(7361250);
 insert into public.discovery_runs(owner_id,project_id,triggering_actor,ai_enabled,max_items,max_ai_calls)
 select p.owner_id,p.id,'schedule',false,30,5 from public.research_projects p
 join auth.users u on u.id=p.owner_id and u.email_confirmed_at is not null
 where p.scheduled and not exists(select 1 from public.discovery_runs r where r.project_id=p.id
   and (r.state in ('queued','running') or r.created_at>now()-interval '24 hours'))
 on conflict do nothing;
 get diagnostics added = row_count;
 return added;
end $$;

create function public.enqueue_discovery(p_project uuid, p_ai boolean, p_cap integer, p_calls integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_id uuid; begin
 select owner_id into v_owner from public.research_projects where id=p_project;
 if not public.is_owner(v_owner) then raise exception 'Unauthorized'; end if;
 perform pg_advisory_xact_lock(hashtext(v_owner::text));
 if (select count(*) from public.discovery_runs where owner_id=v_owner and created_at>now()-interval '1 hour') >= 10 then raise exception 'Hourly job cap reached'; end if;
 insert into public.discovery_runs(owner_id,project_id,triggering_actor,ai_enabled,max_items,max_ai_calls)
 values(v_owner,p_project,'user',p_ai,p_cap,p_calls) returning id into v_id;
 return v_id;
end $$;

create function public.remove_source(p_item uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.source_items; begin
 select * into s from public.source_items where id=p_item;
 if s.id is null or not public.is_owner(s.owner_id) then raise exception 'Unauthorized'; end if;
 insert into public.source_removals(owner_id,source,external_id,content_hash,canonical_url) values(s.owner_id,s.source,s.external_id,s.content_hash,s.canonical_url) on conflict do nothing;
 delete from public.source_items where id=p_item;
end $$;

create function public.create_outreach(p_prospect uuid,p_source uuid,p_channel text,p_approach text,p_body text,p_urls jsonb,p_facts jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_id uuid; begin
 select owner_id into v_owner from public.prospects where id=p_prospect;
 if not public.is_owner(v_owner) then raise exception 'Unauthorized'; end if;
 perform pg_advisory_xact_lock(hashtext(v_owner::text));
 if (select count(*) from public.outreach_drafts where owner_id=v_owner and created_at>now()-interval '1 hour')>=30 then raise exception 'Hourly draft cap reached'; end if;
 insert into public.outreach_drafts(owner_id,prospect_id,source_item_id,channel,approach,body,evidence_urls,claimed_facts)
 values(v_owner,p_prospect,p_source,p_channel,p_approach,p_body,p_urls,p_facts) returning id into v_id;
 return v_id;
end $$;

create function public.source_insert_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.source_policies; begin
 select * into p from public.source_policies where source_id=new.source;
 if not coalesce(p.enabled,false) or new.source not in ('manual','hacker_news','public_web') then raise exception 'Source is not enabled'; end if;
 if new.source='public_web' and (p.approval_status<>'approved' or not p.automated_fetch
   or not exists(select 1 from jsonb_array_elements(p.limits->'pages') page where page->>'url'=new.canonical_url
     and page->>'permission_confirmed'='true' and page->>'public_discussion_confirmed'='true'))
 then raise exception 'Public page permission is missing'; end if;
 if exists(select 1 from public.source_removals where owner_id=new.owner_id and source=new.source and (external_id=new.external_id or content_hash=new.content_hash or canonical_url=new.canonical_url)) then raise exception 'Source was removed'; end if;
 if auth.role()<>'service_role' and (new.source<>'manual' or new.metadata->>'permission_confirmed' is distinct from 'true') then raise exception 'Only permission-confirmed manual imports are allowed'; end if;
 new.expires_at=least(new.expires_at,now()+make_interval(days=>p.retention_days));
 return new;
end $$;

create function public.guard_prospect() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_source text; v_author text; begin
 select source,author_handle into v_source,v_author from public.source_items where id=new.source_item_id and owner_id=new.owner_id;
 if new.public_handle is distinct from v_author then raise exception 'Handle must match source author'; end if;
 if new.do_not_contact then
   insert into public.contact_suppressions(owner_id,identity_key) values(new.owner_id,coalesce(v_source||':'||lower(v_author),'item:'||new.source_item_id::text)) on conflict do nothing;
 end if;
 if exists(select 1 from public.contact_suppressions where owner_id=new.owner_id and identity_key=coalesce(v_source||':'||lower(v_author),'item:'||new.source_item_id::text)) then new.do_not_contact=true; end if;
 return new;
end $$;

create function public.guard_draft() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.prospects; s public.source_items; begin
 select * into p from public.prospects where id=new.prospect_id and owner_id=new.owner_id;
 select * into s from public.source_items where id=p.source_item_id and owner_id=new.owner_id;
 if p.id is null or s.id is null or new.source_item_id<>s.id or s.expires_at<=now() or s.removal_requested_at is not null then raise exception 'Draft needs an active source and matching prospect'; end if;
 if p.do_not_contact or exists(select 1 from public.contact_suppressions where owner_id=new.owner_id and identity_key=coalesce(s.source||':'||lower(s.author_handle),'item:'||s.id::text)) then raise exception 'Prospect is globally suppressed'; end if;
 if tg_op='UPDATE' and new.body<>old.body and not new.claims_confirmed then raise exception 'Confirm evidence for edited claims'; end if;
 new.updated_at=now(); return new;
end $$;

create function public.propagate_suppression() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.do_not_contact then
   update public.prospects p set do_not_contact=true
   from public.source_items a,public.source_items b
   where p.owner_id=new.owner_id and p.id<>new.id and not p.do_not_contact
     and a.id=p.source_item_id and b.id=new.source_item_id
     and (a.id=b.id or (a.source=b.source and a.author_handle is not null and lower(a.author_handle)=lower(b.author_handle)));
 end if;
 return new;
end $$;

create trigger source_policy_guard before insert on public.source_items for each row execute function public.source_insert_guard();
create trigger prospect_guard before insert or update on public.prospects for each row execute function public.guard_prospect();
create trigger draft_guard before insert or update on public.outreach_drafts for each row execute function public.guard_draft();
create trigger suppress_related_prospects after insert or update of do_not_contact on public.prospects
for each row execute function public.propagate_suppression();

-- Definer functions have explicit execution grants; API clients cannot claim work.
revoke all on function public.check_worker_user(uuid), public.claim_discovery(uuid),
 public.pending_manual_sources(uuid,uuid,integer), public.enqueue_scheduled_discoveries()
 from public, anon, authenticated;
grant execute on function public.check_worker_user(uuid), public.claim_discovery(uuid),
 public.pending_manual_sources(uuid,uuid,integer), public.enqueue_scheduled_discoveries() to service_role;
revoke all on function public.enqueue_discovery(uuid,boolean,integer,integer), public.remove_source(uuid),
 public.create_outreach(uuid,uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_discovery(uuid,boolean,integer,integer), public.remove_source(uuid),
 public.create_outreach(uuid,uuid,text,text,text,jsonb,jsonb) to authenticated;
revoke all on function public.source_insert_guard(), public.guard_prospect(), public.guard_draft(),
 public.propagate_suppression() from public, anon, authenticated;

-- Research UI uses the session/RLS. Service access is server-only.
grant select on public.user_profiles, public.research_projects, public.source_policies, public.discovery_runs,
 public.source_items, public.project_source_items, public.pain_signals, public.pain_clusters,
 public.cluster_members, public.prospects, public.contact_suppressions, public.outreach_drafts,
 public.interview_notes, public.job_errors, public.source_cursors, public.source_removals,
 public.analysis_results, public.cluster_evidence to authenticated;
grant insert,update,delete on public.research_projects, public.project_source_items,
 public.prospects, public.interview_notes to authenticated;
grant insert on public.source_items to authenticated;
grant update(status),delete on public.pain_signals to authenticated;
grant update,delete on public.outreach_drafts to authenticated;
grant all on public.user_profiles, public.research_projects, public.source_policies, public.discovery_runs,
 public.source_items, public.project_source_items, public.pain_signals, public.pain_clusters,
 public.cluster_members, public.prospects, public.contact_suppressions, public.outreach_drafts,
 public.interview_notes, public.job_errors, public.source_cursors, public.source_removals,
 public.analysis_results to service_role;
grant select on public.cluster_evidence to service_role;
commit;
