import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase, getUserBookings, type BookingWithEvent } from '@/lib/supabase';
import { normalizeEvent, formatDateTime } from '@/lib/events';
import { FW, WBtn, WGhostBtn, WTag, PageTitle, DateDivider, useIsDesktopWeb } from '@/components/web/kit';

const todayISO = new Date().toISOString().split('T')[0];

type ListItem = BookingWithEvent | { type: 'divider'; label: string };

function SectionDivider({ label }: { label: string }) {
  return (
    <View style={dividerStyles.row}>
      <View style={dividerStyles.line} />
      <Text style={dividerStyles.text}>{label}</Text>
      <View style={dividerStyles.line} />
    </View>
  );
}

const dividerStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: Colors.border },
  text: { color: Colors.textMuted, fontSize: 12, fontWeight: '500' },
});

function BookingCard({ booking }: { booking: BookingWithEvent }) {
  const router = useRouter();
  if (!booking.events) return null;
  const ev = normalizeEvent(booking.events);
  const isUpcoming = (booking.events.date ?? '') >= todayISO;
  const isCheckedIn = booking.status === 'checked_in';

  return (
    <TouchableOpacity
      style={cardStyles.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/event/${booking.event_id}`)}
    >
      <View style={cardStyles.top}>
        <View style={cardStyles.sportBadge}>
          <Text style={cardStyles.sportText}>{ev.sport}</Text>
        </View>
        {isCheckedIn && (
          <View style={cardStyles.checkedBadge}>
            <Ionicons name="checkmark-circle" size={13} color={Colors.primary} />
            <Text style={cardStyles.checkedText}>Checked In</Text>
          </View>
        )}
      </View>

      <Text style={cardStyles.title} numberOfLines={2}>{ev.title}</Text>

      <View style={cardStyles.metaList}>
        <View style={cardStyles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
          <Text style={cardStyles.metaText}>{formatDateTime(ev.date, ev.time)}</Text>
        </View>
        <View style={cardStyles.metaRow}>
          <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
          <Text style={cardStyles.metaText} numberOfLines={1}>{ev.location}</Text>
        </View>
        {ev.duration ? (
          <View style={cardStyles.metaRow}>
            <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
            <Text style={cardStyles.metaText}>{ev.duration}</Text>
          </View>
        ) : null}
      </View>

      {isUpcoming && (
        <TouchableOpacity
          style={cardStyles.ticketBtn}
          activeOpacity={0.8}
          onPress={() =>
            router.push({
              pathname: '/booking/ticket',
              params: { bookingId: booking.id, eventId: booking.event_id },
            })
          }
        >
          <Ionicons name="qr-code-outline" size={15} color={Colors.background} />
          <Text style={cardStyles.ticketBtnText}>View Ticket</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sportBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sportText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  checkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${Colors.primary}1A`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  checkedText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  metaList: { gap: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  ticketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 2,
  },
  ticketBtnText: { color: Colors.background, fontSize: 14, fontWeight: '800' },
});

// ── Desktop booking row ───────────────────────────────────────────
function WebBookingRow({ booking, past }: { booking: BookingWithEvent; past?: boolean }) {
  const router = useRouter();
  if (!booking.events) return null;
  const ev = normalizeEvent(booking.events);
  const isCheckedIn = booking.status === 'checked_in';
  const d = new Date(booking.events.date);
  const dow = isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { weekday: 'short' });
  const dom = isNaN(d.getTime()) ? '·' : String(d.getDate());

  return (
    <TouchableOpacity
      style={[webStyles.row, past && { opacity: 0.6 }]}
      activeOpacity={0.85}
      onPress={() => router.push(`/event/${booking.event_id}`)}
    >
      <View style={[webStyles.dateBlock, past && { backgroundColor: FW.surfaceEl }]}>
        <Text style={[webStyles.dateDow, past && { color: FW.muted }]}>{dow}</Text>
        <Text style={[webStyles.dateDom, past && { color: FW.sec }]}>{dom}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={webStyles.rowTitle} numberOfLines={1}>{ev.title}</Text>
        <View style={{ marginTop: 6, flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
          <Text style={webStyles.rowMeta}>{formatDateTime(ev.date, ev.time)}</Text>
          <Text style={webStyles.rowMeta}>{ev.location}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <WTag label={isCheckedIn ? 'Checked in' : 'Confirmed'} tone={isCheckedIn ? 'soft' : 'limeSoft'} />
        {!past && (
          <WGhostBtn
            label="Ticket" icon="qr-code-outline" size="sm"
            onPress={() => router.push({ pathname: '/booking/ticket', params: { bookingId: booking.id, eventId: booking.event_id } })}
          />
        )}
        <Ionicons name="chevron-forward" size={17} color={FW.muted} />
      </View>
    </TouchableOpacity>
  );
}

const webStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 22,
    backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
    borderRadius: 16, paddingVertical: 18, paddingHorizontal: 24, marginBottom: 12,
  },
  dateBlock: {
    width: 62, height: 62, borderRadius: 14, flexShrink: 0,
    backgroundColor: FW.primary, alignItems: 'center', justifyContent: 'center',
  },
  dateDow: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase',
    color: 'rgba(0,0,0,0.55)',
  },
  dateDom: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: '#0C0C0C', lineHeight: 28 },
  rowTitle: { fontSize: 16.5, fontWeight: '800', color: FW.text, letterSpacing: -0.2 },
  rowMeta: { color: FW.sec, fontSize: 13.5 },
  emptyCard: {
    marginTop: 28, borderWidth: 1.5, borderColor: FW.border, borderStyle: 'dashed',
    borderRadius: 20, paddingVertical: 72, paddingHorizontal: 32, alignItems: 'center',
  },
  emptyIcon: {
    width: 76, height: 76, borderRadius: 22, backgroundColor: FW.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { marginTop: 22, fontSize: 21, fontWeight: '800', color: FW.text, letterSpacing: -0.3 },
  emptySub: {
    marginTop: 10, fontSize: 14.5, color: FW.sec, lineHeight: 22,
    maxWidth: 360, textAlign: 'center',
  },
});

export default function BookingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isDesktop = useIsDesktopWeb();
  const [listData, setListData] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setListData([]); setLoading(false); return; }

        const bookings: BookingWithEvent[] = await getUserBookings(user.id);
        const upcoming: BookingWithEvent[] = [];
        const past: BookingWithEvent[] = [];

        for (const b of bookings) {
          if (!b.events) continue;
          if ((b.events.date ?? '') >= todayISO) {
            upcoming.push(b);
          } else {
            past.push(b);
          }
        }

        const items: ListItem[] = [...upcoming];
        if (past.length > 0) {
          items.push({ type: 'divider', label: 'Past Events' });
          items.push(...past);
        }

        setListData(items);
        setLoading(false);
      }
      load();
    }, [])
  );

  if (isDesktop) {
    const upcoming = listData.filter((i): i is BookingWithEvent => 'id' in i && (i.events?.date ?? '') >= todayISO);
    const past = listData.filter((i): i is BookingWithEvent => 'id' in i && (i.events?.date ?? '') < todayISO);

    return (
      <View>
        <PageTitle
          title="My Bookings"
          sub="Your tickets and game history, all in one place."
          right={<WBtn label="Find a Game" icon="search" onPress={() => router.push('/(tabs)/book')} />}
        />
        {loading ? (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator color={FW.primary} />
          </View>
        ) : listData.length === 0 ? (
          <View style={webStyles.emptyCard}>
            <View style={webStyles.emptyIcon}>
              <Ionicons name="ticket-outline" size={34} color={FW.muted} />
            </View>
            <Text style={webStyles.emptyTitle}>No games booked yet</Text>
            <Text style={webStyles.emptySub}>
              When you book a slot, your ticket will show up here.
            </Text>
            <WBtn label="Explore Events" icon="compass-outline" onPress={() => router.push('/(tabs)/book')} style={{ marginTop: 26 }} />
          </View>
        ) : (
          <View style={{ marginTop: 24, gap: 0 }}>
            {upcoming.length > 0 && <DateDivider label="Upcoming" />}
            {upcoming.map((b) => <WebBookingRow key={b.id} booking={b} />)}
            {past.length > 0 && <View style={{ height: 10 }} />}
            {past.length > 0 && <DateDivider label="Past events" />}
            {past.map((b) => <WebBookingRow key={b.id} booking={b} past />)}
          </View>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>My Bookings</Text>
      </View>

      {listData.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptySubtitle}>Browse events and book your first session</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) => ('id' in item ? item.id : `divider-${i}`)}
          renderItem={({ item }) => {
            if ('type' in item) return <SectionDivider label={item.label} />;
            return <BookingCard booking={item} />;
          }}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800' },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingBottom: 80,
  },
  emptyTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptySubtitle: {
    color: Colors.textSecondary, fontSize: 14,
    textAlign: 'center', paddingHorizontal: 40,
  },
});
