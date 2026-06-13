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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import type { Event } from '@/lib/mockData';
import { getDisplayEvent, formatDateTime } from '@/lib/events';
import { supabase, checkExistingBooking, getUserProfile } from '@/lib/supabase';
import { notify } from '@/lib/ui';
import { FW, WBtn, WGhostBtn, WTag, useIsDesktopWeb } from '@/components/web/kit';
import { WebShell } from '@/components/web/WebShell';


const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isBooked, setIsBooked] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [bookError, setBookError] = useState('');

  useEffect(() => {
    if (!isDesktop) return;
    getUserProfile().then((p) => setCredits(p?.credits ?? null));
  }, [isDesktop]);

  const isMockEvent = /^\d+$/.test(id);

  useEffect(() => {
    async function load() {
      const [data, { data: { user } }] = await Promise.all([
        getDisplayEvent(id),
        supabase.auth.getUser(),
      ]);

      setEvent(data);

      if (user) {
        setUserId(user.id);
        if (!isMockEvent && data) {
          const already = await checkExistingBooking(user.id, id);
          setIsBooked(already);
        }
      }

      setLoading(false);
    }
    load();
  }, [id]);

  const bookScale = useSharedValue(1);
  const bookAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookScale.value }],
  }));

  async function handleBook() {
    if (!userId || !event) return;
    setBookingLoading(true);

    // book_event RPC now returns { booking_id, booking_ref } — no follow-up SELECT needed
    const { data: rpcData, error } = await supabase.rpc('book_event', {
      p_event_id: id,
      p_user_id: userId,
    });

    if (error) {
      setBookingLoading(false);
      if (error.message.includes('already_booked')) {
        setIsBooked(true);
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

    const updated = await getDisplayEvent(id);
    if (updated) setEvent(updated);
    setIsBooked(true);
    setBookingLoading(false);

    if (rpcData?.booking_id) {
      const ev = updated ?? event;
      router.push({
        pathname: '/booking/confirmed',
        params: {
          bookingId: rpcData.booking_id,
          eventId: id,
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

  function handleShare() {
    if (!event) return;
    Share.share({
      message: `Join me at ${event.title} on ${formatDateTime(event.date, event.time)} at ${event.location} — download fitXball to book your spot: https://fitxball.app/download`,
    });
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
  const slotsFraction = event.slots_available > 0 ? event.slots_booked / event.slots_available : 0;
  const isFull = event.slots_booked >= event.slots_available;

  function getButtonLabel() {
    if (isMockEvent) return 'Demo Event';
    if (isBooked) return 'Booked ✓';
    if (isFull) return 'Fully Booked';
    return 'Book Now';
  }

  const buttonDisabled = isMockEvent || isBooked || isFull || bookingLoading || !userId;

  if (isDesktop) {
    const balanceAfter = credits !== null && !event.is_free ? credits - event.cost_in_credits : null;
    return (
      <WebShell padTop={36}>
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
                <Ionicons name="location-outline" size={17} color={FW.primary} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: FW.text, flex: 1 }}>
                  {event.locationFull || event.location}
                </Text>
                <Text
                  style={{ fontSize: 13.5, fontWeight: '700', color: FW.primary }}
                  onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(event.locationFull || event.location)}`)}
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
                <Text style={{ fontSize: 13, fontWeight: '700', color: isFull ? FW.error : FW.primary }}>
                  {isFull ? 'Fully booked' : `${slotsLeft} of ${event.slots_available} slots left`}
                </Text>
                <Text style={{ fontSize: 13, color: FW.muted }}>{event.slots_booked} going</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: FW.surfaceEl, overflow: 'hidden' }}>
                <View style={{
                  width: `${Math.round(slotsFraction * 100)}%`, height: '100%', borderRadius: 3,
                  backgroundColor: isFull ? FW.error : FW.primary,
                }} />
              </View>
            </View>
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
            {isFull && !isBooked ? (
              <View style={{
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: FW.surfaceEl, borderRadius: 999, paddingVertical: 15,
              }}>
                <Text style={{ color: FW.muted, fontSize: 15.5, fontWeight: '800' }}>Fully Booked</Text>
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
          <InfoRow
            icon="location-outline"
            label="Location"
            primary={event.location}
            secondary={event.locationFull?.startsWith('http') ? undefined : event.locationFull}
            mapsUrl={event.locationFull?.startsWith('http') ? event.locationFull : undefined}
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
            <Text style={[styles.slotsCount, isFull && styles.slotsFull]}>
              {isFull ? 'Full' : `${slotsLeft} slots free`}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${slotsFraction * 100}%` }]} />
          </View>
          <Text style={styles.participantsText}>
            Participants ({event.slots_booked})
          </Text>
        </View>

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
            isFull && styles.bookButtonFull,
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
      </View>
    </View>
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
