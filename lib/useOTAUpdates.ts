import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Silently keeps the app on the latest OTA (EAS Update) bundle.
 *
 * On a production native build it checks for an update on mount and whenever the
 * app returns to the foreground; if one is available it downloads it in the
 * background. The new bundle is applied on the next cold start (we don't force a
 * mid-session reload — that would interrupt the user). No-ops on web and in dev
 * (Expo Go / dev client), where `Updates.isEnabled` is false, so it's safe to call
 * unconditionally from the root layout.
 */
export function useOTAUpdates() {
  useEffect(() => {
    if (!Updates.isEnabled) return;

    let checking = false;
    async function check() {
      if (checking) return;
      checking = true;
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        /* offline, or no update server configured yet — ignore */
      } finally {
        checking = false;
      }
    }

    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);
}
