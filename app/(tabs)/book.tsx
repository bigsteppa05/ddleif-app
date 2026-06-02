import { useCallback, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Animated,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { EventCard } from '@/components/EventCard';
import { supabase, getUserBookings, type BookingWithEvent } from '@/lib/supabase';
import { getDisplayEvents, normalizeEvent } from '@/lib/events';
import type { Event } from '@/lib/mockData';

type Tab = 'events' | 'bookings';

const todayISO = new Date().toISOString().split('T')[0];

const FILTER_SPORTS = ['Football', 'Padel', 'Basketball', 'Volleyball', 'Hiking', 'Watchparty'];

type ListItem = Event | { type: 'divider'; label: string };

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

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('events');
  const [events, setEvents] = useState<Event[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [bookingItems, setBookingItems] = useState<ListItem[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);

  // Filter state
  const [filterSports, setFilterSports] = useState<string[]>([]);
  const [filterDate, setFilterDate] = useState<'all' | 'today' | 'week' | 'weekend'>('all');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const sheetSlide = useRef(new Animated.Value(300)).current;

  const isFilterActive = filterSports.length > 0 || filterDate !== 'all';

  useFocusEffect(
    useCallback(() => {
      setEventsLoading(true);
      getDisplayEvents().then((data) => {
        setEvents(data);
        setDisplayedEvents(data);
        setEventsLoading(false);
      });

      async function loadBookings() {
        setBookingsLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setBookingItems([]);
          setBookingsLoading(false);
          return;
        }

        const bookings: BookingWithEvent[] = await getUserBookings(user.id);
        const upcoming: Event[] = [];
        const past: Event[] = [];

        for (const b of bookings) {
          if (!b.events) continue;
          const ev = normalizeEvent(b.events);
          if ((b.events.date ?? '') >= todayISO) {
            upcoming.push(ev);
          } else {
            past.push(ev);
          }
        }

        const items: ListItem[] = [...upcoming];
        if (past.length > 0) {
          items.push({ type: 'divider', label: 'Past Events' });
          items.push(...past);
        }
        setBookingItems(items);
        setBookingsLoading(false);
      }
      loadBookings();
    }, [])
  );

  function applyFilters(sports: string[], date: 'all' | 'today' | 'week' | 'weekend') {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let result = events;

    if (sports.length > 0) {
      result = result.filter((e) =>
        sports.some((s) => s.toLowerCase() === (e.sport ?? '').toLowerCase())
      );
    }

    if (date !== 'all') {
      result = result.filter((e) => {
        const raw = (e as Event & { rawDate?: string }).rawDate;
        if (!raw) return false;
        const d = new Date(raw);
        if (date === 'today') return raw === todayStr;
        if (date === 'week') {
          const limit = new Date(now);
          limit.setDate(now.getDate() + 7);
          return d >= now && d <= limit;
        }
        if (date === 'weekend') {
          const limit = new Date(now);
          limit.setDate(now.getDate() + 14);
          const day = d.getDay();
          return d >= now && d <= limit && (day === 0 || day === 6);
        }
        return true;
      });
    }

    setDisplayedEvents(result);
  }

  function openSheet() {
    setFilterSheetVisible(true);
    Animated.spring(sheetSlide, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
  }

  function closeSheet() {
    Animated.timing(sheetSlide, { toValue: 300, duration: 220, useNativeDriver: true }).start(() =>
      setFilterSheetVisible(false)
    );
  }

  const isLoading = activeTab === 'events' ? eventsLoading : bookingsLoading;
  const listData: ListItem[] = activeTab === 'events' ? displayedEvents : bookingItems;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Toggle header */}
      <View style={styles.toggleRow}>
        <View style={styles.togglePills}>
          <TouchableOpacity
            style={[styles.pill, activeTab === 'events' && styles.pillActive]}
            onPress={() => setActiveTab('events')}
          >
            <Text style={[styles.pillText, activeTab === 'events' && styles.pillTextActive]}>
              All Events
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, activeTab === 'bookings' && styles.pillActive]}
            onPress={() => setActiveTab('bookings')}
          >
            <Text style={[styles.pillText, activeTab === 'bookings' && styles.pillTextActive]}>
              My Bookings
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.filterButton} onPress={openSheet}>
          <Ionicons
            name={isFilterActive ? 'options' : 'options-outline'}
            size={20}
            color={isFilterActive ? Colors.primary : Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) => ('id' in item ? item.id : `divider-${i}`)}
          renderItem={({ item, index }) => {
            if ('type' in item) return <SectionDivider label={item.label} />;
            return <EventCard event={item} index={index} />;
          }}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bookmark-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {activeTab === 'bookings' ? 'No bookings yet' : 'No events'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'bookings'
                  ? 'Browse events and book your first session'
                  : isFilterActive
                  ? 'Try adjusting or clearing your filters'
                  : 'Check back soon for new events'}
              </Text>
              {isFilterActive && activeTab === 'events' && (
                <TouchableOpacity
                  onPress={() => { setFilterSports([]); setFilterDate('all'); setDisplayedEvents(events); }}
                  style={styles.clearFiltersBtn}
                >
                  <Text style={styles.clearFiltersText}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Filter bottom sheet */}
      <Modal visible={filterSheetVisible} transparent animationType="none" onRequestClose={closeSheet}>
        <TouchableOpacity style={sheetStyles.backdrop} activeOpacity={1} onPress={closeSheet} />
        <Animated.View
          style={[sheetStyles.sheet, { paddingBottom: insets.bottom + 24, transform: [{ translateY: sheetSlide }] }]}
        >
          <View style={sheetStyles.handle} />

          <Text style={sheetStyles.sectionLabel}>Sport</Text>
          <View style={sheetStyles.chipsRow}>
            <TouchableOpacity
              style={[sheetStyles.chip, filterSports.length === 0 && sheetStyles.chipActive]}
              onPress={() => setFilterSports([])}
            >
              <Text style={[sheetStyles.chipText, filterSports.length === 0 && sheetStyles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {FILTER_SPORTS.map((sport) => {
              const active = filterSports.includes(sport);
              return (
                <TouchableOpacity
                  key={sport}
                  style={[sheetStyles.chip, active && sheetStyles.chipActive]}
                  onPress={() =>
                    setFilterSports((p) => active ? p.filter((s) => s !== sport) : [...p, sport])
                  }
                >
                  <Text style={[sheetStyles.chipText, active && sheetStyles.chipTextActive]}>{sport}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={sheetStyles.sectionLabel}>Date</Text>
          <View style={sheetStyles.chipsRow}>
            {(['today', 'week', 'weekend', 'all'] as const).map((opt) => {
              const labels = { today: 'Today', week: 'This Week', weekend: 'This Weekend', all: 'All' };
              const active = filterDate === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[sheetStyles.chip, active && sheetStyles.chipActive]}
                  onPress={() => setFilterDate(opt)}
                >
                  <Text style={[sheetStyles.chipText, active && sheetStyles.chipTextActive]}>{labels[opt]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={sheetStyles.actions}>
            <TouchableOpacity
              style={sheetStyles.clearBtn}
              onPress={() => {
                setFilterSports([]);
                setFilterDate('all');
                setDisplayedEvents(events);
                closeSheet();
              }}
            >
              <Text style={sheetStyles.clearText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={sheetStyles.applyBtn}
              onPress={() => { applyFilters(filterSports, filterDate); closeSheet(); }}
            >
              <Text style={sheetStyles.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 10,
  },
  togglePills: {
    flexDirection: 'row',
    flex: 1,
    gap: 0,
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 22,
  },
  pillActive: {
    backgroundColor: Colors.primary,
  },
  pillText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  pillTextActive: {
    color: Colors.background,
    fontWeight: '700',
  },
  filterButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  list: {
    paddingHorizontal: 16,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  clearFiltersBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  clearFiltersText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
});

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: Colors.background },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  clearBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 28,
    alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  clearText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '700' },
  applyBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 28,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  applyText: { color: Colors.background, fontSize: 15, fontWeight: '800' },
});
