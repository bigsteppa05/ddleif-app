# fitXball — App Store submission packet

Everything needed to complete App Store Connect and pass review. Code (Gate 1) is
done; this covers Gates 2–5. Fill every `⟨PLACEHOLDER⟩` before submitting.

- App name: **fitXball**
- Bundle ID: **com.fitxball.app**
- Apple Team ID: **3N9VTGVH39** · ASC App ID: **6793594264**
- Category: **Sports** · Market: **Nairobi, Kenya**
- Business model: prepaid **booking credits** used to reserve real-world sports
  sessions (football, basketball, padel). Not IAP — payments buy physical
  participation, not digital content.

---

## 1. App Privacy answers (the "nutrition label")

Answer these in App Store Connect → App Privacy. **None of fitXball's data is used
for Tracking** (Apple's definition: linking with third-party data for ads / sharing
with data brokers). fitXball uses first-party analytics only, so **no ATT prompt**.
All collected data is **Linked to the user's identity** (tied to their account).

| Data type (Apple taxonomy) | Collected | Linked to identity | Tracking | Purpose | Where it comes from |
|---|---|---|---|---|---|
| **Name** | Yes | Yes | No | App Functionality | Profile / Apple / Google |
| **Email Address** | Yes | Yes | No | App Functionality (auth) | Sign-up / Apple / Google |
| **Phone Number** | Yes | Yes | No | App Functionality (M-Pesa, contact) | Profile, top-up |
| **Photos or Videos** | Yes | Yes | No | App Functionality (profile avatar) | User upload |
| **User ID** | Yes | Yes | No | App Functionality, Analytics | Supabase user id, Apple user id |
| **Device ID** | Yes | Yes | No | Analytics | PostHog SDK |
| **Product Interaction** (Usage Data) | Yes | Yes | No | Analytics | PostHog events |
| **Purchase History** | Yes | Yes | No | App Functionality | Bookings, credits, top-ups |
| **Other Financial Info** (transaction refs, amounts) | Yes | Yes | No | App Functionality | M-Pesa receipt / checkout id |

**Explicitly NOT collected** (answer "No"): Precise/Coarse **Location**, **Contacts**,
**Health & Fitness**, **Browsing/Search History**, **Sensitive Info**, **Crash/Diagnostics**
(no crash SDK; PostHog is manual events only), **Payment card numbers** (never stored —
M-Pesa/processor handle them), **Audio/Messages/other User Content** (no chat/UGC in v1).

> If you later enable **card payments** (`show_card_payment` flag) or a **crash/exception
> SDK**, update this table before that build ships.

### Purpose-string cross-check (Info.plist — already in the build)
- `NSCameraUsageDescription` — scanning entry QR codes (admin check-in).
- `NSPhotoLibraryUsageDescription` — profile picture + event images.
- No mic, no location, no tracking strings. Privacy manifest (`PrivacyInfo.xcprivacy`)
  declares required-reason APIs (UserDefaults / FileTimestamp / SystemBootTime / DiskSpace).

---

## 2. Third-party data coverage (required by Apple)

Apple's privacy answers **must include partners' collection**, not just fitXball's.

| Partner | Role | Data it processes | Notes |
|---|---|---|---|
| **Supabase** | Backend: auth, Postgres, storage, edge functions | Email, name, phone, user id, bookings, payments, avatar images | Data processor (EU/US region per project). Not sold. Account deletion removes/anonymizes. |
| **PostHog** (EU cloud) | Product analytics | Device id, usage/interaction events, distinct id = Supabase user id | First-party analytics, **not** cross-app ad tracking. Person + events **deleted via API on account deletion** (`delete-account` fn). |
| **Safaricom M-Pesa (Daraja)** | Payment processing (STK push) | Phone number, amount, transaction refs | Processor holds the payment record; fitXball stores anonymized refs. |
| **Google** (Sign-In) | Auth provider (optional login) | Email, name, Google account id | Only when the user chooses Google. |
| **Apple** (Sign in with Apple) | Auth provider (optional login) | Apple relay email, name (first sign-in), Apple user id | "Hide My Email" supported. Token **revoked** on account deletion. |
| ~~Card processor~~ | — | — | **Not enabled in v1** (card option hidden). Declare if turned on. |

---

## 3. Privacy-policy audit checklist

Your policy lives at `/legal/privacy` (linked in-app under Profile). Before submit,
confirm it:

- [ ] Is reachable at a public URL **without login**, and that exact URL is in ASC.
- [ ] Lists every data category in §1 (name, email, phone, photo, user/device id, usage, purchase/financial refs).
- [ ] States the **purpose** of each category.
- [ ] Names the **third-party processors**: Supabase, PostHog, Safaricom M-Pesa, Google, Apple.
- [ ] Covers **authentication, analytics, notifications, payments** explicitly.
- [ ] Explains **retention** (incl. anonymized financial records kept for legal/financial reasons) and **in-app account deletion**.
- [ ] Explains how to **withdraw consent / request deletion**.
- [ ] Does **not** claim "we collect no data."
- [ ] Shows a monitored **support contact** (`⟨SUPPORT_EMAIL⟩`).

---

## 4. App Review notes (copy-ready)

> **What fitXball is.** fitXball lets people in Nairobi, Kenya reserve a spot in
> real-world pickup sports sessions (football, basketball, padel) held at physical
> venues. Users hold prepaid **booking credits** and redeem them to book a session.
>
> **Payments are not digital purchases.** Payment via M-Pesa (and, later, card)
> buys **participation in a physical sports session** consumed outside the app. No
> digital content, feature, or virtual item is unlocked. Credits can only be
> redeemed for real-world fitXball sessions, are not transferable between users,
> and have no cash value except where a refund is legally required. This is why the
> app correctly uses M-Pesa/card rather than In-App Purchase.
>
> **Reviewer login (no OTP needed).** Use the demo account below. It signs in with
> **email + password**, so no email one-time code is required.
> - Email: `⟨REVIEW_EMAIL⟩`
> - Password: `⟨REVIEW_PASSWORD⟩`
>
> **The account is preloaded with booking credits** (enough for 3+ bookings), so the
> reviewer can complete the full booking lifecycle **without any Kenyan phone number
> or real M-Pesa payment**. A live, bookable session with open spots is available at
> all times during review.
>
> **To review the core flow:** Open the app → tap through onboarding → sign in with
> the demo account → open the Explore/Home tab → pick the live session `⟨EVENT_NAME⟩`
> → "Grab your spot" (paid from the preloaded credits) → see the confirmation +
> booking reference → open "My Bookings" → cancel the booking. To review **account
> deletion**: Profile → **Delete Account** → confirm.
>
> **Non-obvious functionality.** Camera permission is used **only by admins** to scan
> entry QR codes at events; regular users never need it. Sign in with Apple and
> Google are offered alongside email; the app supports **in-app account deletion**
> (not deactivation) and revokes Apple tokens on deletion.
>
> **Contact during review:** `⟨CONTACT_NAME⟩`, `⟨SUPPORT_EMAIL⟩`, `⟨PHONE⟩` (monitored).

---

## 5. Reviewer environment (Gate 3)

Create and keep stable for the whole review window:

| Field | Value |
|---|---|
| Email | `⟨REVIEW_EMAIL⟩` (e.g. appreview@fitxball.com) |
| Password | `⟨REVIEW_PASSWORD⟩` (stable, review-only) |
| Login method | Email + **password** (bypasses OTP) |
| Credits preloaded | ≥ enough for 3 bookings (admin → grant credits) |
| Live event | ≥ 1 upcoming session with several open spots |
| Cancellation | Allowed |
| Account deletion | Allowed |

- [ ] Verified the account signs in **without an email OTP** from a different device.
- [ ] Confirmed no cleanup job resets the reviewer's credits or deletes the live session mid-review.
- [ ] Credentials entered in ASC → App Review Information, and pasted in the review notes.

---

## 6. TestFlight release checklist (Gate 5)

Run on a **physical iPhone**, on the **exact production archive** (not Expo Go / dev):

Full journey (two testers):
- [ ] Fresh install → onboarding → **password** login → browse event → inspect venue/session → book with credits → view receipt/reference → cancel → sign out → sign back in → **delete account**.
- [ ] Reinstall → confirm the deleted account **cannot** silently restore its old profile/bookings.

Sign in with Apple + deletion QA (once `APPLE_*` secrets are set + Apple provider enabled):
- [ ] First Apple sign-in creates the account; returning Apple sign-in matches it.
- [ ] "Hide My Email" relay works and fitXball emails still arrive.
- [ ] On delete: the authorization code was exchanged and a token stored (`apple_auth_tokens` had a row).
- [ ] On delete: Apple `/auth/revoke` returns success (check `delete-account` function logs).
- [ ] After delete: the `apple_auth_tokens` row is gone (cascaded).
- [ ] After delete: Supabase auth user, profile, avatar file, and booking PII are removed; payments anonymized.
- [ ] Secondary check: fitXball no longer appears under Apple ID → Sign in with Apple (appleid.apple.com).

Xcode/SDK compliance:
- [ ] EAS build log shows **Xcode 26.x** and **iPhoneOS 26.x SDK**.
- [ ] Submitted archive's build number matches that build and App Store Connect.

---

## 7. Backend configuration (Gate 2) — set before the production build

Supabase → Authentication → Providers → **Apple**: enable; add client id
`com.fitxball.app` to accepted audiences. Confirm it matches the signed bundle id.

Supabase → Edge Functions → **Secrets** (never in the app):

| Secret | Value |
|---|---|
| `APPLE_TEAM_ID` | `3N9VTGVH39` |
| `APPLE_KEY_ID` | `⟨from the Sign in with Apple .p8 key⟩` |
| `APPLE_CLIENT_ID` | `com.fitxball.app` |
| `APPLE_PRIVATE_KEY` | `⟨contents of AuthKey_XXXX.p8⟩` |
| `POSTHOG_PERSONAL_API_KEY` | `⟨PostHog personal API key, person-delete scope⟩` |
| `POSTHOG_PROJECT_ID` | `230531` |
| `POSTHOG_API_HOST` | `https://eu.posthog.com` |
| `DARAJA_BASE_URL` | `https://api.safaricom.co.ke` (production; sandbox is `https://sandbox.safaricom.co.ke`) |
| `DARAJA_CONSUMER_KEY` | `⟨production Daraja app consumer key⟩` |
| `DARAJA_CONSUMER_SECRET` | `⟨production Daraja app consumer secret⟩` |
| `DARAJA_SHORTCODE` | `⟨production paybill/till shortcode⟩` |
| `DARAJA_PASSKEY` | `⟨production STK passkey⟩` |

All five `DARAJA_*` names are read via `requireEnv()` in
`mpesa-stk-push/daraja.ts` and `mpesa-stk-query/daraja.ts`; a missing one throws
at call time, not deploy time. `mpesa-callback` needs no Daraja secrets.

Also: set `EXPO_PUBLIC_POSTHOG_KEY` for the EAS build (already in `.env`), and confirm
PostHog is your production project.

---

## 8. App Store Connect metadata (Gate 4)

- [ ] App name, subtitle, description (real-world sports booking; no unverifiable claims, no "coming soon").
- [ ] Keywords (relevant; no competitor trademarks).
- [ ] Primary category **Sports**; age rating questionnaire answered honestly.
- [ ] **Privacy-policy URL** + **Support URL** (both load without auth).
- [ ] App Privacy answers per §1–§2 (including third parties).
- [ ] Screenshots: **real UI** — event discovery, session details, booking confirmation. No splash/login-only, no Android chrome, no real customer data.
- [ ] Reviewer credentials + review notes (§4, §5).
- [ ] Copyright + all imagery/fonts licensed or owned.
- [ ] Supported devices: decide iPad (test or restrict); check Mac/Vision Pro availability.

---

## 9. Final submission sign-off

| Gate | Item | Status |
|---|---|---|
| 1 | Code: deletion, Apple revocation, PostHog deletion, no placeholders | ✅ done (this branch) |
| 2 | Apple provider enabled + all secrets set | ☐ |
| 2 | Production Daraja credentials | ☐ |
| 3 | Reviewer account (password login, preloaded credits, live event) | ☐ |
| 4 | ASC metadata + App Privacy + screenshots + review notes | ☐ |
| 5 | Two TestFlight full-journey runs + Apple-revocation QA | ☐ |
| — | EAS build log confirms Xcode 26 / iOS 26 SDK | ☐ |
| — | Privacy-policy audit (§3) passed | ☐ |

**Submit only when every box above is checked.**
