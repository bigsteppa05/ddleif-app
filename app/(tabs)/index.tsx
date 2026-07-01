import { useCallback, useState, useEffect, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Image, Modal, Animated, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { Colors } from '@/constants/colors';
import { HomeEventCard } from '@/components/HomeEventCard';
import { supabase, getUserProfile, getUserBookings, type Profile, type BookingWithEvent } from '@/lib/supabase';
import { getDisplayEvents, normalizeEvent, formatDateTime } from '@/lib/events';
import type { Event } from '@/lib/mockData';
import { Ionicons } from '@expo/vector-icons';
import { FW, WBtn, WGhostBtn, WTag, StatBlock, MetaRow, PageTitle, useIsDesktopWeb } from '@/components/web/kit';
import { WEventCard } from '@/components/web/WEventCard';
import { PromoBanner } from '@/components/PromoBanner';
import { useContent } from '@/components/AppConfigProvider';

function HeaderAvatar({ profile }: { profile: Profile | null }) {
  if (!profile) {
    return <View style={styles.avatar} />;
  }
  const initials = profile.name
    ? profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  if (profile.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarPrimary]}>
      <Text style={styles.avatarTextPrimary}>{initials}</Text>
    </View>
  );
}

const todayISO = new Date().toISOString().split('T')[0];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [bookings, setBookings] = useState<BookingWithEvent[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeSlide = useRef(new Animated.Value(300)).current;

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [prof, allEvents, userBookings] = await Promise.all([
          getUserProfile(user.id),
          getDisplayEvents(),
          getUserBookings(user.id),
        ]);

        setProfile(prof);
        setEvents(allEvents.slice(0, 5));
        setBookings(userBookings.filter((b) => (b.events?.date ?? '') >= todayISO));

        if (Platform.OS !== 'web') {
          const flag = await SecureStore.getItemAsync('onboarding_needed');
          if (flag !== null) {
            await SecureStore.deleteItemAsync('onboarding_needed');
            setShowWelcome(true);
            Animated.spring(welcomeSlide, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
          }
        }
      }
      load();
    }, [])
  );

  function dismissWelcome() {
    Animated.timing(welcomeSlide, { toValue: 300, duration: 250, useNativeDriver: true }).start(() =>
      setShowWelcome(false)
    );
  }

  const firstName = profile
    ? (profile.name?.trim() || profile.email?.split('@')[0] || 'User').split(' ')[0]
    : '…';

  const isDesktop = useIsDesktopWeb();
  // Remote-editable copy (public.app_config.content) with baked-in fallbacks.
  const welcomeLabel = useContent('home_welcome_label', 'Welcome back');
  const noBookingsText = useContent('home_no_bookings', 'No upcoming bookings');

  if (isDesktop) {
    const nextBooking = bookings[0];
    const nextEv = nextBooking?.events ? normalizeEvent(nextBooking.events) : null;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
    const dateKicker = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
      <View>
        <PageTitle
          kicker={dateKicker}
          title={`${greeting}, ${firstName}.`}
          right={<WBtn label="Find a Game" icon="search" onPress={() => router.push('/(tabs)/book')} />}
        />
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 24, marginBottom: 28 }}>
          <StatBlock label="Upcoming games" value={bookings.length} />
          <StatBlock label="Events available" value={events.length} />
          <StatBlock label="Credit balance" value={profile?.credits ?? 0} suffix="cr" />
        </View>

        <PromoBanner />

        {nextEv && nextBooking ? (
          <View style={desktopStyles.hero}>
            {nextEv.image_url ? (
              <Image source={{ uri: nextEv.image_url }} style={StyleSheet.absoluteFill as any} />
            ) : null}
            <View style={desktopStyles.heroOverlay} />
            <View style={desktopStyles.heroContent}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <WTag label="Your next game" tone="lime" />
              </View>
              <Text style={desktopStyles.heroTitle}>{nextEv.title}</Text>
              <View style={{ flexDirection: 'row', gap: 22, flexWrap: 'wrap' }}>
                <MetaRow icon="calendar-outline" color="#D8D8D8">{formatDateTime(nextEv.date, nextEv.time)}</MetaRow>
                <MetaRow icon="location-outline" color="#D8D8D8">{nextEv.location}</MetaRow>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <WBtn
                  label="View Ticket" icon="qr-code-outline" size="sm"
                  onPress={() => router.push({ pathname: '/booking/ticket', params: { bookingId: nextBooking.id, eventId: nextBooking.event_id } })}
                />
                <WGhostBtn
                  label="Event details" size="sm"
                  onPress={() => router.push(`/event/${nextBooking.event_id}`)}
                />
              </View>
            </View>
          </View>
        ) : null}

        <View style={desktopStyles.sectionHeader}>
          <Text style={desktopStyles.sectionTitle}>Upcoming events</Text>
          <Text style={desktopStyles.sectionLink} onPress={() => router.push('/(tabs)/book')}>See all</Text>
        </View>
        <View style={desktopStyles.grid}>
          {events.slice(0, 6).map((event) => (
            <View key={event.id} style={desktopStyles.gridItem}>
              <WEventCard event={event} onPress={() => router.push(`/event/${event.slug ?? event.id}`)} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <HeaderAvatar profile={profile} />
          <View>
            <Text style={styles.welcomeLabel}>{welcomeLabel}</Text>
            <Text style={styles.welcomeName}>{firstName}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.creditsLabel}>Your Credits</Text>
          <Text style={styles.creditsValue}>{profile?.credits ?? 0} Credits</Text>
        </View>
      </View>

      <PromoBanner />

      {/* Upcoming Events */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming Events</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/book')}>
          <Text style={styles.sectionLink}>See all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalList}
      >
        {events.map((event, i) => (
          <HomeEventCard key={event.id} event={event} index={i} />
        ))}
      </ScrollView>

      {/* My Bookings */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Bookings</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/book')}>
          <Text style={styles.sectionLink}>See all</Text>
        </TouchableOpacity>
      </View>

      {bookings.length === 0 ? (
        <View style={styles.emptyBookings}>
          <Text style={styles.emptyText}>{noBookingsText}</Text>
        </View>
      ) : (
        bookings.map((booking) => {
          if (!booking.events) return null;
          const ev = normalizeEvent(booking.events);
          return (
            <TouchableOpacity
              key={booking.id}
              style={styles.bookingRow}
              activeOpacity={0.8}
              onPress={() => router.push(`/event/${booking.event_id}`)}
            >
              <View style={styles.bookingInfo}>
                <Text style={styles.bookingDate}>{formatDateTime(ev.date, ev.time)}</Text>
                <Text style={styles.bookingTitle}>{ev.title}</Text>
                <View style={styles.bookingMeta}>
                  <Text style={styles.bookingMetaText}>📍 {ev.location}</Text>
                </View>
                {(ev.duration || ev.mode) ? (
                  <View style={styles.bookingMeta}>
                    <Text style={styles.bookingMetaText}>
                      ⏱ {[ev.duration, ev.mode].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/booking/ticket', params: { bookingId: booking.id, eventId: booking.event_id } })}
                activeOpacity={0.7}
              >
                <Text style={styles.viewDetails}>View Ticket →</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>

      {/* ── Welcome sheet (first-time registration) ── */}
      <Modal visible={showWelcome} transparent animationType="none" onRequestClose={dismissWelcome}>
        <TouchableOpacity style={welcomeStyles.backdrop} activeOpacity={1} onPress={dismissWelcome} />
        <Animated.View
          style={[welcomeStyles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: welcomeSlide }] }]}
        >
          <View style={welcomeStyles.handle} />
          <Text style={welcomeStyles.emoji}>🎉</Text>
          <Text style={welcomeStyles.title}>Welcome to fitXball{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}!</Text>
          <Text style={welcomeStyles.body}>
            You're all set. Browse upcoming events in Nairobi, book your spot, and start playing.
          </Text>
          <TouchableOpacity style={welcomeStyles.btn} onPress={dismissWelcome} activeOpacity={0.85}>
            <Text style={welcomeStyles.btnText}>Let's Go</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </View>
  );
}

const desktopStyles = StyleSheet.create({
  hero: {
    position: 'relative', borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: FW.border, minHeight: 240,
    backgroundColor: FW.surface, justifyContent: 'flex-end',
  },
  heroOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  heroContent: {
    paddingVertical: 28, paddingHorizontal: 32, gap: 14, maxWidth: 520,
  },
  heroTitle: { fontSize: 30, fontWeight: '800', color: FW.text, letterSpacing: -0.6 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: 36, marginBottom: 18,
  },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: FW.text, letterSpacing: -0.4 },
  sectionLink: { fontSize: 14, fontWeight: '600', color: FW.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { width: '31.8%', minWidth: 260, flexGrow: 1, maxWidth: '32.5%' },
});

const welcomeStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    gap: 12,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 8,
  },
  emoji: { fontSize: 40 },
  title: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginTop: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  btnText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarTextPrimary: {
    color: Colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  welcomeLabel: { color: Colors.textSecondary, fontSize: 12 },
  welcomeName: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  headerRight: { alignItems: 'flex-end' },
  creditsLabel: { color: Colors.textSecondary, fontSize: 12 },
  creditsValue: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },
  sectionLink: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  horizontalList: { paddingBottom: 4, marginBottom: 28 },
  emptyBookings: {
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 24,
  },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  bookingRow: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  bookingInfo: { gap: 4, flex: 1 },
  bookingDate: { color: Colors.textSecondary, fontSize: 12 },
  bookingTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 4,
  },
  bookingMeta: { flexDirection: 'row', alignItems: 'center' },
  bookingMetaText: { color: Colors.textSecondary, fontSize: 13 },
  viewDetails: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
});
