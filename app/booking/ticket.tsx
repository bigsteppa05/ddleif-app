import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/events';
import { Colors } from '@/constants/colors';
import { FW, WTag, useIsDesktopWeb } from '@/components/web/kit';
import { WebShell } from '@/components/web/WebShell';

type TicketData = {
  bookingRef: string;
  eventTitle: string;
  sport: string;
  date: string;
  time: string;
  duration: string;
  location: string;
};

export default function TicketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const { bookingId, eventId } = useLocalSearchParams<{ bookingId: string; eventId: string }>();

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('bookings')
        .select('booking_ref, events(*)')   // read stored ref, not derived
        .eq('id', bookingId)
        .maybeSingle();

      if (data && data.events && data.booking_ref) {
        const ev = data.events as any;
        setTicket({
          bookingRef: data.booking_ref,     // authoritative, server-generated
          eventTitle: ev.title,
          sport: ev.sport,
          date: ev.date,
          time: ev.time ?? '',
          duration: ev.duration ?? '',
          location: ev.location,
        });
      }
      setLoading(false);
    }
    load();
  }, [bookingId]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={{ color: Colors.textPrimary, padding: 24 }}>Ticket not found.</Text>
      </View>
    );
  }

  // QR encodes only the booking_ref — scanner uses its own eventId for ownership check
  const qrValue = `https://fitxball.app/t/${ticket.bookingRef}`;

  if (isDesktop) {
    return (
      <WebShell>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/bookings'))}
        >
          <Ionicons name="arrow-back" size={16} color={FW.sec} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: FW.sec }}>My Bookings</Text>
        </TouchableOpacity>
        <View style={{
          flex: 1, flexDirection: 'row', gap: 40,
          alignItems: 'center', justifyContent: 'center', paddingVertical: 40,
        }}>
          {/* White ticket */}
          <View style={{
            width: 360, backgroundColor: '#fff', borderRadius: 22, overflow: 'hidden',
            boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
          } as any}>
            <View style={{
              paddingTop: 22, paddingHorizontal: 26, paddingBottom: 18,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.8, color: '#0C0C0C' }}>fitXball</Text>
              <WTag label="Entry ticket" tone="lime" />
            </View>
            <View style={{ paddingHorizontal: 26, paddingBottom: 20 }}>
              <Text style={{ fontSize: 21, fontWeight: '800', color: '#111', letterSpacing: -0.4 }}>
                {ticket.eventTitle}
              </Text>
              <View style={{ marginTop: 10, gap: 6 }}>
                {([
                  [formatDateTime(ticket.date, ticket.time), 'calendar-outline'],
                  [ticket.location, 'location-outline'],
                ] as Array<[string, any]>).map(([t, ic]) => (
                  <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name={ic} size={15} color="#999" />
                    <Text style={{ fontSize: 13.5, color: '#555' }}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ marginHorizontal: 18, borderTopWidth: 2, borderStyle: 'dashed', borderColor: '#D8D8D8' }} />
            <View style={{ paddingTop: 24, paddingHorizontal: 26, paddingBottom: 26, alignItems: 'center', gap: 14 }}>
              <QRCode value={qrValue} size={188} color="#000000" backgroundColor="#ffffff" />
              <View style={{ alignItems: 'center' }}>
                <Text style={{
                  fontSize: 11, fontWeight: '700', letterSpacing: 1,
                  textTransform: 'uppercase', color: '#999',
                }}>Booking reference</Text>
                <Text style={{
                  fontSize: 21, fontWeight: '800', color: '#111', letterSpacing: 2,
                  marginTop: 4, fontFamily: FW.mono,
                }}>{ticket.bookingRef}</Text>
              </View>
            </View>
          </View>
          {/* Side info */}
          <View style={{ width: 320, gap: 22 }}>
            <View>
              <Text style={{ fontSize: 26, fontWeight: '800', color: FW.text, letterSpacing: -0.6, lineHeight: 31 }}>
                Show this at{'\n'}the gate.
              </Text>
              <Text style={{ marginTop: 12, fontSize: 14.5, color: FW.sec, lineHeight: 23 }}>
                The organiser scans your QR to check you in. Screenshot a copy in case the
                signal at the venue is patchy.
              </Text>
            </View>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingVertical: 14, paddingHorizontal: 18,
              backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border, borderRadius: 14,
            }}>
              <View style={{
                width: 8, height: 8, borderRadius: 4, backgroundColor: FW.primary, flexShrink: 0,
              }} />
              <Text style={{ fontSize: 13, color: FW.sec }}>Arrive 15 minutes early for check-in</Text>
            </View>
          </View>
        </View>
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
        <Text style={styles.headerTitle}>Entry Ticket</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Ticket card */}
        <View style={styles.ticketCard}>
          {/* Dark top — event info */}
          <View style={styles.ticketTop}>
            <View style={styles.sportBadge}>
              <Text style={styles.sportBadgeText}>{ticket.sport} · {ticket.duration}</Text>
            </View>
            <Text style={styles.ticketTitle}>{ticket.eventTitle}</Text>

            <View style={styles.metaList}>
              <MetaRow icon="calendar-outline">
                {formatDateTime(ticket.date, ticket.time)}
              </MetaRow>
              {ticket.duration ? (
                <MetaRow icon="time-outline">{ticket.duration}</MetaRow>
              ) : null}
              <MetaRow icon="location-outline">{ticket.location}</MetaRow>
            </View>
          </View>

          {/* Perforated divider */}
          <View style={styles.perforation}>
            <View style={styles.notchLeft} />
            <View style={styles.dashedLine} />
            <View style={styles.notchRight} />
          </View>

          {/* White bottom — QR code */}
          <View style={styles.ticketBottom}>
            <View style={styles.qrWrap}>
              <QRCode
                value={qrValue}
                size={196}
                color="#000000"
                backgroundColor="#ffffff"
              />
            </View>

            <View style={styles.refSection}>
              <Text style={styles.refLabel}>Booking Reference</Text>
              <Text style={styles.refCode}>{ticket.bookingRef}</Text>
            </View>

            <View style={styles.scanHint}>
              <Ionicons name="eye-outline" size={15} color="#555" />
              <Text style={styles.scanHintText}>Show this at the entrance to check in</Text>
            </View>
          </View>
        </View>

        {/* Offline note */}
        <View style={styles.offlineNote}>
          <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.offlineText}>Screenshot or save — works offline at the gate</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function MetaRow({ icon, children }: { icon: React.ComponentProps<typeof Ionicons>['name']; children: string }) {
  return (
    <View style={metaStyles.row}>
      <Ionicons name={icon} size={16} color={Colors.primary} />
      <Text style={metaStyles.text}>{children}</Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { color: Colors.textPrimary, fontSize: 14, fontWeight: '500' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  scroll: { paddingHorizontal: 22, paddingTop: 16 },
  ticketCard: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 25,
    elevation: 16,
  },
  ticketTop: {
    backgroundColor: Colors.surface,
    padding: 22,
    paddingBottom: 26,
    gap: 14,
  },
  sportBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sportBadgeText: {
    color: Colors.background,
    fontSize: 11, fontWeight: '800',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  ticketTitle: {
    color: Colors.textPrimary,
    fontSize: 22, fontWeight: '800', letterSpacing: -0.3,
  },
  metaList: { gap: 11 },
  perforation: {
    height: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  notchLeft: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.background,
    position: 'absolute', left: -11,
  },
  notchRight: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.background,
    position: 'absolute', right: -11,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    marginHorizontal: 16,
    borderStyle: 'dashed',
    borderTopWidth: 2,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  ticketBottom: {
    backgroundColor: '#ffffff',
    padding: 26,
    paddingTop: 22,
    alignItems: 'center',
    gap: 14,
  },
  qrWrap: {
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  refSection: { alignItems: 'center', gap: 4 },
  refLabel: {
    fontSize: 12, color: '#777',
    letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '600',
  },
  refCode: {
    fontSize: 20, fontWeight: '800', color: '#111',
    letterSpacing: 2, fontFamily: 'Courier New',
  },
  scanHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 2,
  },
  scanHintText: { color: '#555', fontSize: 13, fontWeight: '500' },
  offlineNote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 16,
  },
  offlineText: { color: Colors.textMuted, fontSize: 13 },
});
