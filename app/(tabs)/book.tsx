import { useCallback, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Animated, TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { EventCard } from '@/components/EventCard';
import { supabase, getUserBookings, type BookingWithEvent } from '@/lib/supabase';
import { getDisplayEvents, normalizeEvent, formatDateTime } from '@/lib/events';
import type { Event } from '@/lib/mockData';
import { FW, WChip, PageTitle, useIsDesktopWeb } from '@/components/web/kit';
import { WEventCard } from '@/components/web/WEventCard';

type Tab = 'events' | 'bookings';

const todayISO = new Date().toISOString().split('T')[0];

const FILTER_SPORTS = ['Football', 'Padel', 'Basketball', 'Volleyball', 'Hiking', 'Watchparty'];

type ListItem = Event | { type: 'divider'; label: string };
type BookingListItem = BookingWithEvent | { type: 'divider'; label: string };

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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('events');
  const [events, setEvents] = useState<Event[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [bookingItems, setBookingItems] = useState<BookingListItem[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [search, setSearch] = useState('');

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

        const items: BookingListItem[] = [...upcoming];
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

  const searchedEvents = search.trim()
    ? displayedEvents.filter(
        (e) =>
          e.title.toLowerCase().includes(search.toLowerCase()) ||
          e.location.toLowerCase().includes(search.toLowerCase()) ||
          (e.sport ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : displayedEvents;

  const isDesktop = useIsDesktopWeb();

  if (isDesktop) {
    return (
      <View>
        <PageTitle
          title="Explore"
          right={
            <View style={webStyles.searchBar}>
              <Ionicons name="search-outline" size={17} color={FW.muted} />
              <TextInput
                style={webStyles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search events, venues, sports…"
                placeholderTextColor={FW.muted}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color={FW.muted} />
                </TouchableOpacity>
              )}
            </View>
          }
        />
        <View style={webStyles.chipRow}>
          <WChip
            label="All sports"
            active={filterSports.length === 0}
            onPress={() => { setFilterSports([]); applyFilters([], filterDate); }}
          />
          {FILTER_SPORTS.map((sport) => {
            const active = filterSports.includes(sport);
            return (
              <WChip
                key={sport}
                label={sport}
                active={active}
                onPress={() => {
                  const next = active ? filterSports.filter((s) => s !== sport) : [...filterSports, sport];
                  setFilterSports(next);
                  applyFilters(next, filterDate);
                }}
              />
            );
          })}
          <View style={webStyles.chipDivider} />
          <WChip
            label="This weekend"
            icon="calendar-outline"
            active={filterDate === 'weekend'}
            onPress={() => {
              const next = filterDate === 'weekend' ? 'all' : 'weekend';
              setFilterDate(next);
              applyFilters(filterSports, next);
            }}
          />
        </View>
        {eventsLoading ? (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator color={FW.primary} />
          </View>
        ) : searchedEvents.length === 0 ? (
          <View style={webStyles.emptyState}>
            <Ionicons name="search-outline" size={48} color={FW.muted} />
            <Text style={webStyles.emptyTitle}>No events found</Text>
            <Text style={webStyles.emptySub}>
              {search || isFilterActive ? 'Try adjusting your search or filters.' : 'Check back soon for new events.'}
            </Text>
          </View>
        ) : (
          <View style={webStyles.grid}>
            {searchedEvents.map((event) => (
              <View key={event.id} style={webStyles.gridItem}>
                <WEventCard event={event} onPress={() => router.push(`/event/${event.id}`)} />
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

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

      {/* Search bar — events tab only */}
      {activeTab === 'events' && (
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search events…"
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
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : activeTab === 'events' ? (
        <FlatList
          data={searchedEvents}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <EventCard event={item} index={index} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No events found</Text>
              <Text style={styles.emptySubtitle}>
                {search || isFilterActive ? 'Try adjusting your search or filters' : 'Check back soon for new events'}
              </Text>
              {(search || isFilterActive) && (
                <TouchableOpacity
                  onPress={() => { setSearch(''); setFilterSports([]); setFilterDate('all'); setDisplayedEvents(events); }}
                  style={styles.clearFiltersBtn}
                >
                  <Text style={styles.clearFiltersText}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      ) : (
        <FlatList
          data={bookingItems}
          keyExtractor={(item, i) => ('id' in item ? item.id : `divider-${i}`)}
          renderItem={({ item }) => {
            if ('type' in item) return <SectionDivider label={item.label} />;
            if (!item.events) return null;
            const ev = normalizeEvent(item.events);
            const isUpcoming = (item.events.date ?? '') >= todayISO;
            const isCheckedIn = item.status === 'checked_in';
            return (
              <TouchableOpacity
                style={bookingCardStyles.card}
                activeOpacity={0.85}
                onPress={() => router.push(`/event/${item.event_id}`)}
              >
                <View style={bookingCardStyles.top}>
                  <View style={bookingCardStyles.sportBadge}>
                    <Text style={bookingCardStyles.sportText}>{ev.sport}</Text>
                  </View>
                  {isCheckedIn && (
                    <View style={bookingCardStyles.checkedBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={Colors.primary} />
                      <Text style={bookingCardStyles.checkedText}>Checked In</Text>
                    </View>
                  )}
                </View>
                <Text style={bookingCardStyles.title} numberOfLines={2}>{ev.title}</Text>
                <View style={bookingCardStyles.metaRow}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                  <Text style={bookingCardStyles.metaText}>{formatDateTime(ev.date, ev.time)}</Text>
                </View>
                <View style={bookingCardStyles.metaRow}>
                  <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                  <Text style={bookingCardStyles.metaText} numberOfLines={1}>{ev.location}</Text>
                </View>
                {isUpcoming && (
                  <TouchableOpacity
                    style={bookingCardStyles.ticketBtn}
                    activeOpacity={0.8}
                    onPress={() => router.push({ pathname: '/booking/ticket', params: { bookingId: item.id, eventId: item.event_id } })}
                  >
                    <Ionicons name="qr-code-outline" size={14} color={Colors.background} />
                    <Text style={bookingCardStyles.ticketBtnText}>View Ticket</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bookmark-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.emptySubtitle}>Browse events and book your first session</Text>
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

const webStyles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 11, width: 420,
    backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
    borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18,
  },
  searchInput: { flex: 1, color: FW.text, fontSize: 14.5, padding: 0, outlineStyle: 'none' } as any,
  chipRow: {
    flexDirection: 'row', gap: 9, marginTop: 20, marginBottom: 28,
    alignItems: 'center', flexWrap: 'wrap',
  },
  chipDivider: { width: 1, height: 24, backgroundColor: FW.border, marginHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { width: '31.8%', minWidth: 260, flexGrow: 1, maxWidth: '32.5%' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { color: FW.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptySub: { color: FW.sec, fontSize: 14, textAlign: 'center' },
});

const bookingCardStyles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, marginBottom: 10, gap: 7 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sportBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sportText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  checkedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${Colors.primary}1A`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  checkedText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  title: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  ticketBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 9, marginTop: 2 },
  ticketBtnText: { color: Colors.background, fontSize: 13, fontWeight: '800' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
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
