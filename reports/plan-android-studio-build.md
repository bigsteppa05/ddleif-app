# Plan: Android Studio Local Build Setup

## Context

The project uses Expo SDK 56 with `expo run:android` as the native build command. Android Studio is not installed on this machine, and `adb` is not on PATH. The android/ folder has not been generated yet. The goal is a working local development build on a real device or emulator.

---

## Step 1 — Install Android Studio

Download from: https://developer.android.com/studio (macOS `.dmg`)

During the setup wizard, ensure these are checked:
- **Android SDK** (API 35 — Android 15 is the current target for Expo 56)
- **Android SDK Platform-Tools** (includes `adb`)
- **Android Virtual Device** (AVD Manager — for emulator)

Install location: `/Applications/Android Studio.app`
SDK location: `~/Library/Android/sdk` (default, leave as-is)

---

## Step 2 — Set Environment Variables

Add to `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
```

Then reload:
```bash
source ~/.zshrc
adb --version   # should print version, not "command not found"
```

---

## Step 3 — Create a Virtual Device (AVD)

In Android Studio → **Device Manager** → **Create Virtual Device**:
- **Phone**: Pixel 8 Pro (or any Pixel)
- **System image**: API 35, Google Play (x86_64)
- **Name**: leave default

Or launch emulator from CLI after creation:
```bash
emulator -list-avds          # list available AVDs
emulator -avd <name>         # start chosen AVD
```

---

## Step 4 — Run the First Build

From the project directory:

```bash
cd /Users/habib/Downloads/ddleif-app-main
npx expo run:android
```

This will:
1. Generate the `/android` folder (native Gradle project)
2. Build the debug APK via Gradle
3. Install and launch on the running emulator or connected USB device

First build takes ~5–10 min (Gradle downloads dependencies). Subsequent builds are much faster.

---

## Step 5 — Physical Device (optional, faster than emulator)

1. On Android device: **Settings → Developer Options → USB Debugging** → Enable
2. Connect via USB
3. `adb devices` — device should appear as `device` (not `unauthorized`)
4. `npx expo run:android` — Expo will prefer the real device over emulator

---

## Step 6 — Verify Camera / Scanner Works

The admin QR scanner (`app/admin/scanner.tsx`) uses `expo-camera` which requires a native build. Test this specifically:

1. Log in as admin (`habibmohamed94004@gmail.com`)
2. Go to Admin → any event → scan icon
3. Camera permission prompt should appear
4. Point at a QR code from the ticket screen — booking details sheet should appear

This **only works** on a native build (not Expo Go).

---

## Known Pre-Conditions Before Building

- The pending Supabase SQL must be run first (booking_ref, checked_in_at columns, new RPCs). Otherwise the scanner and booking confirmation flow will be broken at runtime, even though the build succeeds.
- The two bugs fixed in this session (getUserBookings + checkExistingBooking filters) are already applied and will be included in this build.

---

## Verification

1. `adb --version` prints cleanly after env vars set
2. `npx expo run:android` completes without Gradle errors
3. App launches on emulator showing Welcome screen
4. Auth flow (register/login) connects to Supabase
5. Events load from DB
6. Book an event → confirmed screen → ticket QR renders
7. Admin scanner opens camera (physical device only — emulator has no camera)
