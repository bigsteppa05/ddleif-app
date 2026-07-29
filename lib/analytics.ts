import { Platform } from 'react-native';
import type PostHog from 'posthog-react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Product analytics (PostHog) — funnels for onboarding, sign-up, and top-ups.
//
// Deliberately minimal and safe:
//  • Native only. The RN SDK isn't the right client for the web build (that would
//    be posthog-js); web calls are silent no-ops.
//  • Disabled unless EXPO_PUBLIC_POSTHOG_KEY is set, so dev / preview / any build
//    without the key sends nothing.
//  • The SDK is `require`d lazily inside the enabled branch, so it never enters
//    the web bundle at all.
//  • No PII in event properties — identify() ties events to the Supabase user id;
//    email/name/phone are never sent as event props.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

const enabled = Platform.OS !== 'web' && !!KEY;

let client: PostHog | null = null;
if (enabled) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PostHogCtor = require('posthog-react-native').default;
    client = new PostHogCtor(KEY, { host: HOST });
  } catch {
    client = null; // never let analytics init break app startup
  }
}

/** Whether events are actually being sent (native + key present). */
export const analyticsEnabled = !!client;

// Typed event catalogue — keep names stable; PostHog funnels reference them.
export type AnalyticsEvent =
  // Onboarding
  | 'onboarding_intro_viewed'
  | 'onboarding_get_started'
  | 'onboarding_signin_tapped'
  // Sign-up
  | 'signup_started'
  | 'signup_verified'
  | 'signup_completed'
  // Top-up (M-Pesa)
  | 'topup_started'
  | 'topup_prompt_sent'
  | 'topup_succeeded'
  | 'topup_failed'
  | 'topup_manual_review'
  // Booking
  | 'booking_confirmed';

// JSON-safe property values (PostHog rejects arbitrary `unknown`).
type Json = string | number | boolean | null;
export type AnalyticsProps = Record<string, Json | undefined>;

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  try {
    client?.capture(event, props as Record<string, Json>);
  } catch {
    /* analytics must never throw into product code */
  }
}

/** Tie the current + future events to a stable user (the Supabase user id). */
export function identifyUser(userId: string, traits?: AnalyticsProps): void {
  try {
    client?.identify(userId, traits as Record<string, Json>);
  } catch {
    /* ignore */
  }
}

/** Clear identity on sign-out so the next user isn't merged into this one. */
export function resetAnalytics(): void {
  try {
    client?.reset();
  } catch {
    /* ignore */
  }
}
