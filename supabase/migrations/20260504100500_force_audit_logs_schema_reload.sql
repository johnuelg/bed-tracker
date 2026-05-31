-- Force-create audit_logs and reload the PostgREST schema cache.
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

DROP POLICY IF EXISTS "audit_logs_authenticated_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authenticated_read"
ON public.audit_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "audit_logs_self_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_self_insert"
ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "audit_logs_no_update" ON public.audit_logs;
CREATE POLICY "audit_logs_no_update"
ON public.audit_logs FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_delete"
ON public.audit_logs FOR DELETE TO authenticated USING (false);

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
