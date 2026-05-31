create extension if not exists pgcrypto;

-- enums (idempotent)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role' and typnamespace = 'public'::regnamespace) then
    create type public.app_role as enum ('admin', 'director', 'doctor', 'nurse', 'staff');
  end if;

  if not exists (select 1 from pg_type where typname = 'form_field_type' and typnamespace = 'public'::regnamespace) then
    create type public.form_field_type as enum ('number', 'text', 'textarea', 'select', 'boolean', 'date', 'formula');
  end if;
end $$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_user_id on public.profiles(user_id);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, role)
);
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role on public.user_roles(role);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_admin_or_director(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'admin'::public.app_role)
      or public.has_role(_user_id, 'director'::public.app_role);
$$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_departments_is_active on public.departments(is_active);
create index if not exists idx_departments_sort_order on public.departments(sort_order);

create table if not exists public.bed_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bed_types_is_active on public.bed_types(is_active);
create index if not exists idx_bed_types_sort_order on public.bed_types(sort_order);

create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  field_key text not null unique,
  label text not null,
  field_type public.form_field_type not null,
  is_required boolean not null default false,
  is_readonly boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  display_order int not null default 0,
  default_value text,
  options jsonb not null default '[]'::jsonb,
  editable_roles public.app_role[] not null default array['admin'::public.app_role],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_form_fields_active_order on public.form_fields(is_active, display_order);

create table if not exists public.bed_submissions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id),
  bed_type_id uuid references public.bed_types(id),
  total_beds int not null default 0,
  occupied int not null default 0,
  closed int not null default 0,
  closure_reason text,
  submitted_on date not null default current_date,
  custom_fields jsonb not null default '{}'::jsonb,
  calculated_fields jsonb not null default '{}'::jsonb,
  submitted_by uuid not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bed_submissions_non_negative_values check (total_beds >= 0 and occupied >= 0 and closed >= 0),
  constraint bed_submissions_closed_not_exceed_total check (closed <= total_beds),
  constraint bed_submissions_occupied_not_exceed_total check (occupied <= total_beds),
  constraint bed_submissions_closure_reason_required check ((closed = 0) or (length(coalesce(closure_reason, '')) > 0))
);
create index if not exists idx_bed_submissions_department_date on public.bed_submissions(department_id, submitted_on desc);
create index if not exists idx_bed_submissions_bed_type_date on public.bed_submissions(bed_type_id, submitted_on desc);
create index if not exists idx_bed_submissions_submitted_on on public.bed_submissions(submitted_on desc);
create index if not exists idx_bed_submissions_custom_fields_gin on public.bed_submissions using gin(custom_fields);

create table if not exists public.kpi_formulas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  expression text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_kpi_formulas_active on public.kpi_formulas(is_active);

create table if not exists public.kpi_widgets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  formula_id uuid references public.kpi_formulas(id) on delete set null,
  aggregation_scope text not null default 'department_sum',
  is_visible boolean not null default true,
  display_order int not null default 0,
  refresh_seconds int not null default 30,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_kpi_widgets_visible_order on public.kpi_widgets(is_visible, display_order);

create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at_column();
create trigger trg_user_roles_updated_at before update on public.user_roles for each row execute function public.update_updated_at_column();
create trigger trg_departments_updated_at before update on public.departments for each row execute function public.update_updated_at_column();
create trigger trg_bed_types_updated_at before update on public.bed_types for each row execute function public.update_updated_at_column();
create trigger trg_form_fields_updated_at before update on public.form_fields for each row execute function public.update_updated_at_column();
create trigger trg_bed_submissions_updated_at before update on public.bed_submissions for each row execute function public.update_updated_at_column();
create trigger trg_kpi_formulas_updated_at before update on public.kpi_formulas for each row execute function public.update_updated_at_column();
create trigger trg_kpi_widgets_updated_at before update on public.kpi_widgets for each row execute function public.update_updated_at_column();

create or replace function public.set_submission_actor_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.submitted_by is null then new.submitted_by = auth.uid(); end if;
    if new.updated_by is null then new.updated_by = auth.uid(); end if;
  else
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger trg_bed_submissions_actor_defaults
before insert or update on public.bed_submissions
for each row execute function public.set_submission_actor_defaults();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.departments enable row level security;
alter table public.bed_types enable row level security;
alter table public.form_fields enable row level security;
alter table public.bed_submissions enable row level security;
alter table public.kpi_formulas enable row level security;
alter table public.kpi_widgets enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Admins can manage all profiles" on public.profiles;
create policy "Admins can manage all profiles" on public.profiles
for all to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Users can view own roles" on public.user_roles;
create policy "Users can view own roles" on public.user_roles
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can manage roles" on public.user_roles;
create policy "Admins can manage roles" on public.user_roles
for all to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['departments','bed_types','form_fields','kpi_formulas','kpi_widgets']
  loop
    execute format('drop policy if exists "Authenticated can read %s" on public.%I', table_name, table_name);
    execute format('create policy "Authenticated can read %s" on public.%I for select to authenticated using (true)', table_name, table_name);

    execute format('drop policy if exists "Admin director manage %s" on public.%I', table_name, table_name);
    execute format('create policy "Admin director manage %s" on public.%I for all to authenticated using (public.is_admin_or_director(auth.uid())) with check (public.is_admin_or_director(auth.uid()))', table_name, table_name);
  end loop;
end $$;

drop policy if exists "Authenticated can read bed submissions" on public.bed_submissions;
create policy "Authenticated can read bed submissions" on public.bed_submissions
for select to authenticated
using (true);

drop policy if exists "Clinical staff create own submissions" on public.bed_submissions;
create policy "Clinical staff create own submissions" on public.bed_submissions
for insert to authenticated
with check (
  auth.uid() = submitted_by
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'director'::public.app_role)
    or public.has_role(auth.uid(), 'doctor'::public.app_role)
    or public.has_role(auth.uid(), 'nurse'::public.app_role)
    or public.has_role(auth.uid(), 'staff'::public.app_role)
  )
);

drop policy if exists "Clinical staff update own submissions" on public.bed_submissions;
create policy "Clinical staff update own submissions" on public.bed_submissions
for update to authenticated
using (public.is_admin_or_director(auth.uid()) or submitted_by = auth.uid())
with check (public.is_admin_or_director(auth.uid()) or submitted_by = auth.uid());

drop policy if exists "Admin director delete submissions" on public.bed_submissions;
create policy "Admin director delete submissions" on public.bed_submissions
for delete to authenticated
using (public.is_admin_or_director(auth.uid()));

insert into public.form_fields (field_key, label, field_type, is_required, is_readonly, is_system, display_order, default_value, editable_roles)
values
('department_id', 'Department', 'select', true, false, true, 1, null, array['admin'::public.app_role, 'director'::public.app_role]),
('total_beds', 'Total Beds', 'number', true, false, true, 2, '0', array['admin'::public.app_role, 'director'::public.app_role]),
('occupied', 'Occupied', 'number', true, false, true, 3, '0', array['admin'::public.app_role, 'director'::public.app_role, 'doctor'::public.app_role, 'nurse'::public.app_role, 'staff'::public.app_role]),
('closed', 'Closed', 'number', true, false, true, 4, '0', array['admin'::public.app_role, 'director'::public.app_role, 'doctor'::public.app_role, 'nurse'::public.app_role, 'staff'::public.app_role]),
('closure_reason', 'Reason for Closure', 'textarea', false, false, true, 5, null, array['admin'::public.app_role, 'director'::public.app_role, 'doctor'::public.app_role, 'nurse'::public.app_role, 'staff'::public.app_role])
on conflict (field_key) do nothing;

insert into public.departments (name, code, sort_order)
values
('NICU', 'NICU', 1),
('PICU', 'PICU', 2),
('SDC', 'SDC', 3),
('P1', 'P1', 4),
('P2', 'P2', 5),
('P3', 'P3', 6),
('P4', 'P4', 7)
on conflict (code) do nothing;

insert into public.bed_types (name, sort_order)
values
('Standard', 1),
('Isolation', 2),
('Telemetry', 3),
('Bassinet', 4)
on conflict (name) do nothing;