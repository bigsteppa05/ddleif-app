-- Applied to Supabase as migration 20260729220000_review_env_tooling.
--
-- ── App Store reviewer environment: re-scope helper + pre-submit check ───────
--
-- Why this exists. The reviewer environment is single-use by construction:
-- `events_visible_to_user_id_fkey` is ON DELETE SET NULL, and the review script
-- asks the reviewer to delete their own account to demonstrate Guideline
-- 5.1.1(v). That deletion wipes the account AND silently nulls the demo event's
-- `visible_to_user_id`. Because `events_select_visible` admits a review_only row
-- only when `visible_to_user_id = auth.uid()`, the event then becomes invisible
-- to every non-admin — so the next reviewer sees no login and an empty feed.
--
-- The FK behaviour is deliberately left alone: a CHECK forbidding a NULL owner
-- on a review_only row would make account deletion fail, and in-app deletion is
-- itself an App Store requirement. So the fix is procedural, not structural —
-- re-scope before every submission, and assert it rather than assume it.
--
-- Both functions are admin tooling: EXECUTE is revoked from anon/authenticated
-- so they are not reachable through the PostgREST API, and both run SECURITY
-- INVOKER. Invoker rights are required, not merely preferred — Postgres refuses
-- `set_config('role', ...)` inside a security-definer function ("cannot set
-- parameter role within security-definer function"), and the RLS probes in
-- review_env_check() depend on that role switch. Invoker rights also mean these
-- add no privilege-escalation surface: they can do nothing the calling session
-- could not already do.

-- ── 1. Re-scope the demo event onto the current reviewer account ─────────────
create or replace function public.scope_review_event(
  p_email text,
  p_slug  text
)
returns table (event_id uuid, reviewer_id uuid, detail text)
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid;
  v_event_id uuid;
begin
  select u.id into v_uid from auth.users u where lower(u.email) = lower(p_email);
  if v_uid is null then
    raise exception
      'No auth user with email %. Create the reviewer account first (Dashboard -> Authentication -> Users), then re-run.', p_email
      using errcode = 'no_data_found';
  end if;

  select e.id into v_event_id from public.events e where e.slug = p_slug;
  if v_event_id is null then
    raise exception 'No event with slug %.', p_slug using errcode = 'no_data_found';
  end if;

  -- An admin reviewer would see the event through the policy's is_admin branch
  -- regardless of scoping, which would hide a broken scope from every check
  -- below. Refuse rather than produce a false green.
  if exists (select 1 from public.profiles p where p.id = v_uid and p.is_admin) then
    raise exception
      'Reviewer % is an admin; admins bypass events_select_visible, so scoping cannot be verified. Use a non-admin account.', p_email
      using errcode = 'raise_exception';
  end if;

  update public.events
     set visibility = 'review_only',
         visible_to_user_id = v_uid
   where id = v_event_id;

  return query select v_event_id, v_uid,
    format('Event %s scoped to %s (review_only).', p_slug, p_email);
end;
$$;

revoke all on function public.scope_review_event(text, text) from public, anon, authenticated;

comment on function public.scope_review_event(text, text) is
  'Re-points the App Store demo event at the current reviewer account. Run before every submission and resubmission.';

-- ── 2. Pre-submit check: assert the reviewer can actually complete the flow ──
-- Read-only. Returns one row per assertion; any FAIL means do not submit.
--
-- The three rls_* probes switch into the real API roles inside the transaction,
-- because the owner of this function has BYPASSRLS — evaluating the policy as
-- postgres would pass no matter how the row is scoped. Probing as `authenticated`
-- with a forged `sub` claim is what the client actually experiences.
create or replace function public.review_env_check(
  p_email text,
  p_slug  text
)
returns table (check_name text, status text, detail text)
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_restore_role text := current_user;
  v_uid uuid;
  v_confirmed boolean;
  v_providers text;
  v_has_profile boolean := false;
  v_credits integer;
  v_is_admin boolean;
  v_open_bookings integer;
  v_event_id uuid;
  v_visibility text;
  v_owner uuid;
  v_date timestamptz;
  v_cost integer;
  v_slots integer;
  v_booked integer;
  v_cnt integer;
begin
  select u.id, u.email_confirmed_at is not null, u.raw_app_meta_data->>'providers'
    into v_uid, v_confirmed, v_providers
    from auth.users u where lower(u.email) = lower(p_email);

  if v_uid is null then
    return query select 'reviewer_account'::text, 'FAIL'::text,
      format('No auth user with email %s. Create it, then run scope_review_event().', p_email);
    return;  -- every remaining assertion depends on the account
  end if;

  return query select 'reviewer_account'::text, 'PASS'::text, format('%s (%s)', p_email, v_uid);

  return query select 'reviewer_email_confirmed'::text,
    case when v_confirmed then 'PASS' else 'FAIL' end::text,
    case when v_confirmed then 'Confirmed.'
         else 'email_confirmed_at is null — an unconfirmed account may be blocked at sign-in.' end::text;

  -- login.tsx uses signInWithPassword; without the email provider the reviewer
  -- would be pushed to an OTP the review team cannot receive.
  return query select 'reviewer_password_login'::text,
    case when v_providers like '%email%' then 'PASS' else 'FAIL' end::text,
    format('providers = %s (need "email" so signInWithPassword works, no OTP).', coalesce(v_providers, 'null'));

  select true, p.credits, p.is_admin into v_has_profile, v_credits, v_is_admin
    from public.profiles p where p.id = v_uid;

  return query select 'reviewer_profile'::text,
    case when v_has_profile then 'PASS' else 'FAIL' end::text,
    case when v_has_profile then 'Profile row present.'
         else 'No public.profiles row — the app will have no credits or name to read.' end::text;

  return query select 'reviewer_not_admin'::text,
    case when coalesce(v_is_admin, false) then 'FAIL' else 'PASS' end::text,
    case when coalesce(v_is_admin, false)
         then 'Reviewer is_admin = true; admins bypass events_select_visible, so a broken scope would still look fine here.'
         else 'Non-admin, so visibility is genuinely exercised.' end::text;

  select e.id, e.visibility, e.visible_to_user_id, e.date, e.cost_in_credits,
         e.slots_available, e.slots_booked
    into v_event_id, v_visibility, v_owner, v_date, v_cost, v_slots, v_booked
    from public.events e where e.slug = p_slug;

  if v_event_id is null then
    return query select 'event_exists'::text, 'FAIL'::text,
      format('No event with slug %s.', p_slug);
    return;
  end if;

  return query select 'event_exists'::text, 'PASS'::text, format('%s (%s)', p_slug, v_event_id);

  return query select 'event_visibility'::text,
    case when v_visibility = 'review_only' then 'PASS' else 'FAIL' end::text,
    format('visibility = %s (want review_only so it stays out of the public feed).', v_visibility);

  return query select 'event_scoped_to_reviewer'::text,
    case when v_owner = v_uid then 'PASS'
         when v_owner is null then 'FAIL'
         else 'FAIL' end::text,
    case when v_owner = v_uid then 'visible_to_user_id matches the reviewer.'
         when v_owner is null then 'visible_to_user_id is NULL — likely a previous reviewer deletion. Run scope_review_event().'
         else format('visible_to_user_id = %s, a different user. Run scope_review_event().', v_owner) end::text;

  return query select 'event_in_future'::text,
    case when v_date < now() then 'FAIL'
         when v_date < now() + interval '7 days' then 'WARN'
         else 'PASS' end::text,
    format('Starts %s (%s). Review plus a possible resubmit can span two weeks.',
           to_char(v_date, 'YYYY-MM-DD'), age(v_date, now()));

  return query select 'event_has_slots'::text,
    case when v_booked < v_slots then 'PASS' else 'FAIL' end::text,
    format('%s of %s slots taken.', v_booked, v_slots);

  return query select 'reviewer_credits'::text,
    case when coalesce(v_credits, 0) >= v_cost * 2 then 'PASS'
         when coalesce(v_credits, 0) >= v_cost then 'WARN'
         else 'FAIL' end::text,
    format('%s credits, event costs %s. Want >= %s so the reviewer can book, cancel, and book again.',
           coalesce(v_credits, 0), v_cost, v_cost * 2);

  select count(*) into v_open_bookings
    from public.bookings b
   where b.user_id = v_uid and b.status in ('confirmed', 'checked_in');

  return query select 'reviewer_starts_clean'::text,
    case when v_open_bookings = 0 then 'PASS' else 'WARN' end::text,
    format('%s active booking(s) already on the account; the reviewer should start from an unbooked state.', v_open_bookings);

  -- ── RLS probes, as the roles the client actually uses ──────────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cnt from public.events where slug = p_slug;
  perform set_config('role', v_restore_role, true);

  return query select 'rls_visible_to_reviewer'::text,
    case when v_cnt = 1 then 'PASS' else 'FAIL' end::text,
    format('Reviewer sees %s row(s) through events_select_visible; want exactly 1.', v_cnt);

  -- A random signed-in user must not see it, or the "not publicly listed" claim
  -- in the review notes is false.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', '00000000-0000-0000-0000-000000000000',
                                       'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cnt from public.events where slug = p_slug;
  perform set_config('role', v_restore_role, true);

  return query select 'rls_hidden_from_stranger'::text,
    case when v_cnt = 0 then 'PASS' else 'FAIL' end::text,
    format('Another signed-in user sees %s row(s); want 0.', v_cnt);

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from public.events where slug = p_slug;
  perform set_config('role', v_restore_role, true);

  return query select 'rls_hidden_from_anon'::text,
    case when v_cnt = 0 then 'PASS' else 'FAIL' end::text,
    format('Anonymous (web/SEO) reads see %s row(s); want 0.', v_cnt);
end;
$$;

revoke all on function public.review_env_check(text, text) from public, anon, authenticated;

comment on function public.review_env_check(text, text) is
  'Pre-submit assertion of the App Store reviewer environment. Any FAIL means do not submit.';
