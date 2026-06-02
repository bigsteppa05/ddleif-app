import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { EventCard } from '@/components/EventCard';
import { supabase, getUserBookings, type BookingWithEvent } from '@/lib/supabase';
import { normalizeEvent } from '@/lib/events';
import type { Event } from '@/lib/mockData';

const todayISO = new Date().toISOString().split('T')[0];

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

export default function BookingsScreen() {
  const insets = useSafeAreaInsets();
  const [listData, setListData] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setListData([]);
          setLoading(false);
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

        setListData(items);
        setLoading(false);
      }
      load();
    }, [])
  );

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
          renderItem={({ item, index }) => {
            if ('type' in item) return <SectionDivider label={item.label} />;
            return <EventCard event={item} index={index} />;
          }}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
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
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 80,
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
});
