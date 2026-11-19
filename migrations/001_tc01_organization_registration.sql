BEGIN;

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS org_type text,
    ADD COLUMN IF NOT EXISTS kra_compliance_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS payroll_compliance_enabled boolean NOT NULL DEFAULT false;

UPDATE public.organizations
SET org_type = 'RETAIL'
WHERE org_type IS NULL;

ALTER TABLE public.organizations
    ALTER COLUMN org_type SET DEFAULT 'RETAIL',
    ALTER COLUMN org_type SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'organizations_org_type_check'
          AND conrelid = 'public.organizations'::regclass
    ) THEN
        ALTER TABLE public.organizations
            ADD CONSTRAINT organizations_org_type_check
            CHECK (org_type IN ('IMPORTER','WHOLESALER','RETAIL','MECHANIC','CUSTOMER'));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_organization(
    p_name text,
    p_kra_pin text DEFAULT NULL,
    p_org_type text DEFAULT 'RETAIL',
    p_subscription_tier text DEFAULT 'standard',
    p_kra_compliance_enabled boolean DEFAULT false,
    p_payroll_compliance_enabled boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_org_id uuid;
    v_auth_user_id uuid;
BEGIN
    v_auth_user_id := auth.uid();
    IF v_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    IF nullif(btrim(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'organization name is required' USING ERRCODE = '22023';
    END IF;

    IF upper(p_org_type) NOT IN ('IMPORTER','WHOLESALER','RETAIL','MECHANIC','CUSTOMER') THEN
        RAISE EXCEPTION 'invalid organization type' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.organizations (
        name, kra_pin, org_type, subscription_tier, is_active,
        kra_compliance_enabled, payroll_compliance_enabled
    ) VALUES (
        btrim(p_name), nullif(btrim(p_kra_pin), ''), upper(p_org_type),
        coalesce(nullif(btrim(p_subscription_tier), ''), 'standard'), true,
        coalesce(p_kra_compliance_enabled, false),
        coalesce(p_payroll_compliance_enabled, false)
    ) RETURNING id INTO v_org_id;

    INSERT INTO public.organization_memberships (
        organization_id, auth_user_id, branch_id, role, status
    ) VALUES (
        v_org_id, v_auth_user_id, NULL, 'owner', 'active'
    );

    INSERT INTO public.audit_logs (
        organization_id, user_id, action_type, details
    ) VALUES (
        v_org_id, NULL, 'organization_registered',
        jsonb_build_object(
            'organization_id', v_org_id,
            'org_type', upper(p_org_type),
            'kra_compliance_enabled', coalesce(p_kra_compliance_enabled, false),
            'payroll_compliance_enabled', coalesce(p_payroll_compliance_enabled, false)
        )
    );

    RETURN v_org_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_organization(text, text, text, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_organization(text, text, text, text, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_organization(text, text, text, text, boolean, boolean) TO authenticated;

COMMIT;
