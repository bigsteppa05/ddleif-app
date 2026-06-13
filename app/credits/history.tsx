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
import {
  supabase,
  getUserBookingHistory,
  getUserPayments,
  type BookingWithEvent,
  type Payment,
} from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { FW, WTag, PageTitle, useIsDesktopWeb } from '@/components/web/kit';
import { WebShell } from '@/components/web/WebShell';

function sportIcon(sport: string): React.ComponentProps<typeof Ionicons>['name'] {
  const s = (sport ?? '').toLowerCase();
  if (s.includes('football')) return 'football-outline';
  if (s.includes('basketball')) return 'basketball-outline';
  if (s.includes('tennis') || s.includes('padel')) return 'tennisball-outline';
  if (s.includes('volleyball')) return 'fitness-outline';
  if (s.includes('rugby')) return 'american-football-outline';
  return 'medal-outline';
}

type LedgerItem =
  | { kind: 'booking'; date: string; booking: BookingWithEvent }
  | { kind: 'topup'; date: string; payment: Payment };

function formatLedgerDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function TransactionHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<BookingWithEvent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const [bookingData, paymentData] = await Promise.all([
        getUserBookingHistory(user.id),
        getUserPayments(user.id),
      ]);
      setBookings(bookingData);
      setPayments(paymentData);
      setLoading(false);
    }
    load();
  }, []);

  // Single ledger, newest first: bookings spend credits, top-ups add them
  const ledger: LedgerItem[] = [
    ...bookings.map((booking) => ({ kind: 'booking' as const, date: booking.created_at, booking })),
    ...payments.map((payment) => ({
      kind: 'topup' as const,
      date: payment.completed_at ?? payment.created_at,
      payment,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const isDesktop = useIsDesktopWeb();

  if (isDesktop) {
    return (
      <WebShell maxWidth={920}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
        >
          <Ionicons name="arrow-back" size={16} color={FW.sec} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: FW.sec }}>Profile</Text>
        </TouchableOpacity>
        <PageTitle title="Transaction history" />
        {loading ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}>
            <ActivityIndicator color={FW.primary} />
          </View>
        ) : ledger.length === 0 ? (
          <View style={{
            marginTop: 24, backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
            borderRadius: 18, paddingVertical: 48, alignItems: 'center', gap: 10,
          }}>
            <Ionicons name="receipt-outline" size={36} color={FW.muted} />
            <Text style={{ color: FW.muted, fontSize: 14 }}>No transactions yet</Text>
          </View>
        ) : (
          <View style={{
            marginTop: 24, backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
            borderRadius: 18, overflow: 'hidden',
          }}>
            {ledger.map((item, i) => {
              const last = i === ledger.length - 1;
              if (item.kind === 'topup') {
                const { payment } = item;
                return (
                  <View key={payment.id} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 16,
                    paddingVertical: 16, paddingHorizontal: 22,
                    borderBottomWidth: last ? 0 : 1, borderBottomColor: FW.borderSoft,
                  }}>
                    <View style={{
                      width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                      backgroundColor: 'rgba(200,255,0,0.1)', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name="cash-outline" size={19} color={FW.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14.5, fontWeight: '700', color: FW.text }} numberOfLines={1}>
                        Top-up · M-Pesa
                      </Text>
                      <Text style={{ fontSize: 12.5, color: FW.muted, marginTop: 3 }}>
                        {formatLedgerDate(item.date)}{payment.mpesa_receipt ? ` · ${payment.mpesa_receipt}` : ''}
                      </Text>
                    </View>
                    <Text style={{
                      fontSize: 15, fontWeight: '800', fontFamily: FW.mono,
                      color: FW.primary, width: 90, textAlign: 'right',
                    }}>
                      +{payment.credits}
                    </Text>
                  </View>
                );
              }
              const { booking } = item;
              const ev = booking.events;
              const isConfirmed = booking.status === 'confirmed' || booking.status === 'checked_in';
              return (
                <View key={booking.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 16,
                  paddingVertical: 16, paddingHorizontal: 22,
                  borderBottomWidth: last ? 0 : 1, borderBottomColor: FW.borderSoft,
                }}>
                  <View style={{
                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                    backgroundColor: FW.surfaceEl, alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name={sportIcon(ev?.sport ?? '')} size={19} color={FW.sec} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: FW.text }} numberOfLines={1}>
                      {ev?.title ?? 'Unknown Event'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: FW.muted, marginTop: 3 }}>
                      Booked {formatLedgerDate(booking.created_at)} · {booking.booking_ref}
                    </Text>
                  </View>
                  <WTag
                    label={booking.status === 'checked_in' ? 'Checked in' : isConfirmed ? 'Confirmed' : 'Cancelled'}
                    tone={isConfirmed ? 'limeSoft' : 'soft'}
                  />
                  <Text style={{
                    fontSize: 15, fontWeight: '800', fontFamily: FW.mono,
                    color: FW.text, width: 90, textAlign: 'right',
                  }}>
                    −{ev?.cost_in_credits ?? 0}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </WebShell>
    );
  }

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
            const isConfirmed = booking.status === 'confirmed' || booking.status === 'checked_in';
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
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : payments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cash-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No top-ups yet</Text>
          </View>
        ) : (
          payments.map((payment) => (
            <View key={payment.id} style={styles.bookingCard}>
              <View style={styles.bookingLeft}>
                <Ionicons name="cash-outline" size={22} color={Colors.primary} style={styles.sportIcon} />
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingTitle} numberOfLines={1}>Top-up · M-Pesa</Text>
                  <Text style={styles.bookingDate}>
                    {formatLedgerDate(payment.completed_at ?? payment.created_at)}
                    {payment.mpesa_receipt ? ` · ${payment.mpesa_receipt}` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.bookingRight}>
                <Text style={styles.topupAmount}>+{payment.credits} Credits</Text>
              </View>
            </View>
          ))
        )}
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
  topupAmount: {
    color: Colors.primary,
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
});
