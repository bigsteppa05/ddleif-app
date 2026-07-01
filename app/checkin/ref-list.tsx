import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase, checkInBooking } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { notify } from '@/lib/ui';
import { FW, WBtn, WGhostBtn, WTag, WAvatar, StatBlock, PageTitle, useIsDesktopWeb } from '@/components/web/kit';
import { WebShell } from '@/components/web/WebShell';

type AttendeeRow = {
  id: string;
  name: string;
  username: string;
  initials: string;
  bookingRef: string;
  checkedIn: boolean;
  checkInTime: string | null;
};

export default function RefListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId, eventTitle, eventDate } =
    useLocalSearchParams<{ eventId: string; eventTitle: string; eventDate: string }>();

  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const isDesktop = useIsDesktopWeb();

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [eventId])
  );

  async function loadList() {
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('id, status, booking_ref, checked_in_at, profiles:user_id(name, username)')
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'checked_in'])
      .order('created_at', { ascending: true });

    if (data) {
      setAttendees(
        data.map((b: any) => {
          const profile = b.profiles ?? {};
          const name = profile.name ?? 'Guest';
          const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
          return {
            id: b.id,
            name,
            username: profile.username ?? '',
            initials,
            bookingRef: b.booking_ref,        // stored in DB, not derived
            checkedIn: b.status === 'checked_in',
            checkInTime: b.checked_in_at      // accurate check-in timestamp
              ? new Date(b.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : null,
          };
        })
      );
    }
    setLoading(false);
  }

  async function handleCheckIn(attendeeId: string) {
    const attendee = attendees.find((a) => a.id === attendeeId);
    if (!attendee) return;

    setCheckingIn(attendeeId);
    // check_in_booking RPC: server validates ownership + idempotency
    const result = await checkInBooking(attendee.bookingRef, eventId ?? '');
    setCheckingIn(null);

    if ('error' in result) {
      if (result.error === 'already_checked_in') {
        // Another admin may have just checked them in — refresh the row silently
        setAttendees((prev) =>
          prev.map((a) =>
            a.id === attendeeId
              ? {
                  ...a,
                  checkedIn: true,
                  checkInTime: result.checked_in_at
                    ? new Date(result.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : null,
                }
              : a
          )
        );
      } else {
        notify('Error', result.error);
      }
      return;
    }

    setAttendees((prev) =>
      prev.map((a) =>
        a.id === attendeeId
          ? {
              ...a,
              checkedIn: true,
              checkInTime: new Date(result.checked_in_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            }
          : a
      )
    );
  }

  const filtered = attendees.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.bookingRef.toLowerCase().includes(search.toLowerCase()) ||
      a.username.toLowerCase().includes(search.toLowerCase())
  );

  const checkedInCount = attendees.filter((a) => a.checkedIn).length;
  const total = attendees.length;

  if (isDesktop) {
    const cols = { ref: 170, time: 130, status: 160 };
    return (
      <WebShell admin maxWidth={1020}>
        <PageTitle
          kicker={`Admin${eventTitle ? ` · ${eventTitle}` : ''}${eventDate ? ` · ${eventDate}` : ''}`}
          title="Entry list"
          sub="Backup check-in when scanning isn't possible."
          right={
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <WGhostBtn
                label="Print"
                icon="download-outline"
                size="sm"
                onPress={() => { if (typeof window !== 'undefined') window.print(); }}
              />
              <WBtn
                label="Scan Mode"
                icon="qr-code-outline"
                size="sm"
                onPress={() =>
                  router.push({
                    pathname: '/checkin/scanner',
                    params: { eventId, eventTitle, eventDate, total: String(total) },
                  })
                }
              />
            </View>
          }
        />
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 22, marginBottom: 24 }}>
          <StatBlock label="Booked" value={total} />
          <StatBlock label="Checked in" value={checkedInCount} />
          <StatBlock label="Outstanding" value={total - checkedInCount} />
        </View>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, width: 300, marginBottom: 18,
          backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
          borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18,
        }}>
          <Ionicons name="search-outline" size={16} color={FW.muted} />
          <TextInput
            style={[{ flex: 1, color: FW.text, fontSize: 14, padding: 0 }, { outlineStyle: 'none' } as any]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or reference…"
            placeholderTextColor={FW.muted}
          />
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
              <Text style={[webStyles.th, { flex: 1 }]}>Player</Text>
              <Text style={[webStyles.th, { width: cols.ref }]}>Booking ref</Text>
              <Text style={[webStyles.th, { width: cols.time }]}>Checked in</Text>
              <Text style={[webStyles.th, { width: cols.status, textAlign: 'right' }]}>Status</Text>
            </View>
            {filtered.length === 0 ? (
              <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                <Text style={{ color: FW.sec, fontSize: 14 }}>
                  {search ? 'No matches found.' : 'No bookings yet.'}
                </Text>
              </View>
            ) : (
              filtered.map((item, idx) => (
                <View key={item.id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 14, paddingHorizontal: 18,
                  borderBottomWidth: idx === filtered.length - 1 ? 0 : 1, borderBottomColor: FW.borderSoft,
                }}>
                  <View style={{ flex: 1, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <WAvatar initials={item.initials} size={34} lime={item.checkedIn} />
                    <Text
                      style={{ fontSize: 14, fontWeight: '700', color: item.checkedIn ? FW.text : FW.sec }}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  </View>
                  <Text style={{
                    width: cols.ref, paddingHorizontal: 8,
                    fontFamily: FW.mono, fontSize: 13, letterSpacing: 1, color: FW.sec,
                  }}>
                    {item.bookingRef}
                  </Text>
                  <Text style={{
                    width: cols.time, paddingHorizontal: 8,
                    fontFamily: FW.mono, fontSize: 13,
                    color: item.checkInTime ? FW.text : FW.muted,
                  }}>
                    {item.checkInTime ?? '—'}
                  </Text>
                  <View style={{ width: cols.status, paddingHorizontal: 8, alignItems: 'flex-end' }}>
                    {item.checkedIn ? (
                      <WTag label="Checked in" tone="limeSoft" />
                    ) : checkingIn === item.id ? (
                      <ActivityIndicator size="small" color={FW.primary} />
                    ) : (
                      <WGhostBtn label="Check in" size="sm" onPress={() => handleCheckIn(item.id)} />
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </WebShell>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Entry List</Text>
          <Text style={styles.headerSub}>
            {eventTitle ?? 'Event'}{eventDate ? ` · ${eventDate}` : ''}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or reference…"
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Counter */}
      <View style={styles.counterRow}>
        <Text style={styles.counterTotal}>{total} booked</Text>
        <Text style={styles.counterChecked}>{checkedInCount} checked in</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {search ? 'No matches found.' : 'No bookings yet.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={[styles.avatar, item.checkedIn && styles.avatarChecked]}>
                <Text style={[styles.avatarText, item.checkedIn && styles.avatarTextChecked]}>
                  {item.initials}
                </Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowRef}>{item.bookingRef}</Text>
              </View>
              {item.checkedIn ? (
                <View style={styles.checkedCol}>
                  <View style={styles.checkedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    <Text style={styles.checkedText}>In</Text>
                  </View>
                  {item.checkInTime ? (
                    <Text style={styles.checkTime}>{item.checkInTime}</Text>
                  ) : null}
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.checkInBtn, checkingIn === item.id && styles.checkInBtnDim]}
                  onPress={() => handleCheckIn(item.id)}
                  disabled={checkingIn === item.id}
                  activeOpacity={0.8}
                >
                  {checkingIn === item.id ? (
                    <ActivityIndicator size="small" color={Colors.textPrimary} />
                  ) : (
                    <Text style={styles.checkInBtnText}>Check in</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const webStyles = StyleSheet.create({
  th: {
    paddingHorizontal: 8,
    fontSize: 11.5, fontWeight: '700', letterSpacing: 0.7,
    textTransform: 'uppercase', color: FW.muted,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14, gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  headerSub: { color: Colors.textSecondary, fontSize: 12 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 0,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  counterRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  counterTotal: {
    color: Colors.textSecondary,
    fontSize: 13, fontWeight: '600',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  counterChecked: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  list: { paddingHorizontal: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21, flexShrink: 0,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarChecked: {
    backgroundColor: `${Colors.primary}1A`,
    borderColor: `${Colors.primary}55`,
  },
  avatarText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '800' },
  avatarTextChecked: { color: Colors.primary },
  rowInfo: { flex: 1, minWidth: 0, gap: 2 },
  rowName: {
    color: Colors.textPrimary, fontSize: 15, fontWeight: '700',
    overflow: 'hidden',
  },
  rowRef: {
    color: Colors.textMuted, fontSize: 12.5,
    fontFamily: 'Courier New', letterSpacing: 0.5,
  },
  checkedCol: { alignItems: 'flex-end', gap: 3 },
  checkedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  checkedText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  checkTime: { color: Colors.textMuted, fontSize: 11 },
  checkInBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
  },
  checkInBtnDim: { opacity: 0.5 },
  checkInBtnText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
});
