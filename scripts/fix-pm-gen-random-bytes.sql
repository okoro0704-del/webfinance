-- Fix: gen_random_bytes lives in extensions schema; PM SECURITY DEFINER
-- functions had search_path = pm, public, auth (no extensions).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION pm.generate_tracking_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pm, public, auth, extensions
AS $$
DECLARE
  v_candidate TEXT;
  v_attempts INTEGER := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    v_candidate := 'DLV-' || upper(encode(extensions.gen_random_bytes(6), 'hex'));

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM pm.deliveries WHERE tracking_number = v_candidate
    );

    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'Unable to allocate a unique tracking number';
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- Ensure all PM definer functions can resolve pgcrypto helpers
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pm' AND p.prosecdef
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO pm, public, auth, extensions',
      r.sig
    );
  END LOOP;
END $$;

SELECT pm.generate_tracking_number() AS sample_tracking;
