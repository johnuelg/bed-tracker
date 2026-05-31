-- Create the audit log table before tamper-proof policies run, then capture
-- Bed Entry changes automatically at database level.
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
DROP POLICY IF EXISTS "audit_logs_authenticated_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authenticated_read"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.audit_bed_submission_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
  actor_name TEXT;
  dept_name TEXT;
  change_set JSONB := '{}'::jsonb;
  old_custom JSONB := '{}'::jsonb;
  new_custom JSONB := '{}'::jsonb;
  custom_key TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    actor_id := COALESCE(auth.uid(), OLD.updated_by, OLD.submitted_by);
    SELECT name INTO dept_name FROM public.departments WHERE id = OLD.department_id;
  ELSE
    actor_id := COALESCE(auth.uid(), NEW.updated_by, NEW.submitted_by);
    SELECT name INTO dept_name FROM public.departments WHERE id = NEW.department_id;
  END IF;

  SELECT display_name INTO actor_name FROM public.profiles WHERE user_id = actor_id;
  actor_name := COALESCE(NULLIF(actor_name, ''), NULLIF(current_setting('request.jwt.claim.email', true), ''), actor_id::TEXT);

  IF TG_OP = 'INSERT' THEN
    change_set := jsonb_build_object(
      'department_id', jsonb_build_object('from', NULL, 'to', NEW.department_id),
      'bed_type_id', jsonb_build_object('from', NULL, 'to', NEW.bed_type_id),
      'total_beds', jsonb_build_object('from', NULL, 'to', NEW.total_beds),
      'occupied', jsonb_build_object('from', NULL, 'to', NEW.occupied),
      'closed', jsonb_build_object('from', NULL, 'to', NEW.closed),
      'closure_reason', jsonb_build_object('from', NULL, 'to', NEW.closure_reason),
      'submitted_on', jsonb_build_object('from', NULL, 'to', NEW.submitted_on)
    );
    new_custom := COALESCE(NEW.custom_fields, '{}'::jsonb);
    FOR custom_key IN SELECT jsonb_object_keys(new_custom) LOOP
      change_set := change_set || jsonb_build_object('custom.' || custom_key, jsonb_build_object('from', NULL, 'to', new_custom -> custom_key));
    END LOOP;

    INSERT INTO public.audit_logs (action, table_name, record_id, user_id, user_name, department_name, record_date, changes)
    VALUES ('ADD', TG_TABLE_NAME, NEW.id, actor_id, actor_name, dept_name, NEW.submitted_on, change_set);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
      change_set := change_set || jsonb_build_object('department_id', jsonb_build_object('from', OLD.department_id, 'to', NEW.department_id));
    END IF;
    IF OLD.bed_type_id IS DISTINCT FROM NEW.bed_type_id THEN
      change_set := change_set || jsonb_build_object('bed_type_id', jsonb_build_object('from', OLD.bed_type_id, 'to', NEW.bed_type_id));
    END IF;
    IF OLD.total_beds IS DISTINCT FROM NEW.total_beds THEN
      change_set := change_set || jsonb_build_object('total_beds', jsonb_build_object('from', OLD.total_beds, 'to', NEW.total_beds));
    END IF;
    IF OLD.occupied IS DISTINCT FROM NEW.occupied THEN
      change_set := change_set || jsonb_build_object('occupied', jsonb_build_object('from', OLD.occupied, 'to', NEW.occupied));
    END IF;
    IF OLD.closed IS DISTINCT FROM NEW.closed THEN
      change_set := change_set || jsonb_build_object('closed', jsonb_build_object('from', OLD.closed, 'to', NEW.closed));
    END IF;
    IF OLD.closure_reason IS DISTINCT FROM NEW.closure_reason THEN
      change_set := change_set || jsonb_build_object('closure_reason', jsonb_build_object('from', OLD.closure_reason, 'to', NEW.closure_reason));
    END IF;
    IF OLD.submitted_on IS DISTINCT FROM NEW.submitted_on THEN
      change_set := change_set || jsonb_build_object('submitted_on', jsonb_build_object('from', OLD.submitted_on, 'to', NEW.submitted_on));
    END IF;

    old_custom := COALESCE(OLD.custom_fields, '{}'::jsonb);
    new_custom := COALESCE(NEW.custom_fields, '{}'::jsonb);
    FOR custom_key IN
      SELECT jsonb_object_keys(old_custom)
      UNION
      SELECT jsonb_object_keys(new_custom)
    LOOP
      IF old_custom -> custom_key IS DISTINCT FROM new_custom -> custom_key THEN
        change_set := change_set || jsonb_build_object('custom.' || custom_key, jsonb_build_object('from', old_custom -> custom_key, 'to', new_custom -> custom_key));
      END IF;
    END LOOP;

    IF change_set <> '{}'::jsonb THEN
      INSERT INTO public.audit_logs (action, table_name, record_id, user_id, user_name, department_name, record_date, changes)
      VALUES ('EDIT', TG_TABLE_NAME, NEW.id, actor_id, actor_name, dept_name, NEW.submitted_on, change_set);
    END IF;
    RETURN NEW;
  END IF;

  change_set := jsonb_build_object(
    'department_id', jsonb_build_object('from', OLD.department_id, 'to', NULL),
    'bed_type_id', jsonb_build_object('from', OLD.bed_type_id, 'to', NULL),
    'total_beds', jsonb_build_object('from', OLD.total_beds, 'to', NULL),
    'occupied', jsonb_build_object('from', OLD.occupied, 'to', NULL),
    'closed', jsonb_build_object('from', OLD.closed, 'to', NULL),
    'closure_reason', jsonb_build_object('from', OLD.closure_reason, 'to', NULL),
    'submitted_on', jsonb_build_object('from', OLD.submitted_on, 'to', NULL)
  );
  old_custom := COALESCE(OLD.custom_fields, '{}'::jsonb);
  FOR custom_key IN SELECT jsonb_object_keys(old_custom) LOOP
    change_set := change_set || jsonb_build_object('custom.' || custom_key, jsonb_build_object('from', old_custom -> custom_key, 'to', NULL));
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, user_id, user_name, department_name, record_date, changes)
  VALUES ('DELETE', TG_TABLE_NAME, OLD.id, actor_id, actor_name, dept_name, OLD.submitted_on, change_set);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_bed_submission_changes ON public.bed_submissions;
CREATE TRIGGER audit_bed_submission_changes
AFTER INSERT OR UPDATE OR DELETE ON public.bed_submissions
FOR EACH ROW EXECUTE FUNCTION public.audit_bed_submission_changes();
