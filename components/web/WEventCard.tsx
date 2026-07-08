// Desktop event card — 3-column grid unit per the web design handoff.
import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { FW, WTag, MetaRow } from './kit';
import type { Event } from '@/lib/mockData';
import { isEventPast } from '@/lib/events';
import { useFlag } from '@/components/AppConfigProvider';

export function WEventCard({ event, onPress }: { event: Event; onPress?: () => void }) {
  const hideAttendees = useFlag('hide_attendees');
  const flagSoldOut = useFlag('booking_sold_out');
  const isPast = isEventPast(event);
  const slotsLeft = event.slots_available - event.slots_booked;
  // Sold out when genuinely full OR admin-forced via the booking_sold_out flag.
  const soldOut = slotsLeft <= 0 || flagSoldOut;
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }) => [
        styles.card,
        { borderColor: hovered ? '#3A3A3A' : FW.border, opacity: isPast ? 0.7 : soldOut ? 0.92 : 1 },
      ]}
    >
      <View style={{ position: 'relative' }}>
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, { backgroundColor: FW.surfaceEl }]} />
        )}
        <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 }}>
          <WTag label={event.sport} tone={soldOut || isPast ? 'dark' : 'lime'} />
          {isPast ? <WTag label="Passed" tone="dark" /> : soldOut && <WTag label="Sold out" tone="red" />}
        </View>
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, soldOut && { color: FW.sec }]} numberOfLines={1}>
          {event.title}
        </Text>
        <View style={{ gap: 7 }}>
          <MetaRow icon="calendar-outline" size={13.5}>
            {event.date}{event.time ? ` · ${event.time}` : ''}
          </MetaRow>
          <MetaRow icon="location-outline" size={13.5}>{event.location}</MetaRow>
        </View>
        <View style={styles.footer}>
          {isPast ? (
            <Text style={{ fontSize: 13, fontWeight: '700', color: FW.muted }}>Event ended</Text>
          ) : hideAttendees && !soldOut ? (
            <View />
          ) : (
            <Text style={{
              fontSize: 13, fontWeight: '700',
              color: soldOut ? FW.error : slotsLeft <= 3 ? FW.primary : FW.sec,
            }}>
              {soldOut ? 'Fully booked' : `${slotsLeft} slots left`}
            </Text>
          )}
          <Text style={{ fontSize: 14.5, fontWeight: '800', color: FW.text }}>
            {event.is_free ? 'Free' : <>{event.cost_in_credits} <Text style={{ fontSize: 12, fontWeight: '600', color: FW.muted }}>cr</Text></>}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FW.surface, borderWidth: 1, borderRadius: 18, overflow: 'hidden',
  },
  image: { width: '100%', aspectRatio: 4 / 3 },
  body: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 18, gap: 11 },
  title: { fontSize: 17, fontWeight: '800', color: FW.text, letterSpacing: -0.2 },
  footer: {
    marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: FW.borderSoft,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
});
