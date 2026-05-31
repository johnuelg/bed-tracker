-- User-level entry permissions (admin-controlled overrides on Bed Entry actions)
CREATE TABLE IF NOT EXISTS public.user_entry_permissions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_add BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT true,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.user_entry_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_entry_permissions_self_read" ON public.user_entry_permissions;
CREATE POLICY "user_entry_permissions_self_read"
ON public.user_entry_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_entry_permissions_admin_read" ON public.user_entry_permissions;
CREATE POLICY "user_entry_permissions_admin_read"
ON public.user_entry_permissions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_entry_permissions_admin_write" ON public.user_entry_permissions;
CREATE POLICY "user_entry_permissions_admin_write"
ON public.user_entry_permissions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Audit log table for Add / Edit / Delete actions on bed_submissions
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN ('ADD','EDIT','DELETE')),
  table_name TEXT NOT NULL DEFAULT 'bed_submissions',
  record_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  department_name TEXT,
  record_date DATE,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs (user_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_self_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_self_insert"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_read"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "audit_logs_admin_modify" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_modify"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
