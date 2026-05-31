drop policy if exists "Clinical staff update own submissions" on public.bed_submissions;
create policy "Clinical staff update submissions"
on public.bed_submissions
for update
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'director'::public.app_role)
  or public.has_role(auth.uid(), 'doctor'::public.app_role)
  or public.has_role(auth.uid(), 'nurse'::public.app_role)
  or public.has_role(auth.uid(), 'staff'::public.app_role)
)
with check (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'director'::public.app_role)
  or public.has_role(auth.uid(), 'doctor'::public.app_role)
  or public.has_role(auth.uid(), 'nurse'::public.app_role)
  or public.has_role(auth.uid(), 'staff'::public.app_role)
);