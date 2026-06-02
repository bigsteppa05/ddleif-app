import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import type { Event } from '@/lib/mockData';
import { formatDateTime } from '@/lib/events';

type Props = { event: Event; index?: number };

export function EventCard({ event, index = 0 }: Props) {
  const router = useRouter();
  const slotsLeft = event.slots_available - event.slots_booked;
  const isFull = slotsLeft === 0;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(250)}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => router.push(`/event/${event.id}`)}
      >
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <Ionicons name="image-outline" size={40} color={Colors.textMuted} />
          </View>
        )}

        <View style={styles.body}>
          <Text style={styles.title}>{event.title}</Text>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.meta}>{formatDateTime(event.date, event.time)}</Text>
            </View>
            <Text style={styles.credits}>
              {event.is_free ? 'Free' : `${event.cost_in_credits} Credits`}
            </Text>
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.meta}>{event.duration}</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.metaTruncated} numberOfLines={1}>{event.location}</Text>
            </View>
            <Text style={[styles.slots, isFull && styles.slotsFull]}>
              {slotsLeft} of {event.slots_available} free
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 210,
  },
  imageFallback: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 14,
    gap: 8,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  metaTruncated: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  credits: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  slots: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  slotsFull: {
    color: Colors.error,
  },
});
