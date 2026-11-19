# Live schema audit — 2026-11-19 (read-only, OQ-09 / D-020)

## Public tables (32)

### audit_logs
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- user_id uuid null=YES
- action_type character varying null=NO
- details jsonb null=YES
- ip_address character varying null=YES
- created_at timestamp with time zone null=YES default=now()

### branch_inventory
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- part_name character varying null=NO
- part_number character varying null=NO
- category character varying null=YES
- compatible_models ARRAY null=YES
- unit_cost numeric null=NO
- retail_price numeric null=NO
- stock_quantity integer null=YES default=0
- reorder_level integer null=YES default=5
- updated_at timestamp with time zone null=YES default=now()

### branch_transfer_items
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- source_branch_id uuid null=NO
- destination_branch_id uuid null=NO
- transfer_id uuid null=NO
- source_inventory_id uuid null=NO
- destination_inventory_id uuid null=NO
- quantity integer null=NO
- created_at timestamp with time zone null=NO default=now()

### branch_transfers
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- source_branch_id uuid null=NO
- destination_branch_id uuid null=NO
- dispatch_manifest_id uuid null=YES
- status text null=NO default='requested'::text
- requested_by_auth_user_id uuid null=YES
- approved_by_auth_user_id uuid null=YES
- requested_at timestamp with time zone null=NO default=now()
- approved_at timestamp with time zone null=YES
- received_at timestamp with time zone null=YES

### branches
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_name character varying null=NO
- county character varying null=NO
- location_description text null=YES
- phone_number character varying null=YES
- is_main_hub boolean null=YES default=false
- created_at timestamp with time zone null=YES default=now()

### buyer_pickup_analytics
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- order_id uuid null=YES
- customer_identifier character varying null=YES
- processing_time_minutes integer null=YES
- pickup_status character varying null=YES default='Completed'::character varying
- recorded_at timestamp with time zone null=YES default=now()

### customers
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=YES
- full_name text null=NO
- phone_number text null=YES
- email text null=YES
- whatsapp_consent boolean null=NO default=false
- marketing_consent boolean null=NO default=false
- consent_recorded_at timestamp with time zone null=YES
- consent_source text null=YES
- created_at timestamp with time zone null=NO default=now()
- updated_at timestamp with time zone null=NO default=now()

### daily_expenses
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- recorded_by_user_id uuid null=YES
- category character varying null=NO
- amount numeric null=NO
- description text null=YES
- expense_date date null=YES default=CURRENT_DATE
- created_at timestamp with time zone null=YES default=now()

### dispatch_manifests
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- source_branch_id uuid null=NO
- destination_branch_id uuid null=NO
- rider_name character varying null=NO
- rider_phone character varying null=NO
- motorbike_number_plate character varying null=NO
- status character varying null=YES default='Dispatched'::character varying
- dispatched_at timestamp with time zone null=YES default=now()
- delivered_at timestamp with time zone null=YES

### eod_reconciliations
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- manager_id uuid null=YES
- reconciliation_date date null=YES default=CURRENT_DATE
- total_gross_sales numeric null=YES default=0.00
- total_cogs numeric null=YES default=0.00
- total_expenses numeric null=YES default=0.00
- net_profit numeric null=YES default=0.00
- cash_expected numeric null=YES default=0.00
- cash_counted numeric null=YES default=0.00
- variance numeric null=YES default=0.00
- is_approved boolean null=YES default=false
- created_at timestamp with time zone null=YES default=now()

### goods_receipt_items
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- receipt_id uuid null=NO
- purchase_order_id uuid null=NO
- purchase_order_item_id uuid null=NO
- inventory_id uuid null=NO
- quantity_received integer null=NO
- unit_cost numeric null=NO
- created_at timestamp with time zone null=NO default=now()

### goods_receipts
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- purchase_order_id uuid null=NO
- status text null=NO default='draft'::text
- receipt_reference text null=YES
- received_by_auth_user_id uuid null=YES
- posted_at timestamp with time zone null=YES
- created_at timestamp with time zone null=NO default=now()

### inbound_containers
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- container_number character varying null=NO
- origin_port character varying null=YES
- shipping_line character varying null=YES
- estimated_arrival_date date null=YES
- actual_arrival_date date null=YES
- status character varying null=YES default='In Transit'::character varying
- created_at timestamp with time zone null=YES default=now()

### inventory_movements
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- inventory_id uuid null=NO
- movement_type text null=NO
- quantity_delta integer null=NO
- reference_type text null=YES
- reference_id uuid null=YES
- actor_auth_user_id uuid null=YES
- details jsonb null=NO default='{}'::jsonb
- created_at timestamp with time zone null=NO default=now()
- unit_cost_at_movement numeric null=YES

### mechanics_directory
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- mechanic_name character varying null=NO
- phone_number character varying null=NO
- county character varying null=NO
- workshop_location text null=YES
- rating numeric null=YES default=5.00
- is_verified boolean null=YES default=true
- created_at timestamp with time zone null=YES default=now()

### monthly_payout_batches
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- batch_reference character varying null=NO
- total_payout_amount numeric null=NO
- status character varying null=YES default='Pending'::character varying
- disbursed_at timestamp with time zone null=YES
- created_at timestamp with time zone null=YES default=now()

### organization_memberships
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- auth_user_id uuid null=NO
- branch_id uuid null=YES
- role text null=NO
- status text null=NO default='active'::text
- created_at timestamp with time zone null=NO default=now()
- updated_at timestamp with time zone null=NO default=now()

### organizations
- id uuid null=NO default=uuid_generate_v4()
- name character varying null=NO
- kra_pin character varying null=YES
- subscription_tier character varying null=YES default='standard'::character varying
- is_active boolean null=YES default=true
- created_at timestamp with time zone null=YES default=now()
- updated_at timestamp with time zone null=YES default=now()
- org_type text null=NO default='RETAIL'::text
- kra_compliance_enabled boolean null=NO default=false
- payroll_compliance_enabled boolean null=NO default=false

### parts_radar_quotes
- id uuid null=NO default=uuid_generate_v4()
- request_id uuid null=NO
- responding_organization_id uuid null=NO
- quoted_price numeric null=NO
- available_quantity integer null=NO
- delivery_lead_time_hours integer null=YES
- status character varying null=YES default='Pending'::character varying
- created_at timestamp with time zone null=YES default=now()

### parts_radar_requests
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- requesting_branch_id uuid null=YES
- part_description text null=NO
- motorcycle_model character varying null=YES
- urgency_status character varying null=YES default='Normal'::character varying
- status character varying null=YES default='Open'::character varying
- created_at timestamp with time zone null=YES default=now()

### payout_line_items
- id uuid null=NO default=uuid_generate_v4()
- batch_id uuid null=NO
- recipient_name character varying null=NO
- recipient_phone character varying null=NO
- amount numeric null=NO
- status character varying null=YES default='Pending'::character varying
- mpesa_transaction_id character varying null=YES
- created_at timestamp with time zone null=YES default=now()

### purchase_order_items
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- purchase_order_id uuid null=NO
- inventory_id uuid null=YES
- part_description text null=NO
- quantity_ordered integer null=NO
- quantity_received integer null=NO default=0
- unit_cost numeric null=NO
- created_at timestamp with time zone null=NO default=now()

### purchase_orders
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- supplier_id uuid null=NO
- order_number text null=NO
- status text null=NO default='draft'::text
- notes text null=YES
- created_by_auth_user_id uuid null=YES
- approved_by_auth_user_id uuid null=YES
- approved_at timestamp with time zone null=YES
- created_at timestamp with time zone null=NO default=now()
- updated_at timestamp with time zone null=NO default=now()

### sales_order_items
- id uuid null=NO default=uuid_generate_v4()
- order_id uuid null=NO
- inventory_id uuid null=NO
- quantity integer null=NO
- unit_price numeric null=NO
- total_price numeric null=NO

### sales_orders
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- cashier_id uuid null=YES
- mechanic_id uuid null=YES
- customer_phone character varying null=YES
- subtotal numeric null=NO
- vat_amount numeric null=NO
- discount_amount numeric null=YES default=0.00
- total_amount numeric null=NO
- payment_method character varying null=NO
- mpesa_receipt_number character varying null=YES
- kra_vscu_signature text null=YES
- is_synced boolean null=YES default=true
- created_at timestamp with time zone null=YES default=now()
- order_status text null=NO default='completed'::text
- customer_id uuid null=YES

### sales_payments
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- order_id uuid null=NO
- payment_type text null=NO default='payment'::text
- payment_method text null=NO
- amount numeric null=NO
- status text null=NO default='settled'::text
- external_reference text null=YES
- recorded_by_auth_user_id uuid null=YES
- created_at timestamp with time zone null=NO default=now()

### sales_return_items
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- return_id uuid null=NO
- order_id uuid null=NO
- order_item_id uuid null=NO
- inventory_id uuid null=NO
- quantity integer null=NO
- unit_refund numeric null=NO
- created_at timestamp with time zone null=NO default=now()

### sales_returns
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=NO
- order_id uuid null=NO
- reason text null=NO
- status text null=NO default='pending'::text
- requested_by_auth_user_id uuid null=YES
- approved_by_auth_user_id uuid null=YES
- requested_at timestamp with time zone null=NO default=now()
- resolved_at timestamp with time zone null=YES

### suppliers
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- supplier_name text null=NO
- contact_name text null=YES
- phone_number text null=YES
- email text null=YES
- kra_pin text null=YES
- payment_terms text null=YES
- is_active boolean null=NO default=true
- created_at timestamp with time zone null=NO default=now()
- updated_at timestamp with time zone null=NO default=now()

### users
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- branch_id uuid null=YES
- full_name character varying null=NO
- email character varying null=NO
- phone_number character varying null=NO
- role character varying null=NO
- pin_code_hash character varying null=YES
- is_active boolean null=YES default=true
- created_at timestamp with time zone null=YES default=now()
- auth_user_id uuid null=YES

### whatsapp_messages
- id uuid null=NO default=uuid_generate_v4()
- thread_id uuid null=NO
- sender_type character varying null=NO
- message_body text null=NO
- media_url text null=YES
- sent_at timestamp with time zone null=YES default=now()

### whatsapp_threads
- id uuid null=NO default=uuid_generate_v4()
- organization_id uuid null=NO
- customer_phone character varying null=NO
- customer_name character varying null=YES
- status character varying null=YES default='Active'::character varying
- last_message_at timestamp with time zone null=YES default=now()
- customer_id uuid null=YES

## Public functions (30)
- audit_row_change()
- calculate_eod(p_organization_id uuid, p_branch_id uuid, p_date date)
- can_access_branch(p_organization_id uuid, p_branch_id uuid)
- capture_inventory_unit_cost()
- create_branch_transfer(p_organization_id uuid, p_source_branch_id uuid, p_destination_branch_id uuid, p_items jsonb)
- create_inventory_item(p_organization_id uuid, p_branch_id uuid, p_part_name text, p_part_number text, p_unit_cost numeric, p_retail_price numeric, p_category text DEFAULT NULL::text, p_compatible_models text[] DEFAULT NULL::text[], p_reorder_level integer DEFAULT 5)
- create_pos_sale(p_organization_id uuid, p_branch_id uuid, p_items jsonb, p_payments jsonb DEFAULT '[]'::jsonb, p_discount_amount numeric DEFAULT 0, p_vat_amount numeric DEFAULT 0, p_customer_phone text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid)
- create_purchase_order(p_organization_id uuid, p_branch_id uuid, p_supplier_id uuid, p_order_number text, p_items jsonb, p_notes text DEFAULT NULL::text)
- create_sales_return(p_order_id uuid, p_reason text, p_items jsonb)
- dispatch_branch_transfer(p_transfer_id uuid, p_rider_name text, p_rider_phone text, p_motorbike_number_plate text)
- enforce_return_refund_cap()
- get_current_org_id()
- get_current_organization_id()
- get_current_user_role(p_organization_id uuid)
- get_dashboard_summary(p_organization_id uuid, p_branch_id uuid, p_start_date date, p_end_date date)
- get_inventory_cost(p_organization_id uuid, p_branch_id uuid)
- has_any_org_membership()
- has_org_permission(p_organization_id uuid, p_permission text)
- is_org_member(p_organization_id uuid)
- post_goods_receipt(p_purchase_order_id uuid, p_receipt_reference text, p_items jsonb)
- post_inventory_movement(p_inventory_id uuid, p_movement_type text, p_quantity_delta integer, p_reference_type text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT '{}'::jsonb)
- receive_branch_transfer(p_transfer_id uuid)
- record_navigation_violation(p_organization_id uuid, p_requested_resource text, p_requested_action text DEFAULT 'view'::text)
- register_organization(p_name text, p_kra_pin text DEFAULT NULL::text, p_org_type text DEFAULT 'RETAIL'::text, p_subscription_tier text DEFAULT 'standard'::text, p_kra_compliance_enabled boolean DEFAULT false, p_payroll_compliance_enabled boolean DEFAULT false)
- reject_audit_log_mutation()
- resolve_branch_transfer(p_transfer_id uuid, p_approve boolean)
- resolve_purchase_order(p_purchase_order_id uuid, p_approve boolean)
- resolve_sales_return(p_return_id uuid, p_approve boolean, p_refund_method text DEFAULT 'cash'::text)
- rls_auto_enable()
- set_current_org_context(p_organization_id uuid)

## Definition: register_organization
```sql
CREATE OR REPLACE FUNCTION public.register_organization(p_name text, p_kra_pin text DEFAULT NULL::text, p_org_type text DEFAULT 'RETAIL'::text, p_subscription_tier text DEFAULT 'standard'::text, p_kra_compliance_enabled boolean DEFAULT false, p_payroll_compliance_enabled boolean DEFAULT false)
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
$function$

```

## Definition: create_pos_sale
```sql
CREATE OR REPLACE FUNCTION public.create_pos_sale(p_organization_id uuid, p_branch_id uuid, p_items jsonb, p_payments jsonb DEFAULT '[]'::jsonb, p_discount_amount numeric DEFAULT 0, p_vat_amount numeric DEFAULT 0, p_customer_phone text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_order_id uuid;
  v_cashier_id uuid;
  v_actor_id uuid;
  v_line jsonb;
  v_inventory_id uuid;
  v_quantity integer;
  v_price numeric(12,2);
  v_retail numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2);
  v_paid numeric(12,2) := 0;
  v_payment jsonb;
  v_payment_count integer := 0;
  v_distinct_methods integer;
  v_method text;
  v_role text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_org_permission(p_organization_id, 'manage_sales')
     OR NOT public.can_access_branch(p_organization_id, p_branch_id) THEN
    RAISE EXCEPTION 'not authorized to create a sale in this branch' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR jsonb_typeof(coalesce(p_payments, '[]'::jsonb)) <> 'array'
     OR coalesce(p_discount_amount, 0) < 0 OR coalesce(p_vat_amount, 0) < 0 THEN
    RAISE EXCEPTION 'invalid sale payload' USING ERRCODE = '22023';
  END IF;
  v_role := public.get_current_user_role(p_organization_id);
  IF coalesce(p_discount_amount, 0) > 0 AND v_role NOT IN ('owner','manager') THEN
    RAISE EXCEPTION 'only an owner or manager may apply a discount' USING ERRCODE = '42501';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_inventory_id := (v_line->>'inventory_id')::uuid;
    v_quantity := (v_line->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'sale quantity must be positive' USING ERRCODE = '22023';
    END IF;
    SELECT i.retail_price INTO v_retail
      FROM public.branch_inventory i
      WHERE i.id = v_inventory_id
        AND i.organization_id = p_organization_id
        AND i.branch_id = p_branch_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory item is not in the sale organization and branch' USING ERRCODE = '23503';
    END IF;
    v_price := coalesce((v_line->>'unit_price')::numeric, v_retail);
    IF v_price < 0 THEN
      RAISE EXCEPTION 'unit price cannot be negative' USING ERRCODE = '22023';
    END IF;
    IF v_price <> v_retail AND v_role NOT IN ('owner','manager') THEN
      RAISE EXCEPTION 'only an owner or manager may override retail price' USING ERRCODE = '42501';
    END IF;
    v_subtotal := v_subtotal + (v_price * v_quantity);
  END LOOP;
  v_total := round(v_subtotal + coalesce(p_vat_amount, 0) - coalesce(p_discount_amount, 0), 2);
  IF v_total < 0 THEN
    RAISE EXCEPTION 'sale total cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = p_customer_id AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'customer does not belong to the sale organization' USING ERRCODE = '23503';
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) LOOP
    IF (v_payment->>'amount') IS NULL OR (v_payment->>'amount')::numeric <= 0
       OR (v_payment->>'payment_method') NOT IN ('cash','mpesa','card','bank','credit') THEN
      RAISE EXCEPTION 'invalid payment entry' USING ERRCODE = '22023';
    END IF;
    v_paid := v_paid + (v_payment->>'amount')::numeric;
    v_payment_count := v_payment_count + 1;
  END LOOP;
  IF v_paid > v_total THEN
    RAISE EXCEPTION 'payments cannot exceed the sale total' USING ERRCODE = '23514';
  END IF;
  SELECT count(DISTINCT x.value->>'payment_method') INTO v_distinct_methods
    FROM jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) x(value);
  v_method := CASE WHEN v_payment_count = 0 THEN 'credit'
                   WHEN v_distinct_methods > 1 THEN 'split'
                   ELSE (p_payments->0->>'payment_method') END;

  SELECT u.id INTO v_cashier_id FROM public.users u
    WHERE u.organization_id = p_organization_id AND u.auth_user_id = auth.uid()
    LIMIT 1;
  INSERT INTO public.sales_orders (
    organization_id, branch_id, cashier_id, customer_id, customer_phone,
    subtotal, vat_amount, discount_amount, total_amount, payment_method,
    order_status, is_synced
  ) VALUES (
    p_organization_id, p_branch_id, v_cashier_id, p_customer_id, p_customer_phone,
    v_subtotal, coalesce(p_vat_amount, 0), coalesce(p_discount_amount, 0), v_total,
    v_method, CASE WHEN v_paid = v_total THEN 'completed' ELSE 'open' END, true
  ) RETURNING id INTO v_order_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_inventory_id := (v_line->>'inventory_id')::uuid;
    v_quantity := (v_line->>'quantity')::integer;
    SELECT i.retail_price INTO v_retail FROM public.branch_inventory i
      WHERE i.id = v_inventory_id AND i.organization_id = p_organization_id AND i.branch_id = p_branch_id;
    v_price := coalesce((v_line->>'unit_price')::numeric, v_retail);
    INSERT INTO public.sales_order_items (order_id, inventory_id, quantity, unit_price, total_price)
    VALUES (v_order_id, v_inventory_id, v_quantity, v_price, round(v_price * v_quantity, 2));
    PERFORM public.post_inventory_movement(v_inventory_id, 'sale', -v_quantity,
      'sales_order', v_order_id, jsonb_build_object('order_id', v_order_id));
  END LOOP;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) LOOP
    INSERT INTO public.sales_payments (
      organization_id, branch_id, order_id, payment_type, payment_method,
      amount, status, external_reference, recorded_by_auth_user_id
    ) VALUES (
      p_organization_id, p_branch_id, v_order_id, 'payment',
      v_payment->>'payment_method', (v_payment->>'amount')::numeric,
      'settled', nullif(v_payment->>'external_reference',''), auth.uid()
    );
  END LOOP;

  SELECT u.id INTO v_actor_id FROM public.users u
    WHERE u.organization_id = p_organization_id AND u.auth_user_id = auth.uid()
    LIMIT 1;
  INSERT INTO public.audit_logs (organization_id, user_id, action_type, details)
  VALUES (p_organization_id, v_actor_id, 'sale_created',
          jsonb_build_object('order_id', v_order_id, 'subtotal', v_subtotal,
                             'vat_amount', p_vat_amount, 'discount_amount', p_discount_amount,
                             'total_amount', v_total, 'paid_amount', v_paid));
  RETURN v_order_id;
END
$function$

```

## Storage buckets (0)

## Public views (0): none

## Findings summary (release-manager, 2026-11-19)

Authoritative column-level facts below supersede H03's table list where they differ (contradiction C-014 logged in HANDOVER/06).

1. **Ledger absent.** No accounts/journal_entries/journal_lines tables and no ledger posting functions exist live. H04's "ledger objects/RPC functions exist" is inaccurate. REQ-043 (ledger-first) requires building the double-entry ledger from scratch. `calculate_eod` and `get_dashboard_summary` exist but compute from sales/expenses tables, not a ledger.
2. **sales_orders offline fields absent.** No client UUID, idempotency key, device ID, or sequence columns. `is_synced boolean default true` and `mpesa_receipt_number` exist (reference capture supported). Cashier attribution via `cashier_id`; `mechanic_id` column exists (unused in Phase 1 per D-023).
3. **branch_inventory** has no barcode column and no price-version linkage; `compatible_models text[]` already exists (use for Phase 1 bike-model search per D-022 — no new free-text column needed); `unit_cost`/`retail_price` numeric; `stock_quantity` integer.
4. **customers** already has consent columns: `whatsapp_consent`, `marketing_consent`, `consent_recorded_at`, `consent_source` (partial Consent Record). No credit-balance column (display-only balance must be derived from payments/credit notes per D-023, or added as derived view).
5. **daily_expenses**: `category` is free varchar (no category table), no payment-method column, no receipt-image column; storage buckets: 0.
6. **eod_reconciliations** covers closing totals incl. `cash_expected/cash_counted/variance` and `is_approved`, but no opening float, no drawer-session lifecycle, no per-session movement accumulation (REQ-033 needs Cash Session entities).
7. **organization_memberships** keys on `auth_user_id` directly (not users.id); role text + status; NO approval-limit or cost-visibility attributes (REQ-004/036 need them).
8. **organizations** lacks business-profile fields (location, contacts, operating hours, currency, language, timezone); `register_organization(p_name, p_kra_pin, p_org_type, p_subscription_tier, p_kra_compliance_enabled, p_payroll_compliance_enabled)` — REQ-003 profile capture needs RPC/column extension.
9. **Returns workflow partially exists at DB layer**: `create_sales_return`, `resolve_sales_return(p_return_id, p_approve, p_refund_method)`, `enforce_return_refund_cap()` + sales_returns/sales_return_items tables. API/UI workflow unverified.
10. **Missing entities (must be designed/migrated):** Device, Feature Flag, Idempotency Key, Sync Queue/Conflict Record, Reservation, Price List/Price Version, Receipt/Receipt Sequence, Credit Note, Cash Session/Count, Approval Request, Discount Rule, Notification service tables, Location (Phase 2), Product/SKU master (Phase 2 per D-021).
11. Existing protected RPCs to preserve/extend (never rewrite verified behaviour): create_pos_sale, create_inventory_item, post_inventory_movement, post_goods_receipt, create/resolve_purchase_order, create/resolve/dispatch/receive_branch_transfer, calculate_eod, get_dashboard_summary, get_inventory_cost, register_organization, RBAC helpers, audit triggers.