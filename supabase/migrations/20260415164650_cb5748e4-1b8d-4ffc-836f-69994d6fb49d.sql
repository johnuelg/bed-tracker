-- Allow users to create their own profile
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

-- Enforce field-level edit restrictions for non-admin/director at DB layer
create or replace function public.enforce_submission_field_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_privileged boolean;
begin
  is_privileged := public.is_admin_or_director(auth.uid());

  if is_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.total_beds <> 0 then
      raise exception 'Only admin/director can set total beds on insert';
    end if;

    if coalesce(new.custom_fields, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Only admin/director can set custom fields on insert';
    end if;

    if coalesce(new.calculated_fields, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Only admin/director can set calculated fields on insert';
    end if;

    return new;
  end if;

  -- UPDATE restrictions for non-privileged roles
  if new.department_id is distinct from old.department_id then
    raise exception 'Only admin/director can change department';
  end if;

  if new.bed_type_id is distinct from old.bed_type_id then
    raise exception 'Only admin/director can change bed type';
  end if;

  if new.total_beds is distinct from old.total_beds then
    raise exception 'Only admin/director can change total beds';
  end if;

  if coalesce(new.custom_fields, '{}'::jsonb) is distinct from coalesce(old.custom_fields, '{}'::jsonb) then
    raise exception 'Only admin/director can change custom fields';
  end if;

  if coalesce(new.calculated_fields, '{}'::jsonb) is distinct from coalesce(old.calculated_fields, '{}'::jsonb) then
    raise exception 'Only admin/director can change calculated fields';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bed_submissions_permission_guard on public.bed_submissions;
create trigger trg_bed_submissions_permission_guard
before insert or update on public.bed_submissions
for each row execute function public.enforce_submission_field_permissions();

-- Storage bucket for documents (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  2097152,
  array[
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: each user in own folder (documents/{userId}/...)
drop policy if exists "Users can upload own documents" on storage.objects;
create policy "Users can upload own documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can view own documents" on storage.objects;
create policy "Users can view own documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can update own documents" on storage.objects;
create policy "Users can update own documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can delete own documents" on storage.objects;
create policy "Users can delete own documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);