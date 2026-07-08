import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  Share,
  Platform,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import { KES_PER_CREDIT } from '@/constants/payments';
import type { Event } from '@/lib/mockData';
import { getDisplayEvent, getDisplayEventBySlugOrId, formatDateTime, isEventPast } from '@/lib/events';
import {
  supabase,
  checkExistingBooking,
  cancelBooking,
  getUserProfile,
  getEventParticipants,
  getAllEventSlugs,
  type EventParticipant,
} from '@/lib/supabase';
import { notify } from '@/lib/ui';
import { notifyCreditsChanged } from '@/lib/credits';
import { openGoogleMaps, hasMapsChooser, type MapsTarget } from '@/lib/maps';
import { shareEventCard, shareEventLink } from '@/lib/shareCard';
import { MapsChooser } from '@/components/MapsChooser';
import { useFlag } from '@/components/AppConfigProvider';
import { FW, WBtn, WGhostBtn, WTag, useIsDesktopWeb } from '@/components/web/kit';
import { WebShell } from '@/components/web/WebShell';


const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Prerender one static HTML file per event (by slug) at web export time.
// Returns [] when there are no events, so the export never fails; events added
// after a build are served via the runtime rewrite in vercel.json.
export async function generateStaticParams(): Promise<{ id: string }[]> {
  const slugs = await getAllEventSlugs();
  return slugs.map((slug) => ({ id: slug }));
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isBooked, setIsBooked] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [bookError, setBookError] = useState('');
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [mapsChooserVisible, setMapsChooserVisible] = useState(false);

  // Admin-toggled runtime flags (public.app_config → feature_flags):
  //  hide_attendees   → hide participant lists + "going" counts everywhere
  //  booking_sold_out → force a "Sold out" state and disable booking
  const hideAttendees = useFlag('hide_attendees');
  const soldOut = useFlag('booking_sold_out');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    getUserProfile().then((p) => setCredits(p?.credits ?? null));
  }, [isDesktop]);

  const isMockEvent = /^\d+$/.test(id);

  useEffect(() => {
    async function load() {
      const [data, { data: { user } }] = await Promise.all([
        getDisplayEventBySlugOrId(id),
        supabase.auth.getUser(),
      ]);

      setEvent(data);

      if (user) {
        setUserId(user.id);
        if (!isMockEvent && data) {
          const existingId = await checkExistingBooking(user.id, data.id);
          setIsBooked(existingId !== null);
          setBookingId(existingId);
        }
      }

      setLoading(false);
    }
    load();
  }, [id]);

  useEffect(() => {
    if (isMockEvent || !event) return;
    getEventParticipants(event.id).then(setParticipants);
  }, [event?.id, isMockEvent]);

  function goToParticipants() {
    if (!event) return;
    router.push({
      pathname: '/event/participants',
      params: { eventId: event.id, title: event.title },
    });
  }

  const bookScale = useSharedValue(1);
  const bookAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookScale.value }],
  }));

  async function handleBook() {
    if (!event) return;
    // No booking for past events or admin-disabled (sold out) events.
    if (soldOut || isEventPast(event)) return;
    // Public page: signed-out visitors can view the event but must sign in to book.
    if (!userId) {
      router.push('/(auth)/welcome');
      return;
    }
    setBookingLoading(true);

    // book_event RPC now returns { booking_id, booking_ref } — no follow-up SELECT needed
    const { data: rpcData, error } = await supabase.rpc('book_event', {
      p_event_id: event.id,
      p_user_id: userId,
    });

    if (error) {
      setBookingLoading(false);
      if (error.message.includes('already_booked')) {
        setIsBooked(true);
      } else if (error.message.includes('profile_incomplete')) {
        // Half-registered account (email OTP verified but signup wizard never
        // finished) — send them to add a name before they can book.
        setBookError('Add your name to finish setting up your account before booking.');
        notify('Complete your profile', 'Add your name to finish setting up your account before booking.');
        router.push('/profile/edit');
      } else if (error.message.includes('no_slots')) {
        setBookError('No slots remaining for this event.');
        notify('Fully Booked', 'No slots remaining for this event.');
      } else if (error.message.includes('insufficient_credits')) {
        setBookError('Not enough credits — top up your account to book this event.');
        notify('Not enough credits', 'Top up your account to book this event.');
      } else {
        setBookError(error.message);
        notify('Error', error.message);
      }
      return;
    }
    setBookError('');

    const updated = await getDisplayEvent(event.id);
    if (updated) setEvent(updated);
    getEventParticipants(event.id).then(setParticipants);
    setIsBooked(true);
    if (rpcData?.booking_id) setBookingId(rpcData.booking_id);
    setBookingLoading(false);

    if (rpcData?.booking_id) {
      const ev = updated ?? event;
      router.push({
        pathname: '/booking/confirmed',
        params: {
          bookingId: rpcData.booking_id,
          eventId: event.id,
          title: ev?.title ?? '',
          sport: ev?.sport ?? '',
          date: ev?.date ?? '',
          time: ev?.time ?? '',
          duration: ev?.duration ?? '',
          location: ev?.location ?? '',
        },
      });
    } else {
      notify('Booked!', 'Your spot is confirmed. Check My Bookings.');
    }
  }

  function viewTicket() {
    if (!bookingId) return;
    router.push({ pathname: '/booking/ticket', params: { bookingId, eventId: event?.id ?? '' } });
  }

  // Full refund only when cancelling >12h before start (mirrors the server-side gate).
  function refundEligible(): boolean {
    if (!event || event.is_free) return false;
    const start = event.rawDate ? new Date(event.rawDate).getTime() : NaN;
    if (Number.isNaN(start)) return false;
    return Date.now() < start - 12 * 60 * 60 * 1000;
  }

  async function doCancel() {
    if (!userId || !bookingId || !event) return;
    setCancelLoading(true);
    try {
      const { refunded_credits } = await cancelBooking(bookingId, userId);
      setIsBooked(false);
      setBookingId(null);
      const updated = await getDisplayEvent(event.id);
      if (updated) setEvent(updated);
      getEventParticipants(event.id).then(setParticipants);
      // A refund moved the balance — refresh the sidebar/profile credit card live,
      // matching the top-up flow (no refund within 12h means nothing to broadcast).
      if (refunded_credits > 0) notifyCreditsChanged();
      notify(
        'Booking cancelled',
        refunded_credits > 0
          ? `${refunded_credits} credits have been returned to your balance.`
          : 'Your slot has been released. No refund applies within 12 hours of the event.'
      );
    } catch (e: any) {
      const msg = e?.message ?? '';
      notify(
        'Could not cancel',
        msg.includes('already_checked_in')
          ? "You're already checked in for this event."
          : 'Something went wrong cancelling your booking. Please try again.'
      );
    } finally {
      setCancelLoading(false);
    }
  }

  function handleCancel() {
    const refundMsg = event?.is_free
      ? 'Your slot will be released.'
      : refundEligible()
      ? `You'll be refunded ${event?.cost_in_credits} credits.`
      : 'No refund applies — this event starts within 12 hours.';

    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm(`Cancel this booking? ${refundMsg}`)) {
        doCancel();
      }
      return;
    }
    Alert.alert('Cancel booking?', refundMsg, [
      { text: 'Keep booking', style: 'cancel' },
      { text: 'Cancel booking', style: 'destructive', onPress: doCancel },
    ]);
  }

  // Native: let the user pick Apple Maps / Google Maps / Waze. Web: open Google.
  function handleDirections() {
    if (!event) return;
    if (hasMapsChooser) setMapsChooserVisible(true);
    else openGoogleMaps({ name: event.location, mapsUrl: event.mapsUrl });
  }

  function eventShareData() {
    if (!event) return null;
    return {
      title: event.title,
      sport: event.sport,
      dateTime: formatDateTime(event.date, event.time),
      location: event.location,
      url: `https://www.fitxball.com/event/${event.slug ?? id}`,
    };
  }

  function handleShare() {
    if (!event) return;
    // Web: offer the image card or a link (Luma/Spotify style). Native: share the
    // real event link as text (image card would need a native rebuild).
    if (Platform.OS === 'web') {
      setShareOpen(true);
      return;
    }
    const d = eventShareData()!;
    Share.share({
      message: `Join ${d.title} on ${d.dateTime} at ${d.location} — book on fitXball: ${d.url}`,
      url: d.url,
    });
  }

  async function onShareCard() {
    const d = eventShareData();
    if (!d) return;
    setShareBusy(true);
    const result = await shareEventCard(d);
    setShareBusy(false);
    setShareOpen(false);
    if (result === 'downloaded' && typeof window !== 'undefined') {
      window.alert('Card saved to your device — post it to your story or share it anywhere.');
    }
  }

  async function onShareLink() {
    const d = eventShareData();
    if (!d) return;
    const result = await shareEventLink(d);
    setShareOpen(false);
    if (result === 'copied' && typeof window !== 'undefined') {
      window.alert('Link copied to clipboard.');
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={{ color: Colors.textPrimary, padding: 20 }}>Event not found.</Text>
      </View>
    );
  }

  const slotsLeft = event.slots_available - event.slots_booked;
  const isFull = event.slots_booked >= event.slots_available;
  const isPast = isEventPast(event);
  // Booking is blocked for full, admin-sold-out, or past events. Past events stay
  // fully viewable (participants, details) as history — only booking is disabled.
  const blockBooking = isFull || soldOut || isPast;
  const slotsFraction = isFull || soldOut
    ? 1
    : event.slots_available > 0
      ? event.slots_booked / event.slots_available
      : 0;

  function getButtonLabel() {
    if (isMockEvent) return 'Demo Event';
    if (isBooked) return 'Booked ✓';
    if (isPast) return 'Event ended';
    if (soldOut) return 'Sold out';
    if (isFull) return 'Fully Booked';
    if (!userId) return 'Sign in to Book';
    return 'Book Now';
  }

  // Signed-out visitors can press Book — handleBook sends them to sign in.
  const buttonDisabled = isMockEvent || isBooked || blockBooking || bookingLoading;

  // ── SEO: per-event metadata + SportsEvent structured data ──────────────────
  // Rendered into the document <head> on web. Googlebot executes JS and indexes
  // this; a build-time prerender (follow-up) would also feed non-JS crawlers.
  const canonicalSlug = event.slug ?? id;
  const eventUrl = `https://www.fitxball.com/event/${canonicalSlug}`;
  const metaDesc = (
    event.description?.trim() ||
    `Join ${event.title} — ${event.sport} in Nairobi with fitXball on ${formatDateTime(event.date, event.time)} at ${event.location}.`
  )
    .replace(/\s+/g, ' ')
    .slice(0, 160);
  const datePart = (event.rawDate ?? '').slice(0, 10);
  const startDate = /^\d{2}:\d{2}$/.test(event.time) ? `${datePart}T${event.time}:00+03:00` : datePart;
  const priceKes = event.is_free ? 0 : event.cost_in_credits * KES_PER_CREDIT;
  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.title,
    description: metaDesc,
    ...(startDate ? { startDate } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    sport: event.sport,
    location: {
      '@type': 'Place',
      name: event.locationFull || event.location,
      address: { '@type': 'PostalAddress', addressLocality: 'Nairobi', addressCountry: 'KE' },
    },
    ...(event.image_url ? { image: [event.image_url] } : {}),
    organizer: { '@type': 'Organization', name: 'fitXball', url: 'https://www.fitxball.com' },
    offers: {
      '@type': 'Offer',
      url: eventUrl,
      price: String(priceKes),
      priceCurrency: 'KES',
      availability: blockBooking ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
    },
  };
  const eventHead = (
    <Head>
      <title>{`${event.title} | ${event.sport} in Nairobi | fitXball`}</title>
      <meta name="description" content={metaDesc} />
      <link rel="canonical" href={eventUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={event.title} />
      <meta property="og:description" content={metaDesc} />
      <meta property="og:url" content={eventUrl} />
      {event.image_url ? <meta property="og:image" content={event.image_url} /> : null}
      <meta name="twitter:card" content="summary_large_image" />
      <script type="application/ld+json">{JSON.stringify(eventJsonLd)}</script>
    </Head>
  );

  // Web share sheet (Luma/Spotify style): image card or link. Opens only on web.
  const shareSheet = (
    <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
      <TouchableOpacity style={styles.shareBackdrop} activeOpacity={1} onPress={() => setShareOpen(false)}>
        <View style={styles.shareSheet}>
          <Text style={styles.shareTitle}>Share this event</Text>
          <TouchableOpacity style={styles.shareOpt} onPress={onShareCard} disabled={shareBusy} activeOpacity={0.85}>
            <View style={styles.shareOptIcon}><Ionicons name="image-outline" size={20} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareOptLabel}>Share as image card</Text>
              <Text style={styles.shareOptSub}>Post to your story or send anywhere</Text>
            </View>
            {shareBusy
              ? <ActivityIndicator color={Colors.primary} />
              : <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareOpt} onPress={onShareLink} activeOpacity={0.85}>
            <View style={styles.shareOptIcon}><Ionicons name="link-outline" size={20} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareOptLabel}>Share link</Text>
              <Text style={styles.shareOptSub}>Copy or send the event link</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareCancel} onPress={() => setShareOpen(false)}>
            <Text style={styles.shareCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  if (isDesktop) {
    const balanceAfter = credits !== null && !event.is_free ? credits - event.cost_in_credits : null;
    return (
      <WebShell padTop={36}>
        {eventHead}
        {shareSheet}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/book'))}
        >
          <Ionicons name="arrow-back" size={16} color={FW.sec} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: FW.sec }}>Back to Explore</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 28, alignItems: 'flex-start' }}>
          {/* Left: hero + about */}
          <View style={{ flex: 1, gap: 26, minWidth: 0 }}>
            <View style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: FW.border }}>
              {event.image_url ? (
                <Image source={{ uri: event.image_url }} style={{ width: '100%', aspectRatio: 4 / 3 }} resizeMode="cover" />
              ) : (
                <View style={{ width: '100%', height: 320, backgroundColor: FW.surfaceEl, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="image-outline" size={56} color={FW.muted} />
                </View>
              )}
              <View style={{ position: 'absolute', top: 16, left: 16, flexDirection: 'row', gap: 8 }}>
                <WTag label={event.mode ? `${event.sport} · ${event.mode}` : event.sport} tone="lime" />
                {isFull && <WTag label="Sold out" tone="red" />}
              </View>
              <TouchableOpacity
                style={{
                  position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20,
                  backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
                }}
                onPress={handleShare}
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            <View>
              <Text style={{ fontSize: 34, fontWeight: '800', color: FW.text, letterSpacing: -0.8, lineHeight: 38 }}>
                {event.title}
              </Text>
              <Text style={{ marginTop: 8, fontSize: 14.5, color: FW.sec }}>
                Hosted by <Text style={{ color: FW.text, fontWeight: '700' }}>fitXball Crew</Text>
              </Text>
            </View>
            {event.description ? (
              <Text style={{ fontSize: 15, color: FW.sec, lineHeight: 25, maxWidth: 600 }}>
                {event.description}
              </Text>
            ) : null}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: FW.text, letterSpacing: -0.2 }}>Where you're playing</Text>
              <View style={{
                borderRadius: 16, borderWidth: 1, borderColor: FW.border, backgroundColor: FW.surface,
                paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <Ionicons name="location-outline" size={18} color={FW.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: FW.text }}>{event.location}</Text>
                  {event.locationDetails ? (
                    <Text style={{ fontSize: 13, color: FW.sec, marginTop: 2 }}>{event.locationDetails}</Text>
                  ) : null}
                </View>
                <Text
                  style={{ fontSize: 13.5, fontWeight: '700', color: FW.primary }}
                  onPress={handleDirections}
                >
                  Get directions
                </Text>
              </View>
            </View>
          </View>
          {/* Right: booking card */}
          <View style={{
            width: 360, flexShrink: 0, backgroundColor: FW.surface, borderWidth: 1, borderColor: FW.border,
            borderRadius: 20, padding: 26, gap: 20,
          }}>
            <View style={{ gap: 16 }}>
              {([
                ['calendar-outline', 'Date', event.date],
                ['time-outline', 'Time', [event.time, event.duration].filter(Boolean).join(' · ') || '—'],
                ['location-outline', 'Venue', event.location],
                ...(event.mode ? [['people-outline', 'Format', event.mode]] : []),
              ] as Array<[string, string, string]>).map(([icon, label, value]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                  <View style={{
                    width: 38, height: 38, borderRadius: 11, backgroundColor: FW.surfaceEl,
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Ionicons name={icon as any} size={17} color={FW.primary} />
                  </View>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: FW.muted }}>
                      {label}
                    </Text>
                    <Text style={{ fontSize: 14.5, fontWeight: '600', color: FW.text, marginTop: 2 }} numberOfLines={1}>
                      {value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={{ height: 1, backgroundColor: FW.borderSoft }} />
            {/* Slots bar */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: blockBooking ? (isPast ? FW.muted : FW.error) : FW.primary }}>
                  {isPast ? 'Event ended' : soldOut ? 'Sold out' : isFull ? 'Fully booked' : `${slotsLeft} of ${event.slots_available} slots left`}
                </Text>
                {!hideAttendees && (
                  <Text style={{ fontSize: 13, color: FW.muted }}>{event.slots_booked} going</Text>
                )}
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: FW.surfaceEl, overflow: 'hidden' }}>
                <View style={{
                  width: `${Math.round(slotsFraction * 100)}%`, height: '100%', borderRadius: 3,
                  backgroundColor: blockBooking ? FW.error : FW.primary,
                }} />
              </View>
            </View>
            {/* Participants — avatar preview + link to full list (names) */}
            {!hideAttendees && event.slots_booked > 0 && (
              <>
                <View style={{ height: 1, backgroundColor: FW.borderSoft }} />
                <TouchableOpacity
                  onPress={goToParticipants}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row' }}>
                    {participants.slice(0, 5).map((p, i) => (
                      <View key={i} style={{
                        width: 30, height: 30, borderRadius: 15, marginLeft: i ? -10 : 0,
                        backgroundColor: FW.surfaceEl, borderWidth: 2, borderColor: FW.surface,
                        alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 5 - i,
                      }}>
                        {p.avatar_url ? (
                          <Image source={{ uri: p.avatar_url }} style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <Text style={{ color: FW.sec, fontSize: 12, fontWeight: '800' }}>
                            {(p.is_self ? 'Y' : p.name || p.username || '?').charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontSize: 13, color: FW.sec, fontWeight: '600' }}>Who's going</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontSize: 13, color: FW.primary, fontWeight: '700' }}>See all</Text>
                  <Ionicons name="chevron-forward" size={15} color={FW.primary} />
                </TouchableOpacity>
              </>
            )}
            <View style={{ height: 1, backgroundColor: FW.borderSoft }} />
            {/* Price */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: FW.muted }}>Price</Text>
                <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                  <Text style={{ fontSize: 27, fontWeight: '800', color: FW.text, letterSpacing: -0.7 }}>
                    {event.is_free ? 'Free' : event.cost_in_credits}
                  </Text>
                  {!event.is_free && <Text style={{ fontSize: 13.5, color: FW.muted }}>credits</Text>}
                </View>
              </View>
              {balanceAfter !== null && !isBooked && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12.5, color: FW.muted }}>Balance after:</Text>
                  <Text style={{ fontSize: 12.5, color: balanceAfter < 0 ? FW.error : FW.sec, fontWeight: '700' }}>
                    {balanceAfter} cr
                  </Text>
                </View>
              )}
            </View>
            {isBooked && bookingId ? (
              <View style={{ gap: 12 }}>
                <WBtn
                  label="View Ticket"
                  icon="qr-code-outline"
                  size="lg"
                  full
                  onPress={viewTicket}
                />
                <TouchableOpacity
                  onPress={handleCancel}
                  disabled={cancelLoading}
                  style={{ alignItems: 'center', paddingVertical: 6 }}
                >
                  <Text style={{ color: FW.error, fontSize: 13.5, fontWeight: '700' }}>
                    {cancelLoading ? 'Cancelling…' : 'Cancel booking'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : blockBooking && !isBooked ? (
              <View style={{
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: FW.surfaceEl, borderRadius: 999, paddingVertical: 15,
              }}>
                <Text style={{ color: FW.muted, fontSize: 15.5, fontWeight: '800' }}>
                  {isPast ? 'Event ended' : soldOut ? 'Sold out' : 'Fully Booked'}
                </Text>
              </View>
            ) : bookingLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <ActivityIndicator color={FW.primary} />
              </View>
            ) : (
              <WBtn
                label={getButtonLabel()}
                size="lg"
                full
                dim={buttonDisabled}
                onPress={handleBook}
              />
            )}
            {!!bookError && (
              <Text style={{ color: FW.error, fontSize: 13, textAlign: 'center' }}>{bookError}</Text>
            )}
          </View>
        </View>
      </WebShell>
    );
  }

  return (
    <View style={styles.container}>
      {eventHead}
      {shareSheet}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Hero image */}
        <View style={styles.heroContainer}>
          {event.image_url ? (
            <Image source={{ uri: event.image_url }} style={styles.hero} resizeMode="cover" />
          ) : (
            <View style={[styles.hero, styles.heroFallback]}>
              <Ionicons name="image-outline" size={56} color={Colors.textMuted} />
            </View>
          )}
          <View style={[styles.heroOverlay, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          {isBooked && (
            <View style={styles.bookedBadge}>
              <Ionicons name="checkmark-circle" size={13} color={Colors.primary} />
              <Text style={styles.bookedBadgeText}>Booked</Text>
            </View>
          )}
          <Text style={styles.title}>{event.title}</Text>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <InfoRow
            icon="calendar-outline"
            label="Date & Time"
            primary={formatDateTime(event.date, event.time)}
          />
          {(event.mode || event.duration) ? (
            <>
              <View style={styles.cardDivider} />
              <InfoRow
                icon="football-outline"
                label="Format"
                primary={event.mode || event.duration}
                secondary={event.mode ? event.duration : undefined}
              />
            </>
          ) : null}
          <View style={styles.cardDivider} />
          <LocationRow
            name={event.location}
            details={event.locationDetails}
            onDirections={handleDirections}
          />
          <View style={styles.cardDivider} />
          <InfoRow
            icon="trophy-outline"
            label="Sport"
            primary={event.sport}
          />
        </View>

        {/* Availability */}
        <View style={styles.card}>
          <View style={styles.availRow}>
            <Text style={styles.cardTitle}>Availability</Text>
            <Text style={[styles.slotsCount, blockBooking && !isPast && styles.slotsFull]}>
              {isPast ? 'Ended' : soldOut ? 'Sold out' : isFull ? 'Full' : `${slotsLeft} slots free`}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${slotsFraction * 100}%` }]} />
          </View>
          {!hideAttendees && (
            <Text style={styles.participantsText}>
              Participants ({event.slots_booked})
            </Text>
          )}
        </View>

        {/* Participants preview */}
        {!hideAttendees && event.slots_booked > 0 && (
          <TouchableOpacity
            style={[styles.card, styles.participantsPreview]}
            activeOpacity={0.8}
            onPress={goToParticipants}
          >
            <View style={styles.avatarStack}>
              {participants.slice(0, 5).map((p, i) => (
                <View key={i} style={[styles.stackAvatar, { marginLeft: i ? -12 : 0, zIndex: 5 - i }]}>
                  {p.avatar_url ? (
                    <Image source={{ uri: p.avatar_url }} style={styles.stackImg} />
                  ) : p.is_private ? (
                    <Ionicons name="lock-closed" size={13} color={Colors.textMuted} />
                  ) : (
                    <Text style={styles.stackInitial}>
                      {(p.is_self ? 'Y' : p.name || p.username || '?').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            <Text style={styles.goingText}>{event.slots_booked} going</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.seeAll}>See all</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
          </TouchableOpacity>
        )}

        {/* Description */}
        <View style={styles.card}>
          <View style={styles.descHeader}>
            <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Description</Text>
          </View>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      </ScrollView>

      {/* Fixed bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {isBooked && bookingId ? (
          <View style={styles.bookedActions}>
            {/* Persistent ticket access — reachable on every visit, not just post-booking */}
            <TouchableOpacity
              style={styles.ticketButton}
              activeOpacity={0.85}
              onPress={viewTicket}
            >
              <Ionicons name="qr-code-outline" size={19} color={Colors.primary} />
              <Text style={styles.ticketButtonText}>View Entry Ticket</Text>
            </TouchableOpacity>
            <View style={styles.bookedPriceRow}>
              <View>
                <Text style={styles.priceLabel}>Price per person</Text>
                <Text style={styles.priceValue}>
                  {event.is_free ? 'Free' : `${event.cost_in_credits} Credits`}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.cancelButton, cancelLoading && styles.bookButtonDisabled]}
                activeOpacity={0.85}
                onPress={handleCancel}
                disabled={cancelLoading}
              >
                {cancelLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.cancelButtonText}>Cancel Booking</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View>
              <Text style={styles.priceLabel}>Price per person</Text>
              <Text style={styles.priceValue}>
                {event.is_free ? 'Free' : `${event.cost_in_credits} Credits`}
              </Text>
            </View>
            <AnimatedTouchable
              style={[
                styles.bookButton,
                bookAnimStyle,
                buttonDisabled && styles.bookButtonDisabled,
                blockBooking && styles.bookButtonFull,
              ]}
              activeOpacity={1}
              onPressIn={() => { if (!buttonDisabled) bookScale.value = withSpring(0.96, { duration: 120 }); }}
              onPressOut={() => { bookScale.value = withSpring(1, { duration: 150 }); }}
              onPress={handleBook}
              disabled={buttonDisabled}
            >
              {bookingLoading ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.bookButtonText}>{getButtonLabel()}</Text>
              )}
            </AnimatedTouchable>
          </>
        )}
      </View>
      <MapsChooser
        visible={mapsChooserVisible}
        onClose={() => setMapsChooserVisible(false)}
        target={{ name: event.location, mapsUrl: event.mapsUrl }}
      />
    </View>
  );
}

function LocationRow({
  name,
  details,
  onDirections,
}: {
  name: string;
  details?: string;
  onDirections: () => void;
}) {
  return (
    <TouchableOpacity style={infoStyles.row} activeOpacity={0.7} onPress={onDirections}>
      <Ionicons name="location-outline" size={22} color={Colors.primary} style={infoStyles.icon} />
      <View style={infoStyles.text}>
        <Text style={infoStyles.label}>Location</Text>
        <Text style={infoStyles.primary}>{name}</Text>
        {details ? <Text style={infoStyles.secondary}>{details}</Text> : null}
        <Text style={infoStyles.mapsLink}>Get directions →</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

function InfoRow({
  icon,
  label,
  primary,
  secondary,
  mapsUrl,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  primary: string;
  secondary?: string;
  mapsUrl?: string;
}) {
  return (
    <View style={infoStyles.row}>
      <Ionicons name={icon} size={22} color={Colors.primary} style={infoStyles.icon} />
      <View style={infoStyles.text}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={infoStyles.primary}>{primary}</Text>
        {secondary ? <Text style={infoStyles.secondary}>{secondary}</Text> : null}
        {mapsUrl ? (
          <TouchableOpacity onPress={() => Linking.openURL(mapsUrl)} activeOpacity={0.7}>
            <Text style={infoStyles.mapsLink}>Open in Maps →</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 14,
  },
  icon: {
    marginTop: 14,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  primary: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 1,
  },
  mapsLink: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  shareBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  shareSheet: {
    width: '100%', maxWidth: 420,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 20, padding: 18, gap: 10,
  },
  shareTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 4, paddingHorizontal: 4 },
  shareOpt: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 14, padding: 14,
  },
  shareOptIcon: {
    width: 40, height: 40, borderRadius: 11,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  shareOptLabel: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  shareOptSub: { color: Colors.textSecondary, fontSize: 12.5, marginTop: 2 },
  shareCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  shareCancelText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '700' },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 360,
    position: 'relative',
  },
  hero: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  bookedBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `${Colors.primary}1F`,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  bookedBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    color: Colors.primary,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 52,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  availRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  slotsCount: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  slotsFull: {
    color: Colors.error,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  participantsText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  participantsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: Colors.surface,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stackImg: { width: '100%', height: '100%' },
  stackInitial: { color: Colors.textSecondary, fontSize: 13, fontWeight: '800' },
  goingText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  seeAll: { color: Colors.primary, fontSize: 13.5, fontWeight: '700' },
  descHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  priceLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  priceValue: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  bookButton: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingHorizontal: 36,
    paddingVertical: 14,
    minWidth: 140,
    alignItems: 'center',
  },
  bookedActions: {
    width: '100%',
    gap: 12,
  },
  ticketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 14,
  },
  ticketButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  bookedPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelButton: {
    backgroundColor: Colors.error,
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 15,
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  bookButtonDisabled: {
    opacity: 0.5,
  },
  bookButtonFull: {
    backgroundColor: Colors.error,
    opacity: 1,
  },
  bookButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '800',
  },
});
