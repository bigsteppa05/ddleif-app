# Release & Update Runbook

How to build, ship, and update **fitXball** (Expo / React Native + Supabase).

- App name: `fitXball` · slug: `fitxball`
- iOS bundle id: `com.fitxball.app` · Android package: `com.fitxball.app`
- Web: deployed by **Vercel** on push to `main` (no build step needed here).

## Three ways to ship a change — always pick the lowest one

| Change | Channel | How | Store review? |
|---|---|---|---|
| Events, event images | Supabase (admin panel / dashboard) | Edit data | No |
| Payments live, pricing, packs, feature flags, promo banner, copy | Supabase `app_config` (**Admin → Config**) | Edit in app | No |
| M-Pesa going live | Supabase edge-function secrets | Swap Daraja secrets | No |
| UI, new buttons, logic fixes, **theme/colors** | **OTA** (EAS Update) | `eas update` | No |
| Native deps, permissions, app icon/splash/name, SDK bump | **New build** | `eas build` + submit | Yes |

Rule of thumb: if you only changed JavaScript/assets → OTA. If you changed anything native → new build (bump `version` in `app.json`).

## One-time setup (before the first build)

```bash
npm i -g eas-cli
eas login                 # free Expo account: https://expo.dev
eas init                  # links project; writes extra.eas.projectId into app.json
eas update:configure      # enables OTA; writes updates.url into app.json
```

Commit the `app.json` changes those commands make.

## Build

```bash
# Installable Android APK for testing (no store account needed)
eas build -p android --profile preview

# Production builds
eas build -p android --profile production   # AAB for Play Store
eas build -p ios --profile production       # needs Apple Developer account
```

Build profiles and their OTA channels are in `eas.json` (`development` / `preview` / `production`).

## Ship an OTA update (no store review)

```bash
# Publish JS/asset/theme changes to everyone on the matching build channel
eas update --branch production --message "what changed"
```

Applies on the user's next cold start. Only works on a build whose `runtimeVersion`
(policy: `appVersion`) matches — i.e. same `version` as the installed app.

## Edit runtime config (no update at all)

**Admin → Config** in the app (admin-only) edits `public.app_config`:
payments switch, KES-per-credit, credit packs, feature flags, promo banner,
editable copy. Changes are live on next app open. Read in code via
`useAppConfig()`, `useFlag('name')`, `useContent('key', 'fallback')`.

## Versioning

- JS-only change → **don't** bump `version`; just `eas update`.
- Native change → bump `app.json` `version` (e.g. 1.0.0 → 1.0.1), then `eas build` + submit.
  A new `version` = a new `runtimeVersion`, so old installs keep their matching OTA line.

## Store submission (later)

```bash
eas submit -p android --profile production   # needs google-play-key.json + Play account
eas submit -p ios --profile production        # needs Apple account + ascAppId/appleTeamId in eas.json
```
