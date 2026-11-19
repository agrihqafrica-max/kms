BEGIN;

CREATE OR REPLACE FUNCTION public.get_current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT public.get_current_organization_id()
$function$;

REVOKE ALL ON FUNCTION public.get_current_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_org_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_org_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_current_org_context(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_org_member(p_organization_id) THEN
        RAISE EXCEPTION 'tenant context is not authorized' USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.current_org_id', p_organization_id::text, true);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_current_org_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_current_org_context(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_current_org_context(uuid) TO authenticated;

COMMIT;
