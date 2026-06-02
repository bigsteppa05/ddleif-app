import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

export default function BookingConfirmedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bookingId, eventId, title, sport, date, time, duration, location } =
    useLocalSearchParams<{
      bookingId: string;
      eventId: string;
      title: string;
      sport: string;
      date: string;
      time: string;
      duration: string;
      location: string;
    }>();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      {/* Check icon */}
      <View style={styles.checkWrap}>
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={42} color={Colors.background} />
        </View>
      </View>

      <Text style={styles.title}>Slot booked!</Text>
      <Text style={styles.subtitle}>
        You're confirmed for this session. Your entry ticket is ready.
      </Text>

      {/* Event summary card */}
      <View style={styles.card}>
        <View style={styles.cardImagePlaceholder}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{sport ?? 'Sport'}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{title ?? 'Event'}</Text>
          <MetaRow icon="calendar-outline">{date ?? ''}</MetaRow>
          {time ? <MetaRow icon="time-outline">{[time, duration].filter(Boolean).join(' · ')}</MetaRow> : null}
          {location ? <MetaRow icon="location-outline">{location}</MetaRow> : null}
        </View>
      </View>

      {/* Actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 32 }]}>
        <TouchableOpacity
          style={styles.ticketBtn}
          onPress={() =>
            router.push({
              pathname: '/booking/ticket',
              params: { bookingId, eventId },
            })
          }
          activeOpacity={0.85}
        >
          <Ionicons name="qr-code-outline" size={20} color={Colors.background} />
          <Text style={styles.ticketBtnText}>View Entry Ticket</Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          You can pull this up anytime from{' '}
          <Text style={styles.noteLink} onPress={() => router.replace('/(tabs)/bookings')}>
            My Bookings
          </Text>
        </Text>

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.85}
        >
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MetaRow({ icon, children }: { icon: React.ComponentProps<typeof Ionicons>['name']; children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={icon} size={16} color={Colors.primary} />
      <Text style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '500' }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  checkWrap: { marginBottom: 22 },
  checkCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 26, fontWeight: '800', letterSpacing: -0.3,
    marginBottom: 10,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 15, lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 28,
  },
  cardImagePlaceholder: {
    height: 88,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'flex-end',
    padding: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeText: {
    color: Colors.background,
    fontSize: 11, fontWeight: '800',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  cardBody: { padding: 16, gap: 12 },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 19, fontWeight: '800',
  },
  actions: { width: '100%', gap: 14, alignItems: 'center' },
  ticketBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 28, paddingVertical: 16,
  },
  ticketBtnText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
  note: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center' },
  noteLink: { color: Colors.primary, fontWeight: '700' },
  homeBtn: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 28, paddingVertical: 14,
    paddingHorizontal: 32,
  },
  homeBtnText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
});
