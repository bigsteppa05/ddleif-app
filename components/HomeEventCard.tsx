import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import type { Event } from '@/lib/mockData';
import { formatDateTime, isEventPast } from '@/lib/events';

type Props = { event: Event; index?: number };

export function HomeEventCard({ event, index = 0 }: Props) {
  const router = useRouter();
  const isPast = isEventPast(event);

  return (
    <Animated.View entering={SlideInRight.delay(index * 70).duration(260)}>
      <TouchableOpacity
        style={[styles.card, isPast && styles.cardPast]}
        activeOpacity={0.9}
        onPress={() => router.push(`/event/${event.slug ?? event.id}`)}
      >
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <Ionicons name="image-outline" size={32} color={Colors.textMuted} />
          </View>
        )}
        {isPast && (
          <View style={styles.pastBadge}>
            <Text style={styles.pastBadgeText}>Passed</Text>
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.meta} numberOfLines={1}>{formatDateTime(event.date, event.time)}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.meta}>{event.duration}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.meta} numberOfLines={1}>{event.location}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 260,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: 12,
  },
  cardPast: {
    opacity: 0.7,
  },
  pastBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pastBadgeText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  image: {
    width: '100%',
    height: 155,
  },
  imageFallback: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 12,
    gap: 6,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
});
