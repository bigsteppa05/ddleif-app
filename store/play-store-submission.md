# fitXball — Google Play Submission Pack

Everything needed to submit fitXball to Google Play. Copy fields directly into
Play Console. Terminology note: fitXball has **participants/players**, not
"members", and no "perks" programme — keep listing copy consistent with that.

- App: **fitXball** · package: `com.fitxball.app` · version: `1.0.0`
- Support: support@fitxball.com
- Privacy policy URL: `https://<your-vercel-domain>/legal/privacy`
  (already rendered by `app/legal/[page].tsx`; verify `dist/legal/privacy.html`
  emits on `npm run build:web` before submitting)

---

## 1. Store listing copy

**App name** (max 30 chars)
```
fitXball: Book Courts & Games
```

**Short description** (max 80 chars)
```
Discover sports events in Nairobi, book your slot, and check in with a QR code.
```

**Full description** (max 4000 chars)
```
fitXball is where Nairobi plays. Discover curated sports events across the city,
book your slot in seconds, and show up ready to play.

WHAT YOU CAN DO
• Discover events — browse curated football, basketball, padel and more, with
  dates, venues, and how many slots are left.
• Book your slot — reserve a place at any event in a couple of taps.
• Pay with credits — top up securely with M-Pesa and use credits to book. See
  your full credit and booking history any time.
• Fast entry — every booking gives you a QR ticket; staff scan it to check you
  in at the venue.
• Your profile — set a photo, add your sports preferences, and track everything
  you've played.

WHY FITXBALL
• Built for Nairobi — real venues, real games, curated by the fitXball team.
• Simple and fast — clean, mobile-first design with no clutter.
• Flexible — cancel free of charge up to 12 hours before an event and get your
  credits back.

Create an account with your email, find your next game, and play more.

Questions? support@fitxball.com
```

**Category:** Sports
**Tags:** sports, events, booking
**Contact email:** support@fitxball.com
**Website (optional):** https://<your-vercel-domain>

---

## 2. Graphics assets Google requires (you must produce these)

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | Derive from `assets/icon.png` |
| Feature graphic | 1024×500 PNG/JPG (no alpha) | **NEEDED** — required, shown at top of listing |
| Phone screenshots | 2–8 images, 16:9 or 9:16, min 320px side | **NEEDED** — capture from the app |
| (Optional) 7"/10" tablet shots | — | Optional |

Fastest screenshot route: install the preview APK on a phone (or run the Android
emulator) and capture the home/events list, an event detail, the booking/credits
flow, and the QR check-in screen.

---

## 3. Data Safety form answers (derived from your Privacy Policy)

Google Play Console → App content → Data safety.

**Does your app collect or share user data?** → **Yes**
**Is all data encrypted in transit?** → **Yes**
**Do you provide a way to request data deletion?** → **Yes**
(Profile → Deactivate account, and support@fitxball.com)

Data types to declare as **Collected** (not "Shared" — Supabase/Safaricom/Brevo
are processors acting on your behalf, not third parties using data for their own
purposes):

| Data type | Category | Purpose | Required? |
|---|---|---|---|
| Name | Personal info | App functionality, Account management | Required |
| Email address | Personal info | App functionality, Account management | Required |
| Phone number | Personal info | App functionality (M-Pesa, login) | Required |
| User IDs (username) | Personal info | App functionality | Required |
| Date of birth / Gender | Personal info (Other) | App functionality | Optional |
| Photos | Photos and videos | App functionality (profile picture) | Optional |
| Purchase history (M-Pesa top-ups) | Financial info | App functionality | Required for top-up |
| App interactions (bookings, check-ins) | App activity | App functionality, Analytics | Required |

Notes for the form:
- **Camera** is used to scan entry QR codes in real time; no camera images are
  stored, so do not declare "Photos" for the camera — only for the profile
  picture upload.
- You **do not** collect location, contacts, or device identifiers for ads.
- You **do not sell** data or share it for advertising.
- M-Pesa PIN is never seen or stored (stated in policy §1).

---

## 4. Other "App content" declarations Play requires

- **Privacy policy URL:** the /legal/privacy URL above.
- **Ads:** No ads → declare "No".
- **Content rating questionnaire:** complete it — fitXball is a utility/sports
  app with no violent/mature content; expect an "Everyone" / PEGI 3 rating.
- **Target audience:** 18+ (Terms require 18+); do NOT include under-13 to avoid
  Families policy obligations.
- **Data access / permissions:** camera (QR check-in), photos (profile/event
  images), notifications — all already have usage strings in app.json.
- **Government app / financial features:** it handles payments via M-Pesa; answer
  the financial-features questions honestly (peer payments = No; it's for booking).

---

## 5. Closed testing → production (the 14-day gate)

Google requires **new personal developer accounts** to run a closed test before
they can publish to production:
- At least **12 testers** opted in,
- kept in the test for **14 continuous days**,
- then you can apply for production access.

**Organization accounts (with a D-U-N-S number) are exempt** — if fitXball is a
registered business, enrol as an Organization to skip the 14-day wait.

How to run it in Play Console:
1. **Testing → Closed testing → Create track** (or use the default "Alpha").
2. Create an **email list** of ≥12 testers (Google accounts). Real people is
   safest; Google has cracked down on fake testers.
3. Upload the AAB (via `eas submit`, see runbook) to that track.
4. Share the **opt-in link** with testers; each must install and open the app.
5. Keep them active for 14 days, then Play surfaces an **"Apply for production"**
   button.

Plan the 12 testers now (teammates, friends, early Nairobi players) — the clock
only starts once they've opted in.

---

## 6. Command runbook (run these yourself — they're interactive)

Prereq: commit the build-readiness fixes first (EAS builds from git):
```bash
git checkout -b chore/android-release
git add package.json package-lock.json app.json
git commit -m "Android build readiness: add peer deps, align SDK 56, migrate splash plugin"
```

Then:
```bash
eas login                                       # your Expo account

# Track 1 — installable APK for testing / screenshots (no Google account)
eas build -p android --profile preview

# Track 2 — production AAB for Play Store
eas build -p android --profile production

# Submit AAB to Play (needs google-play-key.json service-account key + Play account)
eas submit -p android --profile production
```

`google-play-key.json`: Play Console → Setup → API access → create a service
account → grant it release permissions → download the JSON key → save it as
`./google-play-key.json` (it's gitignored-sensitive; never commit it).
