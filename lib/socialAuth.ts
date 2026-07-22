import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  try {
    // Web: full-page redirect back to the app's own origin (prod or localhost),
    // let Supabase complete the session via detectSessionInUrl. No app-scheme,
    // no in-app browser popup — those are the native-only path.
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      return { error: error?.message ?? null };
    }

    const redirectTo = makeRedirectUri({ scheme: 'fitxball', path: 'auth/callback' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error || !data.url) return { error: error?.message ?? 'Could not start Google sign-in.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success' && result.url) {
      const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
      if (sessionError) return { error: sessionError.message };
      return { error: null };
    }

    if (result.type === 'cancel' || result.type === 'dismiss') return { error: null };
    return { error: 'Sign-in was not completed.' };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

/**
 * Whether native Apple Sign In can actually run here. False on Android/web, and
 * false in runtimes where the native module isn't linked (e.g. Expo Go on the
 * simulator) — used to hide the Apple button instead of showing a dead one.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const AppleAuth = await import('expo-apple-authentication');
    return await AppleAuth.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<{ error: string | null }> {
  if (Platform.OS !== 'ios') return { error: 'Apple Sign In is only available on iOS.' };

  try {
    // Dynamic import — keeps the module out of Android/web bundles
    const AppleAuth = await import('expo-apple-authentication');
    // Guard against runtimes where the native module isn't available (Expo Go on
    // the simulator, etc.) so we never surface the raw "native dependency" error.
    let available = false;
    try { available = await AppleAuth.isAvailableAsync(); } catch { available = false; }
    if (!available) return { error: "Apple Sign In isn't available on this device." };

    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) return { error: 'No identity token from Apple.' };

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { error: error.message };

    // Apple returns the user's name ONLY on the first authorization, and never
    // inside the identity token — so the handle_new_user trigger stores name=null.
    // Capture it from the credential and backfill the profile (and auth metadata)
    // when it's still empty, so Apple users show a real name on participant lists
    // instead of "Participant". We never overwrite a name the user has since edited.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const userId = data.user?.id;
    if (fullName && userId) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .maybeSingle();
      if (prof && !prof.name?.trim()) {
        await supabase.from('profiles').update({ name: fullName }).eq('id', userId);
        await supabase.auth.updateUser({ data: { name: fullName } }).catch(() => {});
      }
    }

    return { error: null };
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED') return { error: null }; // user dismissed
    return { error: e instanceof Error ? e.message : 'Apple Sign In failed.' };
  }
}
