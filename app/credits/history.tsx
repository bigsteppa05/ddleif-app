import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getUserBookingHistory, type BookingWithEvent } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

function sportIcon(sport: string): React.ComponentProps<typeof Ionicons>['name'] {
  const s = (sport ?? '').toLowerCase();
  if (s.includes('football')) return 'football-outline';
  if (s.includes('basketball')) return 'basketball-outline';
  if (s.includes('tennis') || s.includes('padel')) return 'tennisball-outline';
  if (s.includes('volleyball')) return 'fitness-outline';
  if (s.includes('rugby')) return 'american-football-outline';
  return 'medal-outline';
}

export default function TransactionHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<BookingWithEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const data = await getUserBookingHistory(user.id);
      setBookings(data);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction History</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Bookings section */}
        <Text style={styles.sectionLabel}>Bookings</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="bookmark-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No bookings yet</Text>
          </View>
        ) : (
          bookings.map((booking) => {
            const ev = booking.events;
            const dateBooked = new Date(booking.created_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            const isConfirmed = booking.status === 'confirmed';
            return (
              <View key={booking.id} style={styles.bookingCard}>
                <View style={styles.bookingLeft}>
                  <Ionicons
                    name={sportIcon(ev?.sport ?? '')}
                    size={22}
                    color={Colors.primary}
                    style={styles.sportIcon}
                  />
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingTitle} numberOfLines={1}>
                      {ev?.title ?? 'Unknown Event'}
                    </Text>
                    <Text style={styles.bookingDate}>{dateBooked}</Text>
                  </View>
                </View>
                <View style={styles.bookingRight}>
                  <Text style={styles.creditAmount}>
                    −{ev?.cost_in_credits ?? 0} Credits
                  </Text>
                  <View style={[styles.statusBadge, isConfirmed ? styles.statusConfirmed : styles.statusCancelled]}>
                    <Text style={[styles.statusText, isConfirmed ? styles.statusTextConfirmed : styles.statusTextCancelled]}>
                      {isConfirmed ? 'Confirmed' : 'Cancelled'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}

        {/* Purchases section */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Purchases</Text>
        <View style={styles.comingSoonCard}>
          <Text style={styles.comingSoonText}>Purchase history coming soon</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  content: { paddingHorizontal: 16 },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 10,
  },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
  bookingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bookingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  sportIcon: { flexShrink: 0 },
  bookingInfo: { flex: 1, gap: 3 },
  bookingTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  bookingDate: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  bookingRight: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: 12,
  },
  creditAmount: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusConfirmed: { backgroundColor: '#1A2E00' },
  statusCancelled: { backgroundColor: Colors.surfaceElevated },
  statusText: { fontSize: 11, fontWeight: '600' },
  statusTextConfirmed: { color: Colors.primary },
  statusTextCancelled: { color: Colors.textMuted },
  comingSoonCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  comingSoonText: { color: Colors.textMuted, fontSize: 14 },
});
