-- Make audit_logs tamper-proof: no UPDATE or DELETE for anyone (including admins).
DROP POLICY IF EXISTS "audit_logs_admin_modify" ON public.audit_logs;

DROP POLICY IF EXISTS "audit_logs_no_update" ON public.audit_logs;
CREATE POLICY "audit_logs_no_update"
ON public.audit_logs
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_delete"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (false);
