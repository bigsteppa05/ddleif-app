// Web-only cookie consent banner. The app currently uses only strictly
// necessary storage (auth session); this banner records consent so future
// analytics can be gated on it. Gate any analytics on hasAnalyticsConsent().
import { useEffect, useState } from 'react';
import { View, Text, Platform, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';

const CONSENT_KEY = 'fitxball-cookie-consent'; // 'all' | 'necessary'

export function hasAnalyticsConsent(): boolean {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return false;
  return localStorage.getItem(CONSENT_KEY) === 'all';
}

export function CookieConsent() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
  }, []);

  if (!visible) return null;

  function choose(value: 'all' | 'necessary') {
    localStorage.setItem(CONSENT_KEY, value);
    setVisible(false);
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        We use essential storage to keep you signed in. No tracking cookies are
        set today; your choice covers any analytics we add later.{' '}
        <Text style={styles.link} onPress={() => router.push('/legal/cookies')}>
          Cookie policy
        </Text>
      </Text>
      <View style={styles.actions}>
        <Pressable style={styles.ghostBtn} onPress={() => choose('necessary')}>
          <Text style={styles.ghostText}>Necessary only</Text>
        </Pressable>
        <Pressable style={styles.primaryBtn} onPress={() => choose('all')}>
          <Text style={styles.primaryText}>Accept all</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    zIndex: 1000,
    // subtle lift so it reads above page content
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
  },
  text: { color: Colors.textSecondary, fontSize: 13.5, lineHeight: 20 },
  link: { color: Colors.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  ghostBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 999,
    paddingVertical: 9, paddingHorizontal: 18,
  },
  ghostText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: 999,
    paddingVertical: 9, paddingHorizontal: 18,
  },
  primaryText: { color: Colors.background, fontSize: 13, fontWeight: '800' },
});
