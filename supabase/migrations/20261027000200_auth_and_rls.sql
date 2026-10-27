-- 2/3: Public signup, unique usernames, private workspaces and row-level policies.
begin;

create function public.is_owner(candidate uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select candidate = auth.uid() and exists(select 1 from auth.users u
   where u.id=candidate and u.email_confirmed_at is not null
     and lower(u.email)=lower(auth.jwt()->>'email'));
$$;

revoke all on function public.is_owner(uuid) from public, anon;
grant execute on function public.is_owner(uuid) to authenticated;

create function app_private.create_user_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare chosen text := lower(trim(new.raw_user_meta_data->>'username'));
begin
 if chosen !~ '^[a-z0-9_]{3,32}$' then chosen := null; end if;
 insert into public.user_profiles(id,username) values(new.id,chosen);
 return new;
end $$;

revoke all on function app_private.create_user_profile() from public, anon, authenticated;
create trigger create_user_profile after insert on auth.users
for each row execute function app_private.create_user_profile();

-- Account(s) may already exist in Supabase Auth before the app is installed.
-- Keep valid metadata usernames; duplicate historical names are assigned once.
with normalized as (
 select id,case when lower(trim(raw_user_meta_data->>'username')) ~ '^[a-z0-9_]{3,32}$'
   then lower(trim(raw_user_meta_data->>'username')) end as username from auth.users
), ranked as (
 select id,username,row_number() over(partition by username order by id) as position from normalized
)
insert into public.user_profiles(id,username)
select id,case when position=1 then username end from ranked;

create function public.ensure_user_profile() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_owner(auth.uid()) then return false; end if;
 insert into public.user_profiles(id) values(auth.uid()) on conflict(id) do nothing;
 return true;
end $$;

revoke all on function public.ensure_user_profile() from public, anon, authenticated;
grant execute on function public.ensure_user_profile() to authenticated;

create function public.set_username(p_username text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_owner(auth.uid()) then raise exception 'Sign in with a confirmed account'; end if;
 if p_username is null or p_username !~ '^[a-z0-9_]{3,32}$' then raise exception 'Invalid username'; end if;
 insert into public.user_profiles(id,username) values(auth.uid(),p_username)
 on conflict(id) do update set username=excluded.username;
end $$;

revoke all on function public.set_username(text) from public, anon, authenticated;
grant execute on function public.set_username(text) to authenticated;

create function public.resolve_login_email(p_username text) returns text
language sql stable security definer set search_path = '' as $$
 select u.email from public.user_profiles p join auth.users u on u.id=p.id
 where p.username=lower(trim(p_username)) and length(p_username) between 3 and 32
   and u.email_confirmed_at is not null;
$$;

revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;

-- The ownership helper applies to a row's user, never a singleton administrator.
do $$ declare t text; begin
 foreach t in array array['research_projects','discovery_runs','project_source_items','pain_clusters',
 'cluster_members','job_errors','source_cursors'] loop
  execute format('create policy user_access on public.%I for all to authenticated using (public.is_owner(owner_id)) with check (public.is_owner(owner_id))',t);
 end loop;
 foreach t in array array['contact_suppressions','source_removals','analysis_results'] loop
  execute format('create policy user_reads on public.%I for select to authenticated using (public.is_owner(owner_id))',t);
 end loop;
end $$;
create policy user_profile_read on public.user_profiles for select to authenticated
 using(id=auth.uid() and public.is_owner(id));
create policy users_read_source_policies on public.source_policies for select to authenticated
 using(public.is_owner(auth.uid()));
create policy user_reads_active_sources on public.source_items for select to authenticated
 using(public.is_owner(owner_id) and expires_at>now() and removal_requested_at is null);
create policy user_imports_sources on public.source_items for insert to authenticated
 with check(public.is_owner(owner_id));
create policy user_signals on public.pain_signals for all to authenticated
 using(public.is_owner(owner_id) and exists(select 1 from public.source_items i where i.id=item_id))
 with check(public.is_owner(owner_id) and exists(select 1 from public.source_items i where i.id=item_id));
create policy user_prospects on public.prospects for all to authenticated
 using(public.is_owner(owner_id) and exists(select 1 from public.source_items i where i.id=source_item_id))
 with check(public.is_owner(owner_id) and exists(select 1 from public.source_items i where i.id=source_item_id));
create policy user_drafts on public.outreach_drafts for all to authenticated
 using(public.is_owner(owner_id) and exists(select 1 from public.source_items i where i.id=source_item_id))
 with check(public.is_owner(owner_id) and exists(select 1 from public.source_items i where i.id=source_item_id));
create policy user_interviews on public.interview_notes for all to authenticated
 using(public.is_owner(owner_id) and exists(select 1 from public.prospects p where p.id=prospect_id))
 with check(public.is_owner(owner_id) and exists(select 1 from public.prospects p where p.id=prospect_id));

-- Cluster counts derive from live evidence so deletion/rejection cannot leave stale metrics.
create view public.cluster_evidence with (security_invoker=true) as
select c.id,c.owner_id,c.project_id,c.canonical_problem,c.summary,c.manual_review_status,
 count(s.id)::integer as evidence_count,
 count(distinct case when i.author_handle is not null then i.source||':'||lower(i.author_handle) end)::integer as distinct_authors,
 count(distinct coalesce(i.metadata->>'discussion_id',i.external_id))::integer as distinct_discussions,
 coalesce(max(s.score),0) as score
from public.pain_clusters c left join public.cluster_members m on m.cluster_id=c.id
left join public.pain_signals s on s.id=m.pain_signal_id and s.status<>'rejected'
left join public.source_items i on i.id=s.item_id and i.expires_at>now() and i.removal_requested_at is null
where s.id is null or i.id is not null group by c.id;
revoke all on public.cluster_evidence from public, anon, authenticated;
commit;
