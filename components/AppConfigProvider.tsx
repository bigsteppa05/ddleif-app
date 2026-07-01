import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type AppConfig,
  DEFAULT_CONFIG,
  fetchAppConfig,
  readCachedConfigSync,
} from '@/lib/appConfig';

type AppConfigContextValue = {
  config: AppConfig;
  /** Re-fetch from Supabase (used by the admin editor after a save). */
  refresh: () => Promise<void>;
};

// Context holds the current config; consumers read it via the hooks below.
const AppConfigContext = createContext<AppConfigContextValue>({
  config: DEFAULT_CONFIG,
  refresh: async () => {},
});

/** Full runtime config. */
export function useAppConfig(): AppConfig {
  return useContext(AppConfigContext).config;
}

/** Re-fetch the config (for admin edits). */
export function useRefreshAppConfig(): () => Promise<void> {
  return useContext(AppConfigContext).refresh;
}

/** A single boolean feature flag with a compile-time fallback. */
export function useFlag(name: string, fallback = false): boolean {
  const cfg = useAppConfig();
  return cfg.feature_flags[name] ?? fallback;
}

/** A single editable copy string with a compile-time fallback. */
export function useContent(key: string, fallback = ''): string {
  const cfg = useAppConfig();
  return cfg.content[key] ?? fallback;
}

/**
 * Provides runtime config to the tree. Seeds from the synchronous web cache (or the
 * baked default) so first paint is never blocked, then refreshes from Supabase.
 * Fetch failures are swallowed — the app keeps running on cached/default config.
 */
export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(() => readCachedConfigSync() ?? DEFAULT_CONFIG);

  const refresh = useCallback(async () => {
    try {
      setConfig(await fetchAppConfig());
    } catch {
      /* keep cached/default config */
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchAppConfig()
      .then((cfg) => { if (active) setConfig(cfg); })
      .catch(() => { /* keep cached/default config */ });
    return () => { active = false; };
  }, []);

  return (
    <AppConfigContext.Provider value={{ config, refresh }}>
      {children}
    </AppConfigContext.Provider>
  );
}
