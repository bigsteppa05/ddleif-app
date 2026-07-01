// Desktop webcam QR scanner — getUserMedia feed + native BarcodeDetector decode loop,
// manual booking-ref check-in, and a live "Recent scans" feed.
// Web-only: rendered exclusively from the desktop branch of admin/scanner.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { verifyBooking, checkInBooking } from '@/lib/supabase';
import { FW, WBtn, WGhostBtn, WTag, WAvatar, WLabel, PageTitle } from './kit';
import { WebShell } from './WebShell';

type FeedRow = {
  key: string;
  name: string;
  initials: string;
  ref: string;
  time: string;
  status: 'in' | 'invalid' | 'duplicate';
};

export function WebScanner({ eventId, eventTitle, eventDate, total }: {
  eventId: string; eventTitle?: string; eventDate?: string; total?: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const processingRef = useRef(false);
  const lastRefRef = useRef<string>('');
  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'denied' | 'unsupported'>('starting');
  const [decodeSupported, setDecodeSupported] = useState(true);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [manualRef, setManualRef] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMsg, setManualMsg] = useState('');

  const processRef = useCallback(async (refCode: string) => {
    if (processingRef.current) return;
    // Debounce repeat decodes of the same code held up to the camera
    if (refCode === lastRefRef.current) return;
    processingRef.current = true;
    lastRefRef.current = refCode;
    setTimeout(() => { lastRefRef.current = ''; }, 5000);

    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    try {
      const result = await checkInBooking(refCode, eventId);
      if ('error' in result) {
        if (result.error === 'already_checked_in') {
          setFeed((prev) => [{
            key: `${refCode}-${Date.now()}`, name: 'Already checked in', initials: '!',
            ref: refCode, time, status: 'duplicate' as const,
          }, ...prev].slice(0, 30));
        } else {
          setFeed((prev) => [{
            key: `${refCode}-${Date.now()}`, name: 'Not recognised', initials: '??',
            ref: refCode, time, status: 'invalid' as const,
          }, ...prev].slice(0, 30));
        }
        return;
      }
      // Success — look up the name for the feed row
      const details = await verifyBooking(refCode, eventId);
      const name = 'user_name' in details ? details.user_name : 'Checked in';
      const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '✓';
      setFeed((prev) => [{
        key: `${refCode}-${Date.now()}`, name, initials, ref: refCode, time, status: 'in' as const,
      }, ...prev].slice(0, 30));
      setCheckedInCount((c) => c + 1);
    } finally {
      processingRef.current = false;
    }
  }, [eventId]);

  // Webcam + decode loop
  useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId = 0;
    let cancelled = false;

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraState('live');

        const BD = (window as any).BarcodeDetector;
        if (!BD) { setDecodeSupported(false); return; }
        const detector = new BD({ formats: ['qr_code'] });

        const tick = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2 && !processingRef.current) {
            try {
              const codes = await detector.detect(video);
              if (codes.length > 0) {
                const raw: string = codes[0].rawValue ?? '';
                const match = raw.match(/FLD-([A-Z0-9]{6})/);
                if (match) await processRef(`FLD-${match[1]}`);
              }
            } catch { /* frame decode failure — keep looping */ }
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch {
        setCameraState('denied');
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [processRef]);

  async function handleManualCheck() {
    const cleaned = manualRef.trim().toUpperCase();
    const match = cleaned.match(/FLD-?([A-Z0-9]{6})/);
    if (!match) {
      setManualMsg('Enter a valid ref like FLD-A1B2C3');
      return;
    }
    setManualBusy(true);
    setManualMsg('');
    await processRef(`FLD-${match[1]}`);
    setManualBusy(false);
    setManualRef('');
  }

  const totalCount = parseInt(total ?? '0', 10) || 0;

  return (
    <WebShell admin maxWidth={1180}>
      <PageTitle
        kicker={`Admin${eventTitle ? ` · ${eventTitle}` : ''}${eventDate ? ` · ${eventDate}` : ''}`}
        title="Scan entry"
        right={
          <WGhostBtn
            label="Open Entry List" icon="list-outline"
            onPress={() => router.push({ pathname: '/checkin/ref-list', params: { eventId, eventTitle, eventDate } })}
          />
        }
      />
      <View style={{ flexDirection: 'row', gap: 24, marginTop: 24, alignItems: 'stretch' }}>
        {/* Camera panel */}
        <View style={styles.cameraPanel}>
          {cameraState === 'live' || cameraState === 'starting' ? (
            // Plain DOM <video> — react-native-web renders through react-dom
            React.createElement('video', {
              ref: videoRef,
              muted: true,
              playsInline: true,
              style: {
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover',
              },
            })
          ) : null}
          <View style={styles.cameraStatusPill}>
            <View style={[styles.statusDot, { backgroundColor: cameraState === 'live' ? FW.error : FW.muted }]} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#fff' }}>
              {cameraState === 'live'
                ? decodeSupported
                  ? 'Webcam live · point a ticket QR at the camera'
                  : 'Webcam live · QR decoding unsupported in this browser — use manual check-in'
                : cameraState === 'denied'
                  ? 'Camera access denied — use manual check-in'
                  : cameraState === 'unsupported'
                    ? 'No camera available — use manual check-in'
                    : 'Starting camera…'}
            </Text>
          </View>
          {/* Reticle */}
          {cameraState === 'live' && decodeSupported && (
            <View style={styles.reticle}>
              {([
                { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
                { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
                { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
                { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
              ] as const).map((c, i) => (
                <View key={i} style={[styles.reticleCorner, c]} />
              ))}
            </View>
          )}
        </View>

        {/* Right rail */}
        <View style={{ width: 380, flexShrink: 0, gap: 16 }}>
          <View style={styles.card}>
            <View style={{ padding: 20 }}>
              <WLabel>Manual check-in</WLabel>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={styles.manualInputBox}>
                  <TextInput
                    style={[styles.manualInput, { outlineStyle: 'none' } as any]}
                    value={manualRef}
                    onChangeText={(v) => { setManualRef(v.toUpperCase()); setManualMsg(''); }}
                    placeholder="FLD-······"
                    placeholderTextColor={FW.muted}
                    autoCapitalize="characters"
                    onSubmitEditing={handleManualCheck}
                  />
                </View>
                <WBtn label={manualBusy ? '…' : 'Check'} size="sm" onPress={handleManualCheck} dim={manualBusy} />
              </View>
              {!!manualMsg && <Text style={{ color: FW.error, fontSize: 12.5, marginTop: 8 }}>{manualMsg}</Text>}
            </View>
          </View>
          <View style={[styles.card, { flex: 1, minHeight: 280 }]}>
            <View style={styles.feedHeader}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: FW.text }}>Recent scans</Text>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: FW.primary, fontFamily: FW.mono }}>
                {checkedInCount}{totalCount ? ` / ${totalCount}` : ''} in
              </Text>
            </View>
            {feed.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: FW.muted, fontSize: 13 }}>Scans will appear here</Text>
              </View>
            ) : (
              feed.map((row) => (
                <View key={row.key} style={styles.feedRow}>
                  <WAvatar initials={row.initials} size={34} lime={false} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: FW.text }} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: FW.muted, fontFamily: FW.mono }}>{row.ref}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <WTag
                      label={row.status === 'in' ? 'Checked in' : row.status === 'duplicate' ? 'Duplicate' : 'Invalid'}
                      tone={row.status === 'in' ? 'limeSoft' : 'red'}
                    />
                    <Text style={{ fontSize: 11.5, color: FW.muted, marginTop: 4 }}>{row.time}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </View>
    </WebShell>
  );
}

const styles = StyleSheet.create({
  cameraPanel: {
    flex: 1, position: 'relative', borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: FW.border, backgroundColor: '#000', minHeight: 460,
  },
  cameraStatusPill: {
    position: 'absolute', top: 18, left: 18,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 999,
    paddingVertical: 8, paddingHorizontal: 16, maxWidth: '85%',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  reticle: {
    position: 'absolute', top: '50%', left: '50%',
    width: 260, height: 260, marginTop: -130, marginLeft: -130,
  },
  reticleCorner: {
    position: 'absolute', width: 44, height: 44,
    borderColor: FW.primary, borderRadius: 2,
  },
  card: {
    backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
    borderRadius: 18, overflow: 'hidden',
  },
  manualInputBox: {
    flex: 1, backgroundColor: FW.surfaceEl, borderWidth: 1, borderColor: FW.border,
    borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, justifyContent: 'center',
  },
  manualInput: {
    color: FW.text, fontSize: 14, fontFamily: FW.mono, letterSpacing: 1,
    padding: 0,
  },
  feedHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 15, paddingHorizontal: 18,
    borderBottomWidth: 1, borderBottomColor: FW.border,
  },
  feedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 18,
    borderBottomWidth: 1, borderBottomColor: FW.borderSoft,
  },
});
