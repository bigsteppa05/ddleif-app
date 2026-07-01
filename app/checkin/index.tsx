import { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { getDisplayEvents } from '@/lib/events';
import type { Event } from '@/lib/mockData';

// Checker home: pick an event, then scan tickets / cross-reference the entry list.
export default function CheckinHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getDisplayEvents().then((data) => {
        if (active) {
          setEvents(data);
          setLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }, [])
  );

  function openEvent(event: Event) {
    router.push({
      pathname: '/checkin/scanner',
      params: {
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.date,
        total: String(event.slots_booked),
      },
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Check in</Text>
          <Text style={styles.subtitle}>Pick an event to scan tickets or mark attendance</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No events to check in yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openEvent(item)}>
              <View style={styles.cardIcon}>
                <Ionicons name="qr-code-outline" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.date}{item.sport ? ` · ${item.sport}` : ''}
                </Text>
                <Text style={styles.cardCount}>{item.slots_booked} booked</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 16,
    width: '100%', maxWidth: 680, alignSelf: 'center',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  list: { paddingHorizontal: 16, width: '100%', maxWidth: 680, alignSelf: 'center', gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, padding: 16,
  },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardTitle: { color: Colors.textPrimary, fontSize: 15.5, fontWeight: '700' },
  cardMeta: { color: Colors.textSecondary, fontSize: 13, marginTop: 3 },
  cardCount: { color: Colors.primary, fontSize: 12.5, fontWeight: '700', marginTop: 5 },
});
