-- Developers can see who's waiting and approve them from inside the app, so the
-- Supabase dashboard is no longer needed for this.
--
-- Access belongs to an account, not an address. Addresses aren't verified, so a
-- whitelisted address with no account yet could be claimed by anyone signing up.

create table app_private.developers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on app_private.developers from public, anon, authenticated;

do $$
declare
  owner_id uuid;
begin
  select id into owner_id from auth.users where lower(email) = 'lintsai2404@gmail.com';
  if owner_id is null then
    raise exception 'lintsai2404@gmail.com has no account yet. Sign up, then apply this migration.';
  end if;
  insert into app_private.developers (user_id) values (owner_id);
  update public.signup_approvals set approved = true where user_id = owner_id;
end $$;

create function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app_private.developers where user_id = auth.uid());
$$;
revoke all on function public.is_developer() from public, anon;
grant execute on function public.is_developer() to authenticated;

-- Oldest first, capped because anyone with a Gmail address can sign up.
create function public.list_pending_approvals()
returns table (user_id uuid, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_developer() then
    raise exception 'not a developer' using errcode = 'insufficient_privilege';
  end if;
  return query
    select a.user_id, a.email, a.created_at
    from public.signup_approvals a
    where not a.approved
    order by a.created_at, a.user_id
    limit 200;
end;
$$;
revoke all on function public.list_pending_approvals() from public, anon;
grant execute on function public.list_pending_approvals() to authenticated;

-- Approving twice, or someone who has since deleted their account, does nothing.
create function public.approve_signup(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_developer() then
    raise exception 'not a developer' using errcode = 'insufficient_privilege';
  end if;
  update public.signup_approvals set approved = true where user_id = p_user_id;
end;
$$;
revoke all on function public.approve_signup(uuid) from public, anon;
grant execute on function public.approve_signup(uuid) to authenticated;
