import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase, verifyBooking, checkInBooking } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { useIsDesktopWeb } from '@/components/web/kit';
import { WebScanner } from '@/components/web/WebScanner';

type ScanState = 'idle' | 'found' | 'notfound' | 'duplicate';

type BookingResult = {
  id: string;
  userName: string;
  userUsername: string;
  userInitials: string;
  bookingRef: string;
  paid: boolean;
  credits: number;
  session: string;
};

export default function ScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId, eventTitle, eventDate, checkedIn, total } =
    useLocalSearchParams<{
      eventId: string;
      eventTitle: string;
      eventDate: string;
      checkedIn: string;
      total: string;
    }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanning, setScanning] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const isDesktop = useIsDesktopWeb();

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  if (isDesktop) {
    return (
      <WebScanner
        eventId={eventId ?? ''}
        eventTitle={eventTitle}
        eventDate={eventDate}
        total={total}
      />
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: Colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity style={{ position: 'absolute', top: insets.top + 16, left: 16 }} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Ionicons name="camera-outline" size={52} color={Colors.textMuted} />
        <Text style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 16 }}>
          Scanner not available on web
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 }}>
          Use the mobile app to scan QR tickets. You can still check in participants manually from the entry list.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, backgroundColor: Colors.primary, borderRadius: 28, paddingHorizontal: 28, paddingVertical: 14 }}
          onPress={() => router.push({ pathname: '/checkin/ref-list', params: { eventId, eventTitle, eventDate } })}
        >
          <Text style={{ color: Colors.background, fontSize: 15, fontWeight: '800' }}>Open Entry List</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.permText}>Camera access is needed to scan tickets.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.permBtnText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (!scanning) return;
    setScanning(false);

    // QR format: https://fitxball.app/t/FLD-XXXXXX
    const match = data.match(/FLD-([A-Z0-9]{6})/);
    if (!match) {
      setScanState('notfound');
      return;
    }

    const ref = `FLD-${match[1]}`;
    // verify_booking RPC: exact match + event ownership enforced server-side
    const result = await verifyBooking(ref, eventId ?? '');

    if ('error' in result) {
      if (result.error === 'already_checked_in') {
        setScanState('duplicate');
      } else {
        setScanState('notfound');
      }
      return;
    }

    const name = result.user_name ?? 'Guest';
    const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

    setBooking({
      id: result.booking_id,
      userName: name,
      userUsername: result.user_username ?? '',
      userInitials: initials,
      bookingRef: result.booking_ref,
      paid: result.cost_in_credits > 0,
      credits: result.cost_in_credits,
      session: result.event_date + (result.event_time ? ' · ' + result.event_time : ''),
    });
    setScanState('found');
  }

  async function handleCheckIn() {
    if (!booking) return;
    setCheckingIn(true);

    // check_in_booking RPC: validates ownership + idempotency atomically server-side
    const result = await checkInBooking(booking.bookingRef, eventId ?? '');
    setCheckingIn(false);

    if ('error' in result) {
      if (result.error === 'already_checked_in') {
        setScanState('duplicate');
      } else {
        Alert.alert('Check-in failed', result.error, [{ text: 'OK', onPress: resetScan }]);
      }
      return;
    }

    Alert.alert('Checked in!', `${booking.userName} has been checked in.`, [
      { text: 'Scan next', onPress: resetScan },
    ]);
  }

  function resetScan() {
    setScanState('idle');
    setBooking(null);
    setTimeout(() => setScanning(true), 500);
  }

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-110, 110],
  });

  const eventLabel = eventTitle ?? 'Scan Entry';
  const checkedInCount = checkedIn ?? '0';
  const totalCount = total ?? '0';

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Dark overlay when result shown */}
      {scanState !== 'idle' && <View style={styles.dimOverlay} />}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.glassBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Scan Entry</Text>
        <TouchableOpacity
          style={[styles.glassBtn, torchOn && styles.glassBtnActive]}
          onPress={() => setTorchOn((v) => !v)}
        >
          <Ionicons name="flash" size={18} color={torchOn ? Colors.background : Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Event chip */}
      <View style={styles.eventChip}>
        <View style={styles.dot} />
        <Text style={styles.eventChipText} numberOfLines={1}>{eventLabel}</Text>
      </View>

      {/* Scan frame — only when idle */}
      {scanState === 'idle' && (
        <View style={styles.frameArea}>
          <View style={styles.scanFrame}>
            {/* Corners */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            {/* Scan line */}
            <Animated.View
              style={[styles.scanLine, { transform: [{ translateY: scanLineTranslate }] }]}
            />
          </View>
          <Text style={styles.scanHint}>Point at the attendee's QR ticket</Text>
        </View>
      )}

      {/* Error frame — not found */}
      {scanState === 'notfound' && (
        <View style={styles.frameArea}>
          <View style={[styles.scanFrame, styles.scanFrameError]} />
        </View>
      )}

      {/* Bottom controls — idle */}
      {scanState === 'idle' && (
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.counter}>
            <Text style={{ color: Colors.primary }}>{checkedInCount}</Text> / {totalCount} checked in
          </Text>
          <TouchableOpacity
            style={styles.manualBtn}
            onPress={() => router.push({ pathname: '/checkin/ref-list', params: { eventId, eventTitle, eventDate } })}
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={18} color={Colors.textPrimary} />
            <Text style={styles.manualBtnText}>Enter reference manually</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Result sheet — found */}
      {scanState === 'found' && booking && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />

          {/* Valid banner */}
          <View style={styles.validRow}>
            <View style={styles.validIcon}>
              <Ionicons name="checkmark" size={16} color={Colors.background} />
            </View>
            <Text style={styles.validText}>Valid ticket</Text>
          </View>

          {/* Attendee */}
          <View style={styles.attendeeRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{booking.userInitials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.attendeeName}>{booking.userName}</Text>
              {booking.userUsername ? (
                <Text style={styles.attendeeUsername}>@{booking.userUsername}</Text>
              ) : null}
            </View>
            <View style={styles.paidBadge}>
              <Text style={styles.paidBadgeText}>Paid · {booking.credits} cr</Text>
            </View>
          </View>

          {/* Booking detail */}
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Booking ref</Text>
              <Text style={styles.detailValue}>{booking.bookingRef}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Session</Text>
              <Text style={styles.detailValue}>{booking.session}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.scanNextBtn} onPress={resetScan} activeOpacity={0.85}>
              <Text style={styles.scanNextText}>Scan next</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.checkInBtn}
              onPress={handleCheckIn}
              disabled={checkingIn}
              activeOpacity={0.85}
            >
              {checkingIn ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={19} color={Colors.background} />
                  <Text style={styles.checkInBtnText}>Check In</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Result sheet — already checked in */}
      {scanState === 'duplicate' && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.notFoundContent}>
            <View style={[styles.errorIcon, { backgroundColor: `${Colors.warning}1A`, borderColor: `${Colors.warning}55` }]}>
              <Ionicons name="checkmark-done" size={30} color={Colors.warning} />
            </View>
            <Text style={styles.notFoundTitle}>Already checked in</Text>
            <Text style={styles.notFoundDesc}>
              This ticket has already been scanned. The attendee is confirmed inside.
            </Text>
          </View>
          <TouchableOpacity style={styles.scanAgainBtn} onPress={resetScan} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color={Colors.background} />
            <Text style={styles.checkInBtnText}>Scan next</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Result sheet — not found */}
      {scanState === 'notfound' && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.notFoundContent}>
            <View style={styles.errorIcon}>
              <Ionicons name="close" size={30} color={Colors.error} />
            </View>
            <Text style={styles.notFoundTitle}>Ticket not recognised</Text>
            <Text style={styles.notFoundDesc}>
              We couldn't match this QR code to a booking for this event. Try scanning again, or look up the booking reference manually.
            </Text>
          </View>
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.scanAgainBtn} onPress={resetScan} activeOpacity={0.85}>
              <Ionicons name="refresh" size={18} color={Colors.background} />
              <Text style={styles.checkInBtnText}>Scan again</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.refListBtn}
            onPress={() => router.push({ pathname: '/checkin/ref-list', params: { eventId, eventTitle, eventDate } })}
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={18} color={Colors.textPrimary} />
            <Text style={styles.refListBtnText}>Open reference list</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const LIME = Colors.primary;
const ERR = Colors.error;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  dimOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  permText: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center', marginVertical: 16, paddingHorizontal: 32 },
  permBtn: { backgroundColor: LIME, borderRadius: 28, paddingHorizontal: 28, paddingVertical: 14 },
  permBtnText: { color: Colors.background, fontSize: 15, fontWeight: '800' },
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  glassBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(40,40,40,0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  glassBtnActive: { backgroundColor: LIME },
  topBarTitle: { flex: 1, color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  eventChip: {
    position: 'absolute',
    top: 104,
    alignSelf: 'center',
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20,20,20,0.8)',
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIME },
  eventChipText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  frameArea: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  scanFrame: {
    width: 250, height: 250,
    borderRadius: 18,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
    overflow: 'hidden',
    position: 'relative',
  },
  scanFrameError: { borderWidth: 2, borderColor: ERR },
  corner: {
    position: 'absolute',
    width: 34, height: 34,
    borderColor: LIME, borderStyle: 'solid',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  scanLine: {
    position: 'absolute',
    left: 14, right: 14,
    height: 2.5, borderRadius: 2,
    backgroundColor: LIME,
    shadowColor: LIME,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 7,
  },
  scanHint: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  bottomControls: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 5,
    padding: 20,
    gap: 14,
    alignItems: 'center',
  },
  counter: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  manualBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(26,26,26,0.85)',
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 28, paddingVertical: 15,
  },
  manualBtnText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 10,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: Colors.border,
    borderBottomWidth: 0,
    paddingHorizontal: 22,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
    elevation: 20,
  },
  sheetHandle: {
    width: 40, height: 5, borderRadius: 3,
    backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 18,
  },
  validRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  validIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
  },
  validText: { color: LIME, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800' },
  attendeeName: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  attendeeUsername: { color: Colors.textSecondary, fontSize: 14 },
  paidBadge: {
    backgroundColor: `${LIME}1A`,
    borderWidth: 1, borderColor: `${LIME}55`,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  paidBadgeText: { color: LIME, fontSize: 12, fontWeight: '700' },
  detailCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 14, gap: 10, marginBottom: 18,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { color: Colors.textSecondary, fontSize: 13 },
  detailValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', fontFamily: 'Courier New', letterSpacing: 1 },
  divider: { height: 1, backgroundColor: Colors.border },
  sheetActions: { flexDirection: 'row', gap: 12, marginBottom: 0 },
  scanNextBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 28,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  scanNextText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  checkInBtn: {
    flex: 1.4,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 28,
    backgroundColor: LIME,
  },
  checkInBtnText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
  scanAgainBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 28,
    backgroundColor: LIME,
  },
  notFoundContent: { alignItems: 'center', gap: 12, marginBottom: 22 },
  errorIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: `${ERR}1A`,
    borderWidth: 1, borderColor: `${ERR}55`,
    alignItems: 'center', justifyContent: 'center',
  },
  notFoundTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  notFoundDesc: {
    color: Colors.textSecondary, fontSize: 14, lineHeight: 22,
    textAlign: 'center', paddingHorizontal: 8,
  },
  refListBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 28,
    borderWidth: 1, borderColor: Colors.border,
    marginTop: 12,
  },
  refListBtnText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
});
