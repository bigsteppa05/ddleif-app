// Shared web-only UI kit for the desktop (≥1024px) layouts.
// Design tokens and components follow the fitXball web design handoff.
import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export const FW = {
  bg: '#0C0C0C',
  panel: '#080808',
  surface: '#161616',
  surfaceEl: '#1F1F1F',
  border: '#262626',
  borderSoft: '#1D1D1D',
  primary: '#C8FF00',
  primaryDim: '#9BBF00',
  text: '#FFFFFF',
  sec: '#9A9A9A',
  muted: '#5A5A5A',
  error: '#FF5252',
  limeSoftBg: 'rgba(200,255,0,0.12)',
  redSoftBg: 'rgba(255,82,82,0.15)',
  mono: Platform.select({ web: 'ui-monospace, "SF Mono", Menlo, monospace', default: 'Courier' }) as string,
} as const;

export const DESKTOP_BREAKPOINT = 1024;

export function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ── buttons ──────────────────────────────────────────────────────────────────
export function WBtn({
  label, icon, size = 'md', dim, full, onPress, style,
}: {
  label: string; icon?: IoniconName; size?: 'sm' | 'md' | 'lg';
  dim?: boolean; full?: boolean; onPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const pad = size === 'lg' ? { paddingVertical: 16, paddingHorizontal: 32 }
    : size === 'sm' ? { paddingVertical: 9, paddingHorizontal: 18 }
    : { paddingVertical: 13, paddingHorizontal: 26 };
  const fs = size === 'lg' ? 16 : size === 'sm' ? 13 : 15;
  return (
    <Pressable
      onPress={onPress}
      disabled={dim}
      style={({ hovered }) => [
        kit.btn, pad,
        { opacity: dim ? 0.4 : hovered ? 0.88 : 1, alignSelf: full ? 'stretch' : 'flex-start' },
        full && { width: '100%' },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={fs + 2} color="#0C0C0C" />}
      <Text style={[kit.btnText, { fontSize: fs }]}>{label}</Text>
    </Pressable>
  );
}

export function WGhostBtn({
  label, icon, size = 'md', full, onPress, style, danger,
}: {
  label: string; icon?: IoniconName; size?: 'sm' | 'md' | 'lg';
  full?: boolean; onPress?: () => void; style?: StyleProp<ViewStyle>; danger?: boolean;
}) {
  const pad = size === 'lg' ? { paddingVertical: 15, paddingHorizontal: 32 }
    : size === 'sm' ? { paddingVertical: 8, paddingHorizontal: 16 }
    : { paddingVertical: 12, paddingHorizontal: 24 };
  const fs = size === 'lg' ? 16 : size === 'sm' ? 13 : 15;
  const color = danger ? FW.error : FW.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }) => [
        kit.ghostBtn, pad,
        { borderColor: hovered ? '#3A3A3A' : FW.border, alignSelf: full ? 'stretch' : 'flex-start' },
        full && { width: '100%' },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={fs + 2} color={color} />}
      <Text style={[kit.ghostBtnText, { fontSize: fs, color }]}>{label}</Text>
    </Pressable>
  );
}

// ── tags / chips / labels ────────────────────────────────────────────────────
export function WTag({ label, tone = 'lime' }: { label: string; tone?: 'lime' | 'dark' | 'soft' | 'red' | 'limeSoft' }) {
  const map = {
    lime: { bg: FW.primary, fg: '#0C0C0C' },
    dark: { bg: 'rgba(0,0,0,0.65)', fg: '#fff' },
    soft: { bg: FW.surfaceEl, fg: FW.sec },
    red: { bg: FW.redSoftBg, fg: FW.error },
    limeSoft: { bg: FW.limeSoftBg, fg: FW.primary },
  }[tone];
  return (
    <View style={[kit.tag, { backgroundColor: map.bg }]}>
      <Text style={[kit.tagText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

export function WChip({ label, active, icon, onPress }: { label: string; active?: boolean; icon?: IoniconName; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }) => [
        kit.chip,
        {
          backgroundColor: active ? FW.primary : hovered ? FW.surfaceEl : FW.surface,
          borderColor: active ? FW.primary : FW.border,
        },
      ]}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? '#0C0C0C' : FW.sec} />}
      <Text style={[kit.chipText, { color: active ? '#0C0C0C' : FW.text }]}>{label}</Text>
    </Pressable>
  );
}

export function WLabel({ children }: { children: React.ReactNode }) {
  return <Text style={kit.label}>{children}</Text>;
}

export function WAvatar({ initials, size = 40, lime = true }: { initials: string; size?: number; lime?: boolean }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      backgroundColor: lime ? FW.primary : FW.surfaceEl,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: lime ? '#0C0C0C' : FW.text, fontWeight: '800', fontSize: Math.round(size * 0.36) }}>
        {initials}
      </Text>
    </View>
  );
}

export function MetaRow({ icon, children, color = FW.sec, size = 14 }: {
  icon: IoniconName; children: React.ReactNode; color?: string; size?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Ionicons name={icon} size={size + 3} color={FW.muted} />
      <Text style={{ color, fontSize: size, lineHeight: size * 1.35 }}>{children}</Text>
    </View>
  );
}

export function StatBlock({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <View style={kit.statBlock}>
      <Text style={kit.statLabel}>{label}</Text>
      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={kit.statValue}>{value}</Text>
        {suffix ? <Text style={{ fontSize: 13, color: FW.muted }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function DateDivider({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 8 }}>
      <Text style={kit.dateDivider}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: FW.borderSoft }} />
    </View>
  );
}

// ── sidebar + shell ──────────────────────────────────────────────────────────
const USER_NAV: Array<[IoniconName, IoniconName, string, string]> = [
  ['home-outline', 'home', 'Home', '/'],
  ['compass-outline', 'compass', 'Explore', '/book'],
  ['ticket-outline', 'ticket', 'My Bookings', '/bookings'],
  ['person-outline', 'person', 'Profile', '/profile'],
];

const ADMIN_NAV: Array<[IoniconName, IoniconName, string, string]> = [
  ['home-outline', 'home', 'Overview', '/admin'],
  ['qr-code-outline', 'qr-code', 'Scan entry', '/checkin/scanner'],
  ['people-outline', 'people', 'Members', '/admin/users'],
];

function NavItem({ iconOutline, iconFilled, label, path, active }: {
  iconOutline: IoniconName; iconFilled: IoniconName; label: string; path: string; active: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(path as any)}
      style={({ hovered }) => [
        kit.navItem,
        { backgroundColor: active ? FW.surface : hovered ? FW.surface : 'transparent' },
      ]}
    >
      {active && <View style={kit.navActiveBar} />}
      <Ionicons name={active ? iconFilled : iconOutline} size={19} color={active ? FW.primary : FW.sec} />
      <Text style={[kit.navLabel, active && { color: FW.text, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function Sidebar({ admin, profileName, profileUsername, credits, onSignOut, onTopUp }: {
  admin?: boolean;
  profileName?: string;
  profileUsername?: string | null;
  credits?: number;
  onSignOut?: () => void;
  onTopUp?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = admin ? ADMIN_NAV : USER_NAV;
  const initials = (profileName ?? '?')
    .split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  function isActive(path: string): boolean {
    if (path === '/') return pathname === '/' || pathname === '/index';
    if (path === '/admin') return pathname === '/admin';
    // exact match or segment boundary — '/book' must not match '/bookings'
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  return (
    <View style={kit.sidebar}>
      <Pressable style={kit.sidebarBrand} onPress={() => router.push(admin ? '/admin' : '/' as any)}>
        <Image source={require('../../assets/logo-mark.png')} style={kit.logoMark} resizeMode="contain" />
        <Text style={kit.wordmark}>fitXball</Text>
        {admin && <WTag label="Admin" tone="limeSoft" />}
      </Pressable>
      <View style={{ gap: 2 }}>
        {nav.map(([iconO, iconF, label, path]) => (
          <NavItem key={path} iconOutline={iconO} iconFilled={iconF} label={label} path={path} active={isActive(path)} />
        ))}
      </View>
      <View style={{ marginTop: 'auto', gap: 14 }}>
        {!admin && credits !== undefined && (
          <View style={kit.creditsCard}>
            <Text style={kit.creditsLabel}>Credits</Text>
            <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
              <Text style={kit.creditsValue}>{credits}</Text>
              <Text style={{ fontSize: 12.5, color: FW.muted }}>cr</Text>
            </View>
            {/* Rendered only when the caller supplies onTopUp, i.e. payments are
                live. A disabled or "coming soon" button is worse than no button:
                App Review treats placeholder UI as incomplete functionality. */}
            {onTopUp && (
              <Pressable
                onPress={onTopUp}
                style={({ hovered }) => [kit.topUpBtn, hovered && { opacity: 0.88 }]}
              >
                <Ionicons name="add-circle-outline" size={14} color="#0C0C0C" />
                <Text style={{ color: '#0C0C0C', fontSize: 13, fontWeight: '800' }}>Top up</Text>
              </Pressable>
            )}
          </View>
        )}
        <View style={kit.userRow}>
          <WAvatar initials={initials} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: FW.text, fontSize: 13.5, fontWeight: '700' }} numberOfLines={1}>
              {profileName ?? '…'}
            </Text>
            {profileUsername ? (
              <Text style={{ color: FW.muted, fontSize: 12 }} numberOfLines={1}>@{profileUsername}</Text>
            ) : null}
          </View>
          <Pressable onPress={onSignOut} hitSlop={8}>
            <Ionicons name="log-out-outline" size={17} color={FW.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function PageTitle({ kicker, title, sub, right }: {
  kicker?: string; title: string; sub?: string; right?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 24, marginBottom: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {kicker ? <Text style={kit.kicker}>{kicker}</Text> : null}
        <Text style={kit.pageTitle}>{title}</Text>
        {sub ? <Text style={kit.pageSub}>{sub}</Text> : null}
      </View>
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 }}>{right}</View> : null}
    </View>
  );
}

// ── auth split shell ─────────────────────────────────────────────────────────
export function AuthBrandPanel() {
  return (
    <View style={kit.brandPanel}>
      <Text style={kit.brandGhost}>fitXball</Text>
      <Text style={kit.brandWordmark}>fitXball</Text>
      <View>
        <Text style={kit.brandHeadline}>Book courts.{'\n'}Find games.{'\n'}Play more.</Text>
        <Text style={kit.brandSub}>
          Reserve a slot, join a pickup match, and keep your crew on the same page.
        </Text>
        <View style={{ marginTop: 28, flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {['Football', 'Padel', 'Basketball', 'Volleyball'].map((s) => (
            <View key={s} style={kit.sportPill}>
              <Text style={kit.sportPillText}>{s}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={kit.brandFooter}>Nairobi · 40+ venues · pay with credits</Text>
    </View>
  );
}

export function AuthShell({ children, footer, formWidth = 400 }: {
  children: React.ReactNode; footer?: React.ReactNode; formWidth?: number;
}) {
  return (
    <View style={kit.authRoot}>
      <AuthBrandPanel />
      <View style={kit.authFormPanel}>
        <View style={{ width: '100%', maxWidth: formWidth }}>{children}</View>
        {footer ? <View style={kit.authFooter}>{footer}</View> : null}
      </View>
    </View>
  );
}

export function AuthHeading({ kicker, title, sub }: { kicker?: string; title: string; sub?: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 32 }}>
      {kicker ? <Text style={kit.kicker}>{kicker}</Text> : null}
      <Text style={kit.authTitle}>{title}</Text>
      {sub ? <Text style={kit.authSub}>{sub}</Text> : null}
    </View>
  );
}

export function LimeLink({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return (
    <Text onPress={onPress} style={{ color: FW.primary, fontWeight: '700' }}>{children}</Text>
  );
}

// ── hover card wrapper ───────────────────────────────────────────────────────
export function HoverCard({ children, onPress, style }: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }) => [
        kit.card,
        hovered && { borderColor: '#3A3A3A' },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const kit = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: FW.primary, borderRadius: 999, flexShrink: 0,
  },
  btnText: { color: '#0C0C0C', fontWeight: '800' },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'transparent', borderWidth: 1, borderRadius: 999, flexShrink: 0,
  },
  ghostBtnText: { fontWeight: '700' },
  tag: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, alignSelf: 'flex-start',
  },
  tagText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, flexShrink: 0,
  },
  chipText: { fontSize: 13.5, fontWeight: '700' },
  label: {
    color: FW.sec, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase',
  },
  statBlock: {
    flex: 1, backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
    borderRadius: 16, paddingVertical: 18, paddingHorizontal: 22,
  },
  statLabel: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: FW.sec,
  },
  statValue: { fontSize: 30, fontWeight: '800', color: FW.text, letterSpacing: -1 },
  dateDivider: {
    fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: FW.sec,
  },
  sidebar: {
    width: 232, flexShrink: 0, backgroundColor: FW.panel,
    borderRightWidth: 1, borderRightColor: FW.borderSoft,
    paddingTop: 28, paddingHorizontal: 16, paddingBottom: 20,
  },
  sidebarBrand: {
    paddingHorizontal: 14, paddingBottom: 28, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  logoMark: { width: 30, height: 30 },
  wordmark: { fontSize: 26, fontWeight: '900', letterSpacing: -1, color: FW.primary, lineHeight: 26 },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, position: 'relative',
  },
  navActiveBar: {
    position: 'absolute', left: -16, top: 8, bottom: 8, width: 3,
    backgroundColor: FW.primary, borderRadius: 2,
  },
  navLabel: { fontSize: 14.5, fontWeight: '500', color: FW.sec, flex: 1 },
  creditsCard: {
    backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
    borderRadius: 14, padding: 16,
  },
  creditsLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: FW.sec,
  },
  creditsValue: { fontSize: 24, fontWeight: '800', color: FW.text, letterSpacing: -0.5 },
  topUpBtn: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: FW.primary, borderRadius: 999, paddingVertical: 8,
  },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderTopWidth: 1, borderTopColor: FW.borderSoft, paddingTop: 16,
    paddingHorizontal: 8, paddingBottom: 10,
  },
  kicker: {
    fontSize: 12.5, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase',
    color: FW.primary, marginBottom: 10,
  },
  pageTitle: { fontSize: 38, fontWeight: '800', letterSpacing: -1, color: FW.text, lineHeight: 40 },
  pageSub: { marginTop: 10, fontSize: 15, color: FW.sec, lineHeight: 22 },
  card: {
    backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border, borderRadius: 18,
    overflow: 'hidden',
  },
  brandPanel: {
    width: '44%', flexShrink: 0, backgroundColor: FW.primary,
    justifyContent: 'space-between', paddingVertical: 44, paddingHorizontal: 48,
    overflow: 'hidden', position: 'relative',
  },
  brandGhost: {
    position: 'absolute', right: -40, bottom: -40,
    fontSize: 170, fontWeight: '900', letterSpacing: -9, lineHeight: 170,
    color: 'rgba(0,0,0,0.07)',
  },
  brandWordmark: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2, color: '#0C0C0C' },
  brandHeadline: { fontSize: 52, fontWeight: '900', letterSpacing: -2, lineHeight: 54, color: '#0C0C0C' },
  brandSub: { marginTop: 18, fontSize: 16, lineHeight: 25, color: 'rgba(0,0,0,0.65)', maxWidth: 360 },
  sportPill: {
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.25)', borderRadius: 999,
    paddingVertical: 7, paddingHorizontal: 16,
  },
  sportPillText: { fontSize: 13, fontWeight: '700', color: '#0C0C0C' },
  brandFooter: { fontSize: 13, color: 'rgba(0,0,0,0.55)' },
  authRoot: { flex: 1, flexDirection: 'row', backgroundColor: FW.bg },
  authFormPanel: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 48, paddingHorizontal: 64, position: 'relative',
  },
  authFooter: { position: 'absolute', bottom: 32 },
  authTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8, color: FW.text, lineHeight: 38 },
  authSub: { marginTop: 12, fontSize: 15, color: FW.sec, lineHeight: 23 },
});
