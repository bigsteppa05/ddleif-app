import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  try {
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

export async function signInWithApple(): Promise<{ error: string | null }> {
  if (Platform.OS !== 'ios') return { error: 'Apple Sign In is only available on iOS.' };

  try {
    // Dynamic import — keeps the module out of Android/web bundles
    const AppleAuth = await import('expo-apple-authentication');
    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) return { error: 'No identity token from Apple.' };

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    return { error: error?.message ?? null };
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED') return { error: null }; // user dismissed
    return { error: e instanceof Error ? e.message : 'Apple Sign In failed.' };
  }
}
