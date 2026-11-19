BEGIN;

CREATE OR REPLACE FUNCTION public.record_navigation_violation(
    p_organization_id uuid,
    p_requested_resource text,
    p_requested_action text DEFAULT 'view'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_actor_auth uuid;
    v_public_user_id uuid;
    v_audit_id uuid;
BEGIN
    v_actor_auth := auth.uid();

    IF v_actor_auth IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_org_member(p_organization_id) THEN
        RAISE EXCEPTION 'navigation violation: tenant membership required' USING ERRCODE = '42501';
    END IF;

    SELECT u.id INTO v_public_user_id
    FROM public.users u
    WHERE u.organization_id = p_organization_id
      AND u.auth_user_id = v_actor_auth
    LIMIT 1;

    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action_type,
        details
    ) VALUES (
        p_organization_id,
        v_public_user_id,
        'navigation_violation',
        jsonb_build_object(
            'requested_resource', p_requested_resource,
            'requested_action', p_requested_action,
            'auth_user_id', v_actor_auth,
            'role', public.get_current_user_role(p_organization_id),
            'denied', true,
            'timestamp', now()
        )
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_navigation_violation(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_navigation_violation(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_navigation_violation(uuid, text, text) TO authenticated;

COMMIT;
