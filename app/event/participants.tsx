import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { getEventParticipants, type EventParticipant } from '@/lib/supabase';
import { FW, useIsDesktopWeb } from '@/components/web/kit';
import { WebShell } from '@/components/web/WebShell';

function displayName(p: EventParticipant): string {
  if (p.is_self) return 'You';
  if (p.is_private) return 'Private';
  return p.name || p.username || 'Participant';
}

// Avatar circle: photo when available, otherwise a tinted initial (or lock for private).
function Avatar({ p, size }: { p: EventParticipant; size: number }) {
  const radius = size / 2;
  if (p.avatar_url) {
    return <Image source={{ uri: p.avatar_url }} style={{ width: size, height: size, borderRadius: radius }} />;
  }
  const label = displayName(p);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: Colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {p.is_private ? (
        <Ionicons name="lock-closed" size={size * 0.34} color={Colors.textMuted} />
      ) : (
        <Text style={{ color: Colors.textSecondary, fontSize: size * 0.36, fontWeight: '800' }}>
          {label.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export default function ParticipantsScreen() {
  const { eventId, title } = useLocalSearchParams<{ eventId: string; title?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEventParticipants(eventId).then((data) => {
      setParticipants(data);
      setLoading(false);
    });
  }, [eventId]);

  const count = participants.length;

  if (isDesktop) {
    return (
      <WebShell padTop={36}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/book'))}
        >
          <Ionicons name="arrow-back" size={16} color={FW.sec} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: FW.sec }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 28, fontWeight: '800', color: FW.text, letterSpacing: -0.5 }}>
          Participants <Text style={{ color: FW.muted }}>({count})</Text>
        </Text>
        {title ? <Text style={{ marginTop: 6, fontSize: 14.5, color: FW.sec }}>{title}</Text> : null}
        {loading ? (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator color={FW.primary} />
          </View>
        ) : (
          <View style={{ marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
            {participants.map((p, i) => (
              <View key={i} style={{ width: 96, alignItems: 'center', gap: 10 }}>
                <Avatar p={p} size={72} />
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: FW.sec, maxWidth: 96 }}>
                  {displayName(p)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </WebShell>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Participants <Text style={styles.headerCount}>({count})</Text>
        </Text>
      </View>

      {loading ? (
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : count === 0 ? (
        <View style={[styles.center, { flex: 1, gap: 10 }]}>
          <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No one has booked yet — be the first.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {participants.map((p, i) => (
            <View key={i} style={styles.gridItem}>
              <Avatar p={p} size={72} />
              <Text numberOfLines={1} style={styles.name}>
                {displayName(p)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  headerCount: { color: Colors.textSecondary, fontWeight: '700' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingTop: 8,
    rowGap: 26,
  },
  gridItem: { width: '33.333%', alignItems: 'center', gap: 9 },
  name: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 96,
  },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
