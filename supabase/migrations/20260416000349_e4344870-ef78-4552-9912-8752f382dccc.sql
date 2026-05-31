create or replace function public.enforce_submission_field_permissions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  can_fully_edit boolean;
begin
  can_fully_edit := public.has_role(auth.uid(), 'admin')
                    or public.has_role(auth.uid(), 'staff');

  if can_fully_edit then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.total_beds <> 0 then
      raise exception 'Only admin/staff can set total beds on insert';
    end if;

    if coalesce(new.custom_fields, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Only admin/staff can set custom fields on insert';
    end if;

    if coalesce(new.calculated_fields, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Only admin/staff can set calculated fields on insert';
    end if;

    return new;
  end if;

  if new.department_id is distinct from old.department_id then
    raise exception 'Only admin/staff can change department';
  end if;

  if new.bed_type_id is distinct from old.bed_type_id then
    raise exception 'Only admin/staff can change bed type';
  end if;

  if new.total_beds is distinct from old.total_beds then
    raise exception 'Only admin/staff can change total beds';
  end if;

  if coalesce(new.custom_fields, '{}'::jsonb) is distinct from coalesce(old.custom_fields, '{}'::jsonb) then
    raise exception 'Only admin/staff can change custom fields';
  end if;

  if coalesce(new.calculated_fields, '{}'::jsonb) is distinct from coalesce(old.calculated_fields, '{}'::jsonb) then
    raise exception 'Only admin/staff can change calculated fields';
  end if;

  return new;
end;
$function$;