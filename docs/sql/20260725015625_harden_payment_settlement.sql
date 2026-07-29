-- Applied to Supabase as migration 20260725015625_harden_payment_settlement.
--
-- ── Payment settlement hardening ────────────────────────────────────────────
-- Settlement invariant enforced below:
--   one CheckoutRequestID + one query-confirmed success + the expected amount
--   + one unique receipt = exactly one balance increment.
--
-- Safe to apply destructively: app_config.payments_live is false and every
-- existing payments row is 'failed', so there is no live traffic and no
-- successful settlement to migrate.

-- 1. Reconciliation state machine vocabulary.
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending','reconciling','paid','failed','expired','manual_review'));

-- 2. Money compared against money, never against credits. Exact numeric, not float.
alter table public.payments rename column amount_kes to expected_amount_kes;
alter table public.payments rename constraint payments_amount_kes_check
  to payments_expected_amount_kes_check;
alter table public.payments alter column expected_amount_kes type numeric(12,2);
alter table public.payments add column if not exists reported_amount_kes numeric(12,2);
alter table public.payments add constraint payments_reported_amount_kes_check
  check (reported_amount_kes is null or reported_amount_kes > 0);

-- 3. Reconciliation bookkeeping.
alter table public.payments add column if not exists expires_at timestamptz;
alter table public.payments add column if not exists callback_payload jsonb;
alter table public.payments add column if not exists reconcile_attempts integer not null default 0;
alter table public.payments add column if not exists last_reconcile_at timestamptz;

-- 4. A receipt may back exactly one payment. Normalized so casing or stray
--    whitespace cannot smuggle the same receipt in twice.
create unique index if not exists payments_mpesa_receipt_unique
  on public.payments (upper(btrim(mpesa_receipt)))
  where mpesa_receipt is not null and btrim(mpesa_receipt) <> '';

-- 5. Callback intake. Records what Safaricom reported and hands the row to the
--    reconciler. Creates no value: a success moves pending -> reconciling only.
create or replace function public.record_payment_callback(
  p_checkout_request_id text,
  p_success boolean,
  p_receipt text,
  p_reported_amount_kes numeric,
  p_merchant_request_id text,
  p_result_desc text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
DECLARE
  v_payment public.payments%ROWTYPE;
BEGIN
  -- Compare-and-set on status makes Daraja's aggressive retries idempotent:
  -- the second delivery of the same callback matches zero rows.
  UPDATE public.payments
     SET status              = CASE WHEN p_success THEN 'reconciling' ELSE 'failed' END,
         mpesa_receipt       = nullif(btrim(coalesce(p_receipt, '')), ''),
         reported_amount_kes = p_reported_amount_kes,
         result_desc         = p_result_desc,
         callback_payload    = p_payload,
         merchant_request_id = coalesce(merchant_request_id, p_merchant_request_id),
         completed_at        = CASE WHEN p_success THEN null ELSE now() END
   WHERE checkout_request_id = p_checkout_request_id
     AND status = 'pending'
  RETURNING * INTO v_payment;

  IF v_payment.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', v_payment.status, 'payment_id', v_payment.id);
EXCEPTION WHEN unique_violation THEN
  -- The receipt already backs another payment. Never silently absorb this.
  RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_receipt');
END;
$fn$;

-- 6. Settlement. The only place credits are created. Called by the reconciler
--    AFTER an independent Daraja status query, never straight from a callback.
create or replace function public.complete_payment(
  p_checkout_request_id text,
  p_success boolean,
  p_receipt text,
  p_reported_amount_kes numeric,
  p_result_desc text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_receipt text := nullif(btrim(coalesce(p_receipt, '')), '');
BEGIN
  SELECT * INTO v_payment
    FROM public.payments
   WHERE checkout_request_id = p_checkout_request_id
     FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_payment.status IN ('paid','failed','expired') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_settled', 'status', v_payment.status);
  END IF;

  IF NOT p_success THEN
    -- Only a row that never received a successful callback may be failed
    -- outright. A row already carrying a success callback that the query now
    -- calls failed is contradictory; a human decides, not this function.
    IF v_payment.status = 'pending' THEN
      UPDATE public.payments
         SET status = 'failed', result_desc = p_result_desc, completed_at = now()
       WHERE id = v_payment.id AND status = 'pending';
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'contradicts_callback');
  END IF;

  -- ── Success path. Every condition holds before any value is created. ──
  -- Query-confirmed success alone is not enough: Safaricom's query endpoint
  -- returns no amount and no receipt, so only a row that already absorbed a
  -- success callback ('reconciling') carries the facts we must check.
  IF v_payment.status <> 'reconciling' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_callback_facts');
  END IF;

  IF v_receipt IS NULL
     OR v_payment.mpesa_receipt IS NULL
     OR upper(btrim(v_payment.mpesa_receipt)) <> upper(v_receipt) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receipt_missing_or_mismatched');
  END IF;

  IF p_reported_amount_kes IS NULL
     OR v_payment.reported_amount_kes IS NULL
     OR p_reported_amount_kes <> v_payment.reported_amount_kes THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reported_amount_mismatch');
  END IF;

  IF v_payment.reported_amount_kes <> v_payment.expected_amount_kes THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
     WHERE id <> v_payment.id
       AND mpesa_receipt IS NOT NULL
       AND upper(btrim(mpesa_receipt)) = upper(v_receipt)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receipt_already_used');
  END IF;

  UPDATE public.payments
     SET status = 'paid', result_desc = p_result_desc, completed_at = now()
   WHERE id = v_payment.id AND status = 'reconciling';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_settled');
  END IF;

  UPDATE public.profiles
     SET credits = credits + v_payment.credits
   WHERE id = v_payment.user_id;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'paid',
    'payment_id', v_payment.id, 'credits', v_payment.credits
  );
END;
$fn$;

-- 7. Neither function is reachable from a client role. New functions are
--    PUBLIC EXECUTE by default, so the revoke is load-bearing.
revoke all on function public.record_payment_callback(text, boolean, text, numeric, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_payment_callback(text, boolean, text, numeric, text, text, jsonb)
  to service_role;

revoke all on function public.complete_payment(text, boolean, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.complete_payment(text, boolean, text, numeric, text)
  to service_role;

-- 8. Drop the superseded signature explicitly; otherwise it survives as an
--    overload and the old credit-from-callback path stays callable.
drop function if exists public.complete_payment(text, boolean, text, text);
