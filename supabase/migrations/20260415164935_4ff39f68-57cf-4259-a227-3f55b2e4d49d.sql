create or replace function public.has_any_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where role = 'admin'::public.app_role
  );
$$;

drop policy if exists "First user can bootstrap admin" on public.user_roles;
create policy "First user can bootstrap admin"
on public.user_roles
for insert
to authenticated
with check (
  auth.uid() = user_id
  and role = 'admin'::public.app_role
  and not public.has_any_admin()
);