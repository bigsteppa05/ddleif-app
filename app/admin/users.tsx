import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { notify } from '@/lib/ui';
import { supabase, grantCredits, setCheckInPrivilege, type Profile } from '@/lib/supabase';
import { FW, WTag, WAvatar, PageTitle, useIsDesktopWeb } from '@/components/web/kit';
import { WebShell } from '@/components/web/WebShell';

export default function AdminUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantTarget, setGrantTarget] = useState<Profile | null>(null);
  const [grantAmount, setGrantAmount] = useState('');
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setProfiles(data ?? []);
        setLoading(false);
      });
  }, []);

  async function handleGrant() {
    if (!grantTarget) return;
    const amount = parseInt(grantAmount, 10);
    if (!amount || isNaN(amount) || amount === 0) {
      notify('Invalid', 'Enter a non-zero number of credits.');
      return;
    }
    setGranting(true);
    try {
      await grantCredits(grantTarget.id, amount);
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === grantTarget.id ? { ...p, credits: p.credits + amount } : p
        )
      );
      setGrantTarget(null);
      setGrantAmount('');
    } catch (err) {
      notify('Error', String(err));
    } finally {
      setGranting(false);
    }
  }

  function openGrant(profile: Profile) {
    setGrantAmount('');
    setGrantTarget(profile);
  }

  // Grant/revoke the checker privilege (attendance check-in). Optimistic with revert.
  async function toggleChecker(profile: Profile) {
    const next = !profile.can_check_in;
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, can_check_in: next } : p)));
    try {
      await setCheckInPrivilege(profile.id, next);
    } catch (err) {
      setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, can_check_in: !next } : p)));
      notify('Error', String(err));
    }
  }

  const initials = (name: string) =>
    name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  const isDesktop = useIsDesktopWeb();
  const [searchQ, setSearchQ] = useState('');

  if (isDesktop) {
    const filtered = searchQ.trim()
      ? profiles.filter((p) =>
          (p.name ?? '').toLowerCase().includes(searchQ.toLowerCase()) ||
          (p.email ?? '').toLowerCase().includes(searchQ.toLowerCase()) ||
          (p.username ?? '').toLowerCase().includes(searchQ.toLowerCase()))
      : profiles;

    const webGrant = (profile: Profile) => {
      if (typeof window === 'undefined') return;
      const input = window.prompt(`Grant credits to ${profile.name || profile.email} (use negative to deduct):`, '50');
      if (input === null) return;
      const amount = parseInt(input, 10);
      if (!amount || isNaN(amount)) return;
      setGrantTarget(profile);
      grantCredits(profile.id, amount).then(() => {
        setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, credits: p.credits + amount } : p)));
        setGrantTarget(null);
      });
    };

    return (
      <WebShell admin maxWidth={1180}>
        <PageTitle
          kicker="Admin"
          title="Members"
          right={
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, width: 300,
              backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
              borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18,
            }}>
              <Ionicons name="search-outline" size={16} color={FW.muted} />
              <TextInput
                style={{ flex: 1, color: FW.text, fontSize: 14, padding: 0, outlineStyle: 'none' } as any}
                value={searchQ}
                onChangeText={setSearchQ}
                placeholder="Search name, email, @username…"
                placeholderTextColor={FW.muted}
              />
            </View>
          }
        />
        <View style={{ marginTop: 20, marginBottom: 24 }}>
          <WTag label={`All members · ${profiles.length}`} tone="limeSoft" />
        </View>
        {loading ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}>
            <ActivityIndicator color={FW.primary} />
          </View>
        ) : (
          <View style={{
            backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
            borderRadius: 18, overflow: 'hidden',
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 14, paddingHorizontal: 18,
              borderBottomWidth: 1, borderBottomColor: FW.border, backgroundColor: FW.panel,
            }}>
              {(['Member', 'Email', 'Credits', 'Role', ''] as const).map((h, i) => (
                <Text key={i} style={{
                  flex: i === 0 ? 1 : undefined,
                  width: i === 1 ? 220 : i === 2 ? 90 : i === 3 ? 90 : i === 4 ? 90 : undefined,
                  paddingHorizontal: 8,
                  textAlign: i === 2 ? 'right' : 'left',
                  fontSize: 11.5, fontWeight: '700', letterSpacing: 0.7,
                  textTransform: 'uppercase', color: FW.muted,
                }}>{h}</Text>
              ))}
            </View>
            {filtered.map((item, idx) => (
              <View key={item.id} style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 15, paddingHorizontal: 18,
                borderBottomWidth: idx === filtered.length - 1 ? 0 : 1, borderBottomColor: FW.borderSoft,
              }}>
                <View style={{ flex: 1, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <WAvatar initials={initials(item.name)} size={34} lime={item.is_admin} />
                  <View style={{ minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: FW.text }} numberOfLines={1}>
                      {item.name || 'Unnamed'}
                    </Text>
                    {item.username ? (
                      <Text style={{ fontSize: 12.5, color: FW.muted }} numberOfLines={1}>@{item.username}</Text>
                    ) : null}
                  </View>
                </View>
                <Text style={{ width: 220, paddingHorizontal: 8, color: FW.sec, fontSize: 13.5 }} numberOfLines={1}>
                  {item.email}
                </Text>
                <Text style={{
                  width: 90, paddingHorizontal: 8, textAlign: 'right',
                  fontFamily: FW.mono, fontSize: 13.5, color: FW.text,
                }}>
                  {item.credits} cr
                </Text>
                <View style={{ width: 90, paddingHorizontal: 8 }}>
                  {item.is_admin ? (
                    <WTag label="Admin" tone="limeSoft" />
                  ) : (
                    <TouchableOpacity
                      onPress={() => toggleChecker(item)}
                      style={{
                        alignSelf: 'flex-start', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10,
                        borderWidth: 1,
                        borderColor: item.can_check_in ? FW.primary : FW.border,
                        backgroundColor: item.can_check_in ? `${FW.primary}1A` : 'transparent',
                      }}
                    >
                      <Text style={{ color: item.can_check_in ? FW.primary : FW.muted, fontSize: 11.5, fontWeight: '700' }}>
                        Checker
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ width: 90, paddingHorizontal: 8, alignItems: 'flex-end' }}>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      backgroundColor: FW.surfaceEl, borderRadius: 9,
                      paddingVertical: 7, paddingHorizontal: 11,
                    }}
                    onPress={() => webGrant(item)}
                    disabled={grantTarget?.id === item.id}
                  >
                    <Ionicons name="add-circle-outline" size={14} color={FW.primary} />
                    <Text style={{ color: FW.primary, fontSize: 12.5, fontWeight: '700' }}>Grant</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </WebShell>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Manage Users</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No users found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(item.name)}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{item.name || 'Unnamed'}</Text>
                <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                <Text style={styles.credits}>{item.credits} credits</Text>
              </View>
              <View style={{ gap: 6, alignItems: 'flex-end' }}>
                <TouchableOpacity style={styles.grantBtn} onPress={() => openGrant(item)}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.grantBtnText}>Credits</Text>
                </TouchableOpacity>
                {item.is_admin ? (
                  <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '700', paddingRight: 4 }}>Admin</Text>
                ) : (
                  <TouchableOpacity
                    onPress={() => toggleChecker(item)}
                    style={{
                      borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
                      borderColor: item.can_check_in ? Colors.primary : Colors.border,
                      backgroundColor: item.can_check_in ? `${Colors.primary}1A` : 'transparent',
                    }}
                  >
                    <Text style={{ color: item.can_check_in ? Colors.primary : Colors.textMuted, fontSize: 11.5, fontWeight: '700' }}>
                      {item.can_check_in ? 'Checker ✓' : 'Make checker'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Grant Credits Modal */}
      <Modal
        visible={grantTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setGrantTarget(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={styles.modalDismiss} onPress={() => setGrantTarget(null)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Grant Credits</Text>
            {grantTarget ? (
              <Text style={styles.modalSubtitle}>to {grantTarget.name || grantTarget.email}</Text>
            ) : null}
            <TextInput
              style={styles.amountInput}
              value={grantAmount}
              onChangeText={setGrantAmount}
              placeholder="Enter amount (e.g. 50)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setGrantTarget(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, granting && styles.confirmBtnDisabled]}
                onPress={handleGrant}
                disabled={granting}
              >
                {granting ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.confirmBtnText}>Grant</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  list: { paddingHorizontal: 16 },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.background, fontSize: 14, fontWeight: '700' },
  info: { flex: 1, gap: 2 },
  name: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  email: { color: Colors.textSecondary, fontSize: 12 },
  credits: { color: Colors.primary, fontSize: 13, fontWeight: '700', marginTop: 2 },
  grantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  grantBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },
  modalSubtitle: { color: Colors.textSecondary, fontSize: 14, marginTop: -4 },
  amountInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
});
