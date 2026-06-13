# Plan: Password auth, required phone + SMS consent, cookie banner

## Context

The app is OTP-only today: every sign-in emails an 8-digit code via Brevo's free SMTP tier, which both burns the email quota on routine logins and makes email delivery a single point of failure. The owner wants: (a) password signup/sign-in as options (email still verified **once** at signup via the existing OTP code), (b) phone numbers **required** at registration — collected, not SMS-verified — for future SMS marketing, with an **unticked** consent checkbox (Kenya DPA 2019 opt-in), and (c) a simple Accept/Decline cookie banner on web, persisted, gating any future analytics. Number export: later (queryable in Supabase anytime).

Key discovery: `register.tsx` already contains **dormant password machinery** — `password` state, `pwReqs`/`pwValid` (8+ chars, uppercase, number), `passwordVisible`, an unused `ReqRow` checklist component (line 669), `emailTaken` state with already-built "Sign in instead" UI (lines 586–595), and `handleNext` step-0 branches that reference `pwValid`/`phoneValid` (lines 212–217). The dormant `forgot.tsx`/`reset-password.tsx`/`check-inbox.tsx` screens + the `PASSWORD_RECOVERY` handler also exist. This is mostly re-enabling and wiring, not greenfield.

**Recovery flow decision: OTP-code-based** (`verifyOtp({ type: 'recovery' })`), not email links — no deep-link/redirect-URL config on any platform, one template style ({{ .Token }}), same `OtpInput` UX users already know. `check-inbox.tsx` becomes unreachable and is deleted.

## Changes

### 1. DB migration + types
- MCP `apply_migration` (`add_sms_marketing_consent`):
  `alter table public.profiles add column if not exists sms_marketing_consent boolean not null default false;`
- [lib/supabase.ts](../lib/supabase.ts) `Profile` type (lines 31–50): add `sms_marketing_consent: boolean;`. `updateProfile` takes `Partial<Profile>` — no change.

### 2. Register wizard — `app/(auth)/register.tsx`
Step components are shared by desktop (`AuthShell`) and mobile branches; one change covers both.
- **Step 0**: add Password field below Email (reuse dormant `password`/`passwordVisible`/`pwReqs` state + render `ReqRow` checklist + eye toggle). `step0Valid = emailValid && !emailTaken && pwValid` (line 97 currently omits `pwValid`). Copy: "we'll send an 8-digit code to verify your email."
- **`handleNext` step 0** (line ~225): replace `signInWithOtp` with `supabase.auth.signUp({ email, password })`. Existing-email detection: with Confirm-email ON, `signUp` for a registered email returns `data.user.identities.length === 0` → `setEmailTaken(true)` (activates the existing "Sign in instead" UI). Keep the resend countdown.
- **Step 1 (OTP)**: keep `verifyOtp({ email, token, type: 'email' })` (line ~355 — works for signup confirmation tokens in supabase-js v2). Change resend to `supabase.auth.resend({ type: 'signup', email })`. Fix title "Verify your number" → "Verify your email".
- **Step 2 (profile)**: phone **required** — drop "(optional)" label; tighten validation to Kenyan mobile: strip non-digits + leading `0`, require `/^[17]\d{8}$/`; add `phoneValid` to `step2Valid` (line 99) and render `errors.phone` under the field. Fixes existing bug: `+254${phone.replace(/\D/g,'')}` double-prefixes numbers typed as `07…` (line 291) — normalize to `+254` + 9 digits.
- **SMS consent checkbox** below phone: new `smsConsent` state (default false), `TouchableOpacity` row with `Ionicons checkbox/square-outline`, label "Send me event updates & offers via SMS". Not required to proceed.
- **`handleFinish`** (line ~283): upsert normalized `phone` + `sms_marketing_consent: smsConsent`.
- No root-guard change needed: `signUp` returns no session until `verifyOtp` fires SIGNED_IN on `/register`, which `app/_layout.tsx` already excludes from the redirect.

### 3. Login — `app/(auth)/login.tsx` (both branches)
- `mode: 'password' | 'otp'` state, default `'password'`: Email + Password + Sign In → `signInWithPassword`. Success: do nothing (root SIGNED_IN handler routes). On `Invalid login credentials`: friendly error pointing legacy OTP-only users at "Email me a code instead" or password reset.
- Links: **"Forgot password?"** → `/(auth)/forgot`; **"Email me a code instead"** ↔ toggles to the existing OTP path (`handleSendCode` → `verify.tsx`, unchanged); "Use a password instead" toggles back.
- Social buttons unchanged. Fix "6-digit" → "8-digit" copy (CODE_LENGTH is 8).

### 4. Forgot-password flow (code-based)
- [forgot.tsx](../app/(auth)/forgot.tsx): two stages on one route. Stage `email`: existing form, **drop `redirectTo`** (line 38), then show stage `code` (no navigation). Stage `code`: `OtpInput` length 8 + 60s resend, `verifyOtp({ email, token, type: 'recovery' })` → `router.replace('/(auth)/reset-password')`.
- [app/_layout.tsx](../app/_layout.tsx) SIGNED_IN exclusion (~line 45): also skip when pathname includes `'forgot'` — recovery verification creates a session and would otherwise bounce to tabs mid-flow. Keep the `PASSWORD_RECOVERY` branch as a harmless fallback.
- [reset-password.tsx](../app/(auth)/reset-password.tsx): success path uses `Alert.alert` (no-op on web, line 64) — replace with inline success + `router.replace('/(tabs)')` (user holds a valid session at that point).
- Delete `check-inbox.tsx` + its `Stack.Screen` entry in `app/(auth)/_layout.tsx` (line 19).
- This flow doubles as "set a password" for existing OTP-only users. (Optional follow-up, not in scope: "Set password" row in profile/edit via `updateUser`.)

### 5. Cookie consent (web only)
- **New `lib/consent.ts`**: `getCookieConsent(): 'accepted' | 'declined' | null`, `setCookieConsent(v)`, `hasAnalyticsConsent()`. localStorage key `fitxball_cookie_consent`; every fn guarded by `Platform.OS === 'web'` + try/catch (private-mode Safari). Doc note: future analytics must check `hasAnalyticsConsent()` before initializing.
- **New `components/web/CookieBanner.tsx`**: renders only on web when consent is unset. Fixed bottom bar (`position: 'fixed'` via the project's web-CSS cast pattern), `FW.surface` bg / `FW.border` top border; copy "We use cookies to improve your experience and analyze usage." + **Accept** (`WBtn` sm) / **Decline** (`WGhostBtn` sm). Row layout ≥1024 (`useIsDesktopWeb`), stacked at narrow widths.
- Mount as a sibling after `<Stack>` in `app/_layout.tsx` (fragment).

### 6. Owner dashboard tasks (no API access — must be done by hand)
1. Auth → Email Templates: **Confirm signup** and **Reset password** must print `{{ .Token }}` (8-digit code), styled like the existing Magic Link template. Magic Link stays as-is.
2. Auth settings: min password length ≥ 8 (matches in-app rules); leaked-password protection if plan allows; Email provider password sign-in is on by default.

## Verification
- `npx tsc --noEmit` clean.
- chrome-devtools MCP, fresh/isolated context (signed out):
  - Banner shows on first load; Accept → reload → gone, localStorage correct; same for Decline; check 1280px and 390px.
  - Login defaults to password mode; links toggle/navigate; wrong password shows friendly error; OTP fallback reaches verify.tsx.
  - Register: step 0 blocks until password checklist passes; step 2 blocks on bad phone (`0712345678` and `712345678` both → `+254712345678`); consent unticked by default.
  - Forgot: email → code stage transition without leaving the route; no bounce-to-tabs mid-recovery.
- Needs the owner's inbox (after template edits): signup code arrives + verifies; recovery code → new password → lands in tabs; password sign-in sends **no email**; legacy OTP-only account can still code-sign-in and set a password via forgot.
- DB: new signup's profiles row has normalized phone + correct consent flag.
- Native sanity pass on one simulator (recovery no longer uses the deep link).
