import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Runtime configuration fetched from Supabase (public.app_config, single row).
// Lets us change pricing, feature flags, the payments switch, a promo banner, and
// editable copy WITHOUT shipping an app update. Every field has a baked-in default
// so the app is fully functional before the first fetch and when offline.
// ─────────────────────────────────────────────────────────────────────────────

export type CreditPack = { credits: number; discount: number; label?: string | null };

export type AppBanner = {
  enabled?: boolean;
  text?: string;
  cta_label?: string;
  cta_url?: string;
  tone?: 'info' | 'success' | 'warning';
} | null;

export type AppConfig = {
  /** Partial color overrides keyed by constants/colors.ts keys. */
  theme: Record<string, string>;
  /** Boolean feature switches, read via useFlag('name'). */
  feature_flags: Record<string, boolean>;
  kes_per_credit: number;
  credit_packs: CreditPack[];
  /** Master switch for the top-up flow. */
  payments_live: boolean;
  banner: AppBanner;
  /** Editable copy keyed by id, read via useContent('key', fallback). */
  content: Record<string, string>;
};

// Mirrors the seeded row in the create_app_config migration and the old baked-in
// constants (PAYMENTS_ENABLED=false, KES_PER_CREDIT=10).
export const DEFAULT_CONFIG: AppConfig = {
  theme: {},
  feature_flags: {},
  kes_per_credit: 10,
  credit_packs: [
    { credits: 10, discount: 0 },
    { credits: 25, discount: 0 },
    { credits: 50, discount: 0.05, label: '5% off' },
    { credits: 100, discount: 0.1, label: '10% off' },
  ],
  payments_live: false,
  banner: null,
  content: {},
};

const CACHE_KEY = 'app_config_v1';

const hasLocalStorage = () => typeof localStorage !== 'undefined';

function merge(raw: Partial<AppConfig> | null | undefined): AppConfig {
  if (!raw) return DEFAULT_CONFIG;
  return {
    theme: raw.theme ?? DEFAULT_CONFIG.theme,
    feature_flags: raw.feature_flags ?? DEFAULT_CONFIG.feature_flags,
    kes_per_credit: Number(raw.kes_per_credit ?? DEFAULT_CONFIG.kes_per_credit),
    credit_packs: Array.isArray(raw.credit_packs) ? raw.credit_packs : DEFAULT_CONFIG.credit_packs,
    payments_live: !!raw.payments_live,
    banner: raw.banner ?? null,
    content: raw.content ?? DEFAULT_CONFIG.content,
  };
}

/**
 * Synchronous cache read — only possible on web (localStorage). Used to seed the
 * provider's initial state so there's no flicker. Native returns null (SecureStore
 * is async) and falls back to DEFAULT_CONFIG until the first fetch resolves.
 */
export function readCachedConfigSync(): AppConfig | null {
  if (Platform.OS === 'web' && hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) return merge(JSON.parse(raw));
    } catch {
      /* ignore corrupt cache */
    }
  }
  return null;
}

async function writeCachedConfig(cfg: AppConfig): Promise<void> {
  try {
    const raw = JSON.stringify(cfg);
    if (Platform.OS === 'web') {
      if (hasLocalStorage()) localStorage.setItem(CACHE_KEY, raw);
    } else {
      await SecureStore.setItemAsync(CACHE_KEY, raw);
    }
  } catch {
    /* non-fatal — caching is best-effort */
  }
}

/** Fetch the live config from Supabase and refresh the local cache. */
export async function fetchAppConfig(): Promise<AppConfig> {
  const { data, error } = await supabase
    .from('app_config')
    .select('theme, feature_flags, kes_per_credit, credit_packs, payments_live, banner, content')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) throw error ?? new Error('app_config not found');
  const cfg = merge(data as Partial<AppConfig>);
  await writeCachedConfig(cfg);
  return cfg;
}

/** Resolve a pack's KES price from its discount and the current per-credit rate. */
export function resolvePackKes(pack: CreditPack, kesPerCredit: number): number {
  return Math.round(pack.credits * kesPerCredit * (1 - (pack.discount ?? 0)));
}

/**
 * Admin-only: write changed fields to the single config row. Only the provided
 * keys are updated. RLS restricts this to admins; non-admins get an error.
 */
export async function updateAppConfig(patch: Partial<AppConfig>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.feature_flags !== undefined) row.feature_flags = patch.feature_flags;
  if (patch.kes_per_credit !== undefined) row.kes_per_credit = patch.kes_per_credit;
  if (patch.credit_packs !== undefined) row.credit_packs = patch.credit_packs;
  if (patch.payments_live !== undefined) row.payments_live = patch.payments_live;
  if (patch.banner !== undefined) row.banner = patch.banner;
  if (patch.content !== undefined) row.content = patch.content;
  const { error } = await supabase.from('app_config').update(row).eq('id', 1);
  if (error) throw error;
}
