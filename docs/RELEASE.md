# Releasing fitXball

fitXball ships changes on three tiers. Most changes never touch the App Store —
pick the lowest tier that covers your change.

| Tier | What it covers | How it ships | Store review? |
| --- | --- | --- | --- |
| **1 · Remote config / data** | pricing, packs, feature flags, theme, banner, copy; events, users, credits; edge functions, RPCs, RLS | edit `app_config` (Admin → Config) or Supabase; `supabase functions deploy` | No — instant |
| **2 · OTA (EAS Update)** | any JS/TS + bundled-asset change on the *existing* native runtime: screens, styling, logic, copy, new routes, bug fixes | `npm run ota` | No |
| **3 · Native build** | new native dependency, `app.json` native config (plugins, permissions, entitlements, icon/splash), SDK/RN upgrade | `npm run build:production` → submit | **Yes** |

---

## Tier 1 — Remote config & data (instant)

Read at runtime from Supabase, so changes take effect on the next app launch /
config refresh. No OTA, no build.

- **`app_config`** (single row, edited from the in-app Admin → Config screen):
  `payments_live`, `kes_per_credit`, `min_credits`, `credit_packs`,
  `feature_flags`, `theme`, `banner`, `content`.
- **Data & server logic**: events, users, credits, bookings; and the M-Pesa
  edge functions / RPCs / RLS (`supabase functions deploy <name>`,
  `supabase migration` / SQL).

## Tier 2 — OTA update (no review)

For any change under `app/`, `components/`, `lib/`, `constants/`, or `assets/`
that runs on the native binary already installed.

```bash
npm run ota            # runs the OTA guard, then `eas update` (pick branch + message)
# non-interactive:
npm run ota:check && eas update --branch production --message "Fix booking copy"
```

The client (`lib/useOTAUpdates.ts`) checks on launch and on foreground, downloads
in the background, and applies the new bundle on the **next cold start**.

## Tier 3 — Native build + submit (App Store review)

Required whenever the native runtime changes. `build:*` saves the OTA baseline
first (so Tier 2 stays accurate), then builds.

```bash
npm run build:production      # saves baseline, then `eas build --profile production --platform all`
eas submit --profile production --platform ios       # iOS → App Store Connect (config in eas.json)
eas submit --profile production --platform android    # Android → Play
# after the build is live to users:
npm run baseline:save && git commit -am "chore: bump OTA baseline"
```

---

## How the traps are prevented

`runtimeVersion` uses the **`fingerprint`** policy (`app.json`). The runtime is
derived from the *native surface* (dependencies + app config + plugins), not the
app version. Two consequences that used to be footguns are now handled for you:

1. **Bumping `version` no longer breaks OTA.** The fingerprint is independent of
   `version`, so a JS-only change still reaches installed builds even if you bump
   the version string.
2. **A native change can't be shipped as an OTA by mistake.** Changing a native
   dependency or native config produces a new fingerprint → EAS Update won't
   deliver that bundle to old builds (no crash), and the local **OTA guard**
   (`scripts/ota-guard.mjs`) blocks the publish before it happens.

The guard compares the current fingerprint against `.ota-baseline.json` (the
runtime of your last build, committed to the repo):

```bash
npm run ota:fingerprint # print the current native fingerprint
npm run ota:check       # exit 0 = OTA-safe, exit 1 = native changed → build instead
```

`npm run ota` runs the guard automatically, so a blocked OTA never publishes.

### First-time bootstrap

There is no baseline until your first native build. On a fresh checkout
`npm run ota:check` will say *"build first"* — that's expected. Your first
`npm run build:production` writes `.ota-baseline.json`; commit it.

### The one rule
- Touched only JS/TS/assets? → **Tier 2** (`npm run ota`).
- Touched `app.json` native config or added a native package? → **Tier 3**
  (`npm run build:production` + submit, then `npm run baseline:save`).
- Touched pricing / flags / data / edge functions? → **Tier 1** (nothing to ship).

---

## Store submission config (already set)

`eas.json → submit.production.ios`: `appleId`, `ascAppId` (6793594264),
`appleTeamId` (3N9VTGVH39). Android uses `google-play-key.json` (internal track).

External prerequisites tracked outside this repo: Apple Developer enrollment,
Supabase Auth providers (Google ✓, Apple — enable + add client id
`com.fitxball.app`), production Daraja/M-Pesa secrets, and App Store Connect
privacy labels (app collects email, name, phone, photos).
