import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase, type Event } from '@/lib/supabase';
import { formatDateTime } from '@/lib/events';
import { FW, WBtn, WGhostBtn, WTag, StatBlock, PageTitle, useIsDesktopWeb } from '@/components/web/kit';
import { WebShell } from '@/components/web/WebShell';

export default function AdminHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadEvents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });
    if (!error) setEvents(data ?? []);
    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [])
  );

  async function handleDelete(event: Event) {
    Alert.alert(
      'Delete Event',
      `Delete "${event.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('events').delete().eq('id', event.id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setEvents((prev) => prev.filter((e) => e.id !== event.id));
            }
          },
        },
      ]
    );
  }

  const isDesktop = useIsDesktopWeb();
  // Below 1280px the fixed columns starve the flexible Event column — drop Venue
  const showVenue = useWindowDimensions().width >= 1280;

  if (isDesktop) {
    const totalBooked = events.reduce((sum, e) => sum + e.slots_booked, 0);
    const totalSlots = events.reduce((sum, e) => sum + e.slots_available, 0);
    const fillRate = totalSlots > 0 ? Math.round((totalBooked / totalSlots) * 100) : 0;
    const creditsCollected = events.reduce((sum, e) => sum + e.slots_booked * e.cost_in_credits, 0);

    const webDelete = async (event: Event) => {
      if (typeof window !== 'undefined' && window.confirm(`Delete "${event.title}"? This cannot be undone.`)) {
        const { error } = await supabase.from('events').delete().eq('id', event.id);
        if (!error) setEvents((prev) => prev.filter((e) => e.id !== event.id));
      }
    };

    return (
      <WebShell admin maxWidth={1180}>
        <PageTitle
          kicker="Admin"
          title="Overview"
          right={[
            <WGhostBtn key="scan" label="Scan Entry" icon="qr-code-outline" onPress={() => {
              // Scanner needs an event to validate against — use the next upcoming one
              const target = events[0];
              if (!target) {
                if (typeof window !== 'undefined') window.alert('No events yet — add an event before scanning entries.');
                return;
              }
              router.push({
                pathname: '/checkin/scanner',
                params: { eventId: target.id, eventTitle: target.title, eventDate: formatDateTime(target.date, target.time), total: String(target.slots_available) },
              });
            }} />,
            <WBtn key="add" label="Add Event" icon="add" onPress={() => router.push('/admin/add-event')} />,
          ]}
        />
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 24, marginBottom: 28 }}>
          <StatBlock label="Events" value={events.length} />
          <StatBlock label="Bookings" value={totalBooked} />
          <StatBlock label="Fill rate" value={`${fillRate}%`} />
          <StatBlock label="Credits collected" value={creditsCollected.toLocaleString()} suffix="cr" />
        </View>
        {loading ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}>
            <ActivityIndicator color={FW.primary} />
          </View>
        ) : events.length === 0 ? (
          <View style={{
            backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
            borderRadius: 18, paddingVertical: 48, alignItems: 'center',
          }}>
            <Text style={{ color: FW.muted, fontSize: 14 }}>No events yet. Add your first event.</Text>
          </View>
        ) : (
          <View style={{
            backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
            borderRadius: 18, overflow: 'hidden',
          }}>
            {/* Table header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 14, paddingHorizontal: 18,
              borderBottomWidth: 1, borderBottomColor: FW.border, backgroundColor: FW.panel,
            }}>
              {([
                ['Event', undefined],
                ['Sport', 110],
                ['When', 170],
                ...(showVenue ? [['Venue', 150] as const] : []),
                ['Booked', 130],
                ['Actions', 130],
              ] as Array<readonly [string, number | undefined]>).map(([h, w]) => (
                <Text key={h} style={{
                  flex: w === undefined ? 1 : undefined,
                  width: w,
                  paddingHorizontal: 8,
                  textAlign: h === 'Actions' ? 'right' : 'left',
                  fontSize: 11.5, fontWeight: '700', letterSpacing: 0.7,
                  textTransform: 'uppercase', color: FW.muted,
                }}>{h}</Text>
              ))}
            </View>
            {events.map((item, idx) => {
              const full = item.slots_booked >= item.slots_available;
              const pct = item.slots_available > 0 ? Math.round((item.slots_booked / item.slots_available) * 100) : 0;
              return (
                <View key={item.id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 15, paddingHorizontal: 18,
                  borderBottomWidth: idx === events.length - 1 ? 0 : 1, borderBottomColor: FW.borderSoft,
                }}>
                  <Text style={{ flex: 1, paddingHorizontal: 8, fontSize: 14, fontWeight: '700', color: FW.text }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={{ width: 110, paddingHorizontal: 8 }}>
                    <WTag label={item.sport} tone="soft" />
                  </View>
                  <Text style={{ width: 170, paddingHorizontal: 8, color: FW.sec, fontSize: 13.5 }} numberOfLines={1}>
                    {formatDateTime(item.date, item.time)}
                  </Text>
                  {showVenue && (
                    <Text style={{ width: 150, paddingHorizontal: 8, color: FW.sec, fontSize: 13.5 }} numberOfLines={1}>
                      {item.location}
                    </Text>
                  )}
                  <View style={{ width: 130, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, maxWidth: 80, height: 5, borderRadius: 3, backgroundColor: FW.surfaceEl, overflow: 'hidden' }}>
                      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: full ? FW.error : FW.primary }} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: full ? FW.error : FW.sec, fontFamily: FW.mono }}>
                      {item.slots_booked}/{item.slots_available}
                    </Text>
                  </View>
                  <View style={{ width: 130, paddingHorizontal: 8, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                    {([
                      ['pencil-outline', () => router.push(`/admin/edit-event/${item.id}`), FW.sec],
                      ['qr-code-outline', () => router.push({
                        pathname: '/checkin/scanner',
                        params: { eventId: item.id, eventTitle: item.title, eventDate: formatDateTime(item.date, item.time), total: String(item.slots_available) },
                      }), FW.sec],
                      ['trash-outline', () => webDelete(item), FW.error],
                    ] as Array<[any, () => void, string]>).map(([icon, onPress, color], i) => (
                      <TouchableOpacity key={i} style={{
                        width: 32, height: 32, borderRadius: 9, backgroundColor: FW.surfaceEl,
                        alignItems: 'center', justifyContent: 'center',
                      }} onPress={onPress}>
                        <Ionicons name={icon} size={15} color={color} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
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
        <Text style={styles.title}>Admin Panel</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.usersButton}
            onPress={() => router.push('/admin/users')}
            activeOpacity={0.85}
          >
            <Ionicons name="people-outline" size={18} color={Colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.usersButton}
            onPress={() => router.push('/checkin/scanner')}
            activeOpacity={0.85}
          >
            <Ionicons name="qr-code-outline" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/admin/add-event')}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={20} color={Colors.background} />
            <Text style={styles.addButtonText}>Add Event</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No events yet. Tap "Add Event" to create one.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowMeta}>{item.sport}  ·  {item.date}</Text>
                <Text style={styles.rowMeta}>
                  {item.is_free ? 'Free' : `${item.cost_in_credits} credits`}
                </Text>
                <Text
                  style={[
                    styles.rowBooked,
                    item.slots_booked >= item.slots_available && styles.rowBookedFull,
                  ]}
                >
                  {item.slots_booked}/{item.slots_available} booked
                </Text>
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/checkin/scanner',
                      params: {
                        eventId: item.id,
                        eventTitle: item.title,
                        eventDate: item.date,
                        total: String(item.slots_available),
                      },
                    })
                  }
                >
                  <Ionicons name="qr-code-outline" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => router.push(`/admin/edit-event/${item.id}`)}
                >
                  <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
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
  title: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usersButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  addButtonText: {
    color: Colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowInfo: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  rowMeta: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  rowBooked: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  rowBookedFull: {
    color: Colors.error,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
