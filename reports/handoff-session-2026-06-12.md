# Session Handoff — fitXball (ddleif-app-main) — 2026-06-12

> **INSTRUCTION TO CLAUDE:** You are resuming work on this project from a previous session.
> Read this file fully, then read `CLAUDE.md` at the repo root. Do NOT re-explore the codebase,
> re-verify completed items, or re-run the checks listed below unless a task requires it —
> everything here was verified working at handoff time. When you have absorbed this file, reply
> with exactly:
>
> *"Caught up on the 2026-06-12 handoff. State: desktop web revamp complete, auth + OTP working,
> Daraja STK push deployed and sandbox-tested. Top pending items: flip DEV_BYPASS_AUTH, lock down
> anon RPC grants, move Daraja creds to secrets. What should I work on?"*
>
> …then wait for direction. Do not start any pending item unprompted.

---

## What this project is
Expo (React Native) + Supabase sports-booking app for Nairobi ("fitXball" brand — say
**participants**, never "members"; ignore "member perks" in CLAUDE.md). Expo Router, TypeScript
strict, web + iOS + Android from one codebase. Working dir: `/Users/habib/Downloads/ddleif-app-main`.

## Infrastructure facts
- **Supabase project ref:** `jnjpivplulsfystxinvd` (MCP server configured in `.mcp.json`)
- **Dev server:** `npx expo start --web` on port 8081 (often already running — check before starting)
- **Type check:** `npx tsc --noEmit` — was clean at handoff; keep it clean
- **chrome-devtools MCP** in `.mcp.json` (local build at `/Users/habib/Downloads/chrome-devtools-mcp`) — use it to visually verify web changes at 1440/1024/390 widths
- **Admin email:** `habibmohamed94004@gmail.com` (in `.env` as `EXPO_PUBLIC_ADMIN_EMAIL`)
- **Auth email:** Brevo SMTP via `support@fitxball.com` (Namecheap Private Email DNS). **OTP is 8 digits** — matches `CODE_LENGTH = 8` in `app/(auth)/verify.tsx`. If auth logs show `535 5.7.8`, the Brevo SMTP key is the suspect. OTP login confirmed working end-to-end.

## Completed (do not redo)
1. **Desktop web revamp — all 24 design screens done** (design handoff at
   `/Users/habib/Downloads/fitXball-source/design_handoff_fitxball_web/`). Pattern: each route keeps
   its mobile layout and adds an `if (isDesktop)` branch via `useIsDesktopWeb()` (breakpoint 1024,
   `components/web/kit.tsx`). Shared kit: `FW` tokens, `WBtn/WGhostBtn/WTag/WChip/WAvatar/StatBlock/
   PageTitle/Sidebar/WebShell/AuthShell`, `WebScanner` (webcam QR + manual check-in + scan feed).
2. **Server-side booking verification**: `booking_ref`/`checked_in_at` columns, `book_event` /
   `verify_booking` / `check_in_booking` RPCs deployed and wired into scanner, ref-list, ticket.
3. **Responsive pass**: phone/tablet fall back to mobile layouts (by design); admin overview table
   hides Venue column under 1280px (`showVenue` in `app/admin/index.tsx`).
4. **Event hero images**: web file-input picker + native gallery picker in `app/admin/add-event.tsx`
   (form shared with edit-event). `uploadEventImage(uri, eventId)` throws on failure, stores under
   `event-images/{eventId}/`, `deleteEventImage` cleans up replaced files. Event ids are generated
   client-side (uuid4) in add-event so images can be foldered pre-insert.
5. **Button audit**: every rendered button has a working handler. Admin overview "Scan Entry" now
   targets the next upcoming event.
6. **Daraja M-Pesa STK push — deployed & sandbox-tested end-to-end:**
   - `payments` table (RLS: users SELECT own rows only; only service role writes)
   - Edge Fn `mpesa-stk-push` (JWT required): OAuth → STK push → insert pending payment
   - Edge Fn `mpesa-callback` (public webhook, always returns 200): calls `complete_payment()`
   - SQL fn `complete_payment` — atomic settle + credit grant, idempotent via `status='pending'`
     guard, EXECUTE revoked from anon/authenticated
   - Client: `app/credits/topup.tsx` — phone field (prefilled from profile), invoke + poll every 3s,
     button states Sending… → Waiting for M-Pesa PIN… → Paid ✓
   - Verified: OAuth ✓, STK accepted ✓, callback received ✓, credits granted ✓, replay-idempotent ✓
   - **Sandbox test number:** `254708374149` (auto-completes, no PIN needed)

## Pending — top priorities
1. **Flip `DEV_BYPASS_AUTH` to `false`** in `constants/dev.ts` (or delete the file + its two usages
   in `app/index.tsx` and `app/admin/_layout.tsx`). It bypasses auth guards for UI testing.
2. **Lock down anon RPC grants**: `book_event`, `verify_booking`, `check_in_booking` are executable
   by `anon`/PUBLIC (proven exploitable — anon can check in bookings). REVOKE from PUBLIC/anon,
   keep authenticated; ideally make verify/check-in admin-only inside the function (check
   `profiles.is_admin` via `auth.uid()`). Model after `complete_payment`'s grants.
3. **Daraja production hardening**: move creds out of `mpesa-stk-push` source into function secrets
   (`DARAJA_CONSUMER_KEY/SECRET/SHORTCODE/PASSKEY`, `DARAJA_BASE_URL=https://api.safaricom.co.ke`).
   Sandbox creds are currently inline fallbacks (user-provided, sandbox-only).

## Pending — backlog (not started)
- Wire `app/credits/history.tsx` to the new `payments` table (currently "coming soon" placeholder)
- Card payment method (stub toast)
- Design-spec buttons never built: ticket Download/Add-to-Calendar, confirmed-screen
  Add-to-Calendar/Invite Friends, history Export CSV, sold-out "Notify me" waitlist
- Profile Language picker ("Coming soon" placeholder)
- Optional: nicer tablet layout 600–1023px (2-col cards) — currently mobile-stretched by design
- Event upload failure UX uses `window.alert` on web — fine, but a styled toast would match the app

## Work checklist (proceed in this order)

### Phase 1 — Security & cleanup (do first, ~small)
- [x] 1. Flip `DEV_BYPASS_AUTH` to `false` in `constants/dev.ts`; verify guards: visiting `/admin`
      and `/(tabs)` signed-out must redirect to login/welcome
      *(done 2026-06-12 — guard centralized in `app/_layout.tsx` via `Stack.Protected`; now also
      covers deep links to `/book`, `/credits/*`, `/booking/*`, `/event/*`, `/profile/edit`)*
- [x] 2. Lock down RPC grants via migration: `REVOKE EXECUTE … FROM PUBLIC, anon` on `book_event`,
      `verify_booking`, `check_in_booking` (keep `authenticated`); add `profiles.is_admin` check
      inside `verify_booking`/`check_in_booking`; verify anon call now fails
      *(done — migration `lock_down_booking_rpc_grants`. Also: `book_event` now enforces
      `p_user_id = auth.uid()`; admin guards use `COALESCE(…, false)` (the old `IF NOT (NULL)`
      let anon through); `update_credits` RPC revoked to service-role-only and its dead client
      helper `updateCredits` removed from `lib/supabase.ts`)*
- [ ] 3. Move Daraja creds to Edge Function secrets (`supabase secrets set DARAJA_CONSUMER_KEY=…`
      etc.), strip inline fallbacks from `mpesa-stk-push`, redeploy, re-test with sandbox number
      **(BLOCKED: local `supabase` CLI is logged into a different account — `supabase projects list`
      shows only `ammyvmjqakrxpmnmnaad`, not this project — and the dashboard session in the
      chrome-devtools browser is signed out. Hardened source ready at
      `supabase/functions/mpesa-stk-push/index.ts` (fallbacks stripped, fails fast on missing env).
      Once the user runs `supabase login` (or sets the 5 secrets in the dashboard), set
      `DARAJA_BASE_URL=https://sandbox.safaricom.co.ke` + the 4 sandbox creds, then deploy.)**
- [x] 4. Run `mcp supabase get_advisors` (security) and triage anything new
      *(done — migration `advisor_fixes_triggers_and_search_path`: dropped the `auto_confirm_user`
      trigger on `auth.users` (it bypassed email verification; verifyOtp confirms emails itself),
      revoked client EXECUTE on trigger fn `handle_new_user`, pinned `search_path` on all
      SECURITY DEFINER fns. Remaining advisor warnings are intentional (authenticated-callable
      RPCs) plus "leaked password protection disabled" — dashboard-only toggle, low priority for
      an OTP-only app.)*

### Phase 2 — Payments completion
- [x] 5. Wire `app/credits/history.tsx` to the `payments` table (top-ups: `+N` lime; map to the
      design's ledger rows; filters All/Top-ups can come later)
      *(done — desktop: single merged ledger (bookings −N / top-ups +N lime, receipt in subtitle)
      per the design's `WebHistory`; mobile: "Purchases" section now lists top-ups. New helper
      `getUserPayments()` in `lib/supabase.ts` returns `status='success'` rows only.)*
- [x] 6. Refresh the user's credit balance in UI after successful top-up (sidebar credits card +
      profile) without requiring navigation
      *(done — tiny pub/sub `lib/credits.ts`; top-up poll success calls `notifyCreditsChanged()`,
      `WebShell` re-fetches the profile on that event. Profile tab already refetches on focus.)*
- [ ] 7. End-to-end sandbox test as a signed-in user on web: pay with `254708374149`, watch button
      states, confirm credits appear
      **(BLOCKED on a signed-in session: needs an 8-digit OTP from the login email, no inbox
      access from this session. Also visually verifies items 5–6 and the signed-in side of the
      new root auth guard — do this first thing once someone can log in. `tsc` is clean.)**

### Phase 3 — Feature backlog (pick per session)
- [ ] 8. Sold-out "Notify me if a slot opens" (needs a `waitlist` table + notification hook)
- [ ] 9. Ticket actions: Download (render QR card to image) + Add to Calendar (ics / calendar URL)
- [ ] 10. History "Export CSV" button (web: build CSV client-side, trigger download)
- [ ] 11. Card payment method (or hide the Card option until built)
- [ ] 12. Profile Language picker or remove the row

### Phase 4 — Release prep
- [ ] 13. `npx tsc --noEmit` clean + click-through of booking flow (book → confirmed → ticket →
      admin scan → check-in) on web and one native platform
- [ ] 14. Production Daraja: real shortcode/passkey, `DARAJA_BASE_URL=https://api.safaricom.co.ke`,
      callback URL reachable, small real-money test
- [ ] 15. Delete `constants/dev.ts` entirely; commit; build via `eas.json` profiles

## Conventions / gotchas learned this project
- RN `Alert.alert` is a **no-op on web** — use `window.alert` or the `notify()` helpers in
  add-event/edit-event for anything admins must see
- Web-only CSS props (`outlineStyle`) can't live in `StyleSheet.create` — inline with `as any`
- "Tables" are flex rows: fixed-width cells starve `flex:1` cells when space runs out — that's why
  Venue hides under 1280px; remember when adding columns
- Sidebar active-state matches exact path or `path + '/'` boundary (don't regress `/book` vs `/bookings`)
- `formatDateTime` from `lib/events.ts` for all user-facing dates — never raw ISO
- Keep memory dir updated (`~/.claude/.../memory/`) — brand terminology + email/auth setup live there
