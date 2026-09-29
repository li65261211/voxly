-- Voxly security fixes — run once in the Supabase SQL editor.
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Fix A: pgvector is required by style_profiles.style_embedding vector(1536).
-- Without this, schema.sql fails when creating that table.
-- ---------------------------------------------------------------------------
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Fix B: auto-create a profiles row when a new user signs up.
-- Before this, a fresh Google sign-in had no profile row, so /api/rewrite
-- returned 404 'Profile not found' and the dashboard showed 0 credits.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill: create profile rows for users who signed up before this trigger.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Fix C: lock down profiles updates (privilege-escalation hole).
-- The old policy let any signed-in user UPDATE their own row with no column
-- restriction, so anyone with the anon key could set is_pro = true or
-- credits = 999999 via the Supabase API directly.
-- After this, client keys can only write display_name / email / updated_at.
-- credits, is_pro and total_credits_purchased are service_role-only
-- (the /api/rewrite route and the Edge Function use service_role, which
-- bypasses RLS and keeps working).
-- ---------------------------------------------------------------------------
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Column-level grants: normalize first so the result does not depend on
-- whatever the default privileges happened to be.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, email, updated_at) on public.profiles to authenticated;
