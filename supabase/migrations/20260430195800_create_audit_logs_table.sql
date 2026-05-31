-- Ensure the audit_logs table exists. A previous migration declared it but the
-- table is missing from the live database (PostgREST returns PGRST205), so the
-- Audit Log page never receives any rows. Recreate it idempotently along with
-- its indexes and policies.

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

-- Any authenticated user can append their own audit entry
DROP POLICY IF EXISTS "audit_logs_self_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_self_insert"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- All authenticated users can read the audit history (page is read-only)
DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_authenticated_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authenticated_read"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (true);

-- Tamper-proof: nobody can update or delete existing audit rows
DROP POLICY IF EXISTS "audit_logs_admin_modify" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_update" ON public.audit_logs;
CREATE POLICY "audit_logs_no_update"
ON public.audit_logs
FOR UPDATE
TO authenticated
USING (false);

DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_delete"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (false);
