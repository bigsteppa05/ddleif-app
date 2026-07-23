import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, Switch, StyleSheet,
  Alert, ActivityIndicator, Image, Modal, Animated, Share, Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getNotificationPermissionStatus, requestNotificationPermission } from '@/lib/notifications';
import { Colors } from '@/constants/colors';
import { useAppConfig } from '@/components/AppConfigProvider';
import { supabase, getUserProfile, checkIsAdmin, updateProfile, type Profile } from '@/lib/supabase';
import { GENDERS, COUNTRIES } from '@/lib/options';
import { FW, WBtn, WGhostBtn, WAvatar, PageTitle, useIsDesktopWeb } from '@/components/web/kit';

// ── Desktop settings primitives ───────────────────────────────────
function WebSettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={webStyles.groupTitle}>{title}</Text>
      <View style={webStyles.groupCard}>{children}</View>
    </View>
  );
}

function WebSettingsRow({ label, value, toggle, on, danger, last, onPress }: {
  label: string; value?: string; toggle?: boolean; on?: boolean;
  danger?: boolean; last?: boolean; onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[webStyles.settingsRow, !last && { borderBottomWidth: 1, borderBottomColor: FW.borderSoft }]}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <Text style={[webStyles.settingsLabel, danger && { color: FW.error }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {value ? <Text style={{ fontSize: 14, color: FW.sec }}>{value}</Text> : null}
        {toggle ? (
          <View style={[webStyles.toggle, { backgroundColor: on ? FW.primary : FW.surfaceEl, justifyContent: on ? 'flex-end' : 'flex-start' }]}>
            <View style={[webStyles.toggleKnob, { backgroundColor: on ? '#0C0C0C' : FW.muted }]} />
          </View>
        ) : !danger ? (
          <Ionicons name="chevron-forward" size={15} color={FW.muted} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const webStyles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 24, marginTop: 24, alignItems: 'flex-start' },
  identityCard: {
    backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border, borderRadius: 20,
    paddingVertical: 32, paddingHorizontal: 28, alignItems: 'center',
  },
  identityName: { marginTop: 18, fontSize: 21, fontWeight: '800', color: FW.text, letterSpacing: -0.3 },
  identityHandle: { marginTop: 4, fontSize: 14, color: FW.sec },
  identityStats: {
    marginTop: 22, flexDirection: 'row', width: '100%',
    borderTopWidth: 1, borderTopColor: FW.borderSoft, paddingTop: 20,
  },
  identityStat: { flex: 1, alignItems: 'center' },
  identityStatValue: { fontSize: 19, fontWeight: '800', color: FW.text },
  identityStatLabel: { fontSize: 12, color: FW.muted, marginTop: 2 },
  creditsCard: {
    backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border, borderRadius: 20,
    paddingVertical: 22, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 16,
  },
  creditsIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: FW.limeSoftBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  settingsGrid: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start',
  },
  groupTitle: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
    color: FW.sec, marginHorizontal: 4, marginBottom: 10,
  },
  groupCard: {
    backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
    borderRadius: 16, overflow: 'hidden', minWidth: 280,
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 15, paddingHorizontal: 20,
  },
  settingsLabel: { fontSize: 14.5, fontWeight: '600', color: FW.text },
  toggle: { width: 44, height: 26, borderRadius: 13, padding: 3 },
  toggleKnob: { width: 20, height: 20, borderRadius: 10 },
});

function MenuRow({
  label,
  right,
  onPress,
}: {
  label: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={menuStyles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Text style={menuStyles.label}>{label}</Text>
      <View style={menuStyles.right}>
        {right ?? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />}
      </View>
    </TouchableOpacity>
  );
}

const menuStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});

function Avatar({ profile }: { profile: Profile }) {
  const initials = profile.name
    ? profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  if (profile.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={avatarStyles.image} />;
  }
  return (
    <View style={avatarStyles.initials}>
      <Text style={avatarStyles.initialsText}>{initials}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  image: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  initials: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: Colors.background,
    fontSize: 28,
    fontWeight: '800',
  },
});

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isDesktop = useIsDesktopWeb();
  const config = useAppConfig();
  const [notifications, setNotifications] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [langSheetVisible, setLangSheetVisible] = useState(false);
  const langSlide = useRef(new Animated.Value(300)).current;

  async function loadProfile() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return;
      setUserId(user.id);
      const [data, adminFlag] = await Promise.all([
        getUserProfile(user.id),
        checkIsAdmin(),
      ]);
      setProfile(data);
      setIsAdmin(adminFlag);

      const status = await getNotificationPermissionStatus();
      setNotifications(status === 'granted' ? (data?.notifications_enabled ?? false) : false);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  async function handleNotificationToggle(value: boolean) {
    if (!userId) return;
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Notifications Blocked',
          'Enable notifications for fitXball in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
    }
    setNotifications(value);
    await updateProfile(userId, { notifications_enabled: value });
  }

  function openLangSheet() {
    setLangSheetVisible(true);
    Animated.spring(langSlide, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
  }

  function closeLangSheet() {
    Animated.timing(langSlide, { toValue: 300, duration: 220, useNativeDriver: true }).start(() =>
      setLangSheetVisible(false)
    );
  }

  const joinedYear = profile?.created_at
    ? new Date(profile.created_at).getFullYear()
    : '';

  const genderLabel = GENDERS.find((g) => g.value === profile?.gender)?.label;
  const countryLabel = COUNTRIES.find((c) => c.value === profile?.country)?.label;

  const age = (() => {
    if (!profile?.date_of_birth) return null;
    const parts = profile.date_of_birth.split('-');
    if (parts.length < 3) return null;
    const dob = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const today = new Date();
    let a = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) a--;
    return a > 0 ? a : null;
  })();

  if (isDesktop) {
    const initials = profile?.name
      ? profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
      : '?';
    // Alert.alert is a no-op on web — confirm destructive actions with window.confirm.
    const webSignOut = async () => {
      if (typeof window !== 'undefined' && window.confirm('Sign out of fitXball?')) {
        await supabase.auth.signOut();
        router.replace('/(auth)/login');
      }
    };
    return (
      <View>
        <PageTitle title="Profile" />
        {loading ? (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator color={FW.primary} />
          </View>
        ) : (
          <View style={webStyles.grid}>
            {/* Left: identity + credits */}
            <View style={{ width: 340, gap: 16 }}>
              <View style={webStyles.identityCard}>
                <WAvatar initials={initials} size={88} />
                <Text style={webStyles.identityName}>{profile?.name || '—'}</Text>
                <Text style={webStyles.identityHandle}>
                  {profile?.username ? `@${profile.username}` : profile?.email}{countryLabel ? ` · ${countryLabel}` : ''}
                </Text>
                <View style={webStyles.identityStats}>
                  {[
                    [String(profile?.credits ?? 0), 'credits'],
                    [age ? String(age) : '—', 'age'],
                    [String(joinedYear || '—'), 'joined'],
                  ].map(([n, l], i) => (
                    <View key={l} style={[webStyles.identityStat, i > 0 && { borderLeftWidth: 1, borderLeftColor: FW.borderSoft }]}>
                      <Text style={webStyles.identityStatValue}>{n}</Text>
                      <Text style={webStyles.identityStatLabel}>{l}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={webStyles.creditsCard}>
                <View style={webStyles.creditsIcon}>
                  <Ionicons name="server-outline" size={23} color={FW.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15.5, fontWeight: '800', color: FW.text }}>{profile?.credits ?? 0} credits</Text>
                  <Text style={{ fontSize: 12.5, color: FW.sec, marginTop: 2 }}>1 credit = KES {config.kes_per_credit}</Text>
                </View>
                <WBtn label="Top up" size="sm" onPress={() => router.push('/credits/topup')} />
              </View>
            </View>

            {/* Right: settings groups */}
            <View style={webStyles.settingsGrid}>
              <WebSettingsGroup title="Account">
                <WebSettingsRow label="Personal info" onPress={() => router.push('/profile/edit')} last />
              </WebSettingsGroup>
              <WebSettingsGroup title="Preferences">
                <WebSettingsRow
                  label="Notifications"
                  toggle
                  on={notifications}
                  onPress={() => handleNotificationToggle(!notifications)}
                  last
                />
              </WebSettingsGroup>
              <WebSettingsGroup title="Credits">
                <WebSettingsRow label="Top up credits" onPress={() => router.push('/credits/topup')} />
                <WebSettingsRow label="Transaction history" onPress={() => router.push('/credits/history')} last />
              </WebSettingsGroup>
              {(isAdmin || profile?.can_check_in) && (
                <WebSettingsGroup title="Attendance">
                  <WebSettingsRow label="Check in" onPress={() => router.push('/checkin')} last />
                </WebSettingsGroup>
              )}
              {isAdmin && (
                <WebSettingsGroup title="Admin">
                  <WebSettingsRow label="Admin dashboard" onPress={() => router.push('/admin')} last />
                </WebSettingsGroup>
              )}
              <WebSettingsGroup title="Support">
                <WebSettingsRow label="Terms & privacy" onPress={() => router.push('/legal/terms')} last />
              </WebSettingsGroup>
              <WebSettingsGroup title="Session">
                <WebSettingsRow label="Sign out" danger onPress={webSignOut} />
                <WebSettingsRow label="Delete account" danger onPress={() => router.push('/profile/delete-account')} last />
              </WebSettingsGroup>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Profile</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Avatar + info */}
            <View style={styles.avatarSection}>
              {profile && <Avatar profile={profile} />}
              <Text style={styles.name}>{profile?.name ?? '—'}</Text>
              {profile?.username ? (
                <Text style={styles.username}>@{profile.username}</Text>
              ) : null}
              {profile?.email ? (
                <Text style={styles.email}>{profile.email}</Text>
              ) : null}
              {(genderLabel || countryLabel || age) ? (
                <Text style={styles.meta}>
                  {[genderLabel, countryLabel, age ? `${age} yrs` : null].filter(Boolean).join('  ·  ')}
                </Text>
              ) : null}
              {joinedYear ? <Text style={styles.joined}>Joined {joinedYear}</Text> : null}
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => router.push('/profile/edit')}
              >
                <Text style={styles.editButtonText}>Personal Info</Text>
              </TouchableOpacity>
            </View>

            {/* Account section */}
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.card}>
              <View style={styles.creditsRow}>
                <Text style={styles.creditsKey}>Balance</Text>
                <Text style={styles.creditsVal}>{profile?.credits ?? 0} Credits</Text>
              </View>
              <TouchableOpacity
                style={styles.topUpButton}
                onPress={() => router.push('/credits/topup')}
                activeOpacity={0.85}
              >
                <Text style={styles.topUpText}>Top Up Account</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <MenuRow
                label="Transaction History"
                onPress={() => router.push('/credits/history')}
              />
              <View style={styles.divider} />
              <MenuRow
                label="Notifications"
                right={
                  <Switch
                    value={notifications}
                    onValueChange={handleNotificationToggle}
                    trackColor={{ false: Colors.border, true: Colors.primary }}
                    thumbColor={Colors.background}
                  />
                }
              />
              <View style={styles.divider} />
              <MenuRow
                label="Invite Friends"
                onPress={() =>
                  Share.share({
                    message:
                      "I'm using fitXball for sports events in Nairobi — join me. Download the app: https://fitxball.app/download",
                  })
                }
              />
            </View>

            {/* Settings section */}
            <Text style={styles.sectionLabel}>Settings</Text>
            <View style={styles.card}>
              <MenuRow
                label="Language"
                right={<Text style={styles.rowValue}>English</Text>}
                onPress={openLangSheet}
              />
              <View style={styles.divider} />
              <MenuRow
                label="Terms of Service"
                onPress={() => router.push('/legal/terms')}
              />
              <View style={styles.divider} />
              <MenuRow
                label="Privacy Policy"
                onPress={() => router.push('/legal/privacy')}
              />
              <View style={styles.divider} />
              <MenuRow
                label="Help"
                onPress={() =>
                  Linking.openURL('mailto:support@fitXball.app?subject=fitXball%20Support%20Request')
                }
              />
              {(isAdmin || profile?.can_check_in) && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity style={menuStyles.row} onPress={() => router.push('/checkin')}>
                    <Text style={[menuStyles.label, { color: Colors.primary }]}>Check in</Text>
                    <Ionicons name="qr-code-outline" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </>
              )}
              {isAdmin && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity style={menuStyles.row} onPress={() => router.push('/admin')}>
                    <Text style={[menuStyles.label, { color: Colors.primary }]}>Admin Panel</Text>
                    <Ionicons name="shield-outline" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </>
              )}
              <View style={styles.divider} />
              <TouchableOpacity style={menuStyles.row} onPress={handleSignOut}>
                <Text style={[menuStyles.label, { color: Colors.primary }]}>Sign Out</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={menuStyles.row} onPress={() => router.push('/profile/delete-account')}>
                <Text style={[menuStyles.label, { color: Colors.error }]}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.version}>Version 1.0.0 (1)</Text>
      </ScrollView>

      {/* Language bottom sheet */}
      <Modal visible={langSheetVisible} transparent animationType="none" onRequestClose={closeLangSheet}>
        <TouchableOpacity style={langStyles.backdrop} activeOpacity={1} onPress={closeLangSheet} />
        <Animated.View
          style={[langStyles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: langSlide }] }]}
        >
          <View style={langStyles.handle} />
          <Text style={langStyles.title}>Language</Text>
          <TouchableOpacity style={langStyles.row} activeOpacity={0.7}>
            <Text style={langStyles.langText}>English</Text>
            <Ionicons name="checkmark" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16 },
  screenTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
  },
  loadingBox: { paddingVertical: 80, alignItems: 'center' },
  avatarSection: { alignItems: 'center', marginBottom: 28, gap: 5 },
  name: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700', marginTop: 10 },
  username: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  email: { color: Colors.textSecondary, fontSize: 13 },
  meta: { color: Colors.textSecondary, fontSize: 13 },
  joined: { color: Colors.textMuted, fontSize: 12 },
  editButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 9,
    marginTop: 8,
  },
  editButtonText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  sectionLabel: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 24,
    overflow: 'hidden',
  },
  creditsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  creditsKey: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  creditsVal: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  topUpButton: {
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  topUpText: { color: Colors.background, fontSize: 15, fontWeight: '700' },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 },
  rowValue: { color: Colors.textSecondary, fontSize: 14 },
  version: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 },
});

const langStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  langText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '500' },
  divider: { height: 1, backgroundColor: Colors.border },
});
