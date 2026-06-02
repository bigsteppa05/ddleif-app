import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const slideAnim = useRef(new Animated.Value(120)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  function handleGetStarted() {
    setExpanded(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 65, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Hero image area */}
      <View style={styles.heroContainer}>
        <View style={styles.heroStripes} />
        <View style={styles.heroGradient} />
        <Text style={styles.heroHint}>[ players on court — hero shot ]</Text>
      </View>

      {/* Brand + copy */}
      <View style={styles.brandSection}>
        <Text style={styles.logo}>fieldd</Text>
        <Text style={styles.headline}>Book courts.{'\n'}Find games. Play more.</Text>
        <Text style={styles.sub}>
          Reserve a slot, join a pickup match, and keep your crew on the same page.
        </Text>
      </View>

      {/* Auth actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 24 }]}>
        {!expanded ? (
          /* Single entry CTA — user gets to pause on the hero before proceeding */
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleGetStarted}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
          </TouchableOpacity>
        ) : (
          /* Revealed auth options */
          <Animated.View
            style={[
              styles.authOptions,
              { transform: [{ translateY: slideAnim }], opacity: fadeAnim },
            ]}
          >
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push('/(auth)/register')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Create Account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push('/(auth)/login')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>Sign In</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <Text style={styles.legal}>
          By continuing you agree to our Terms & Privacy Policy.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  heroContainer: {
    flex: 1,
    margin: 16,
    marginBottom: 0,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
    padding: 16,
  },
  heroStripes: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.surface,
    // Approximates the diagonal stripe design placeholder
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
    // Gradient from transparent top to dark bottom
    backgroundColor: 'transparent',
  },
  heroHint: {
    fontFamily: 'Courier New',
    fontSize: 11,
    color: Colors.textMuted,
  },
  brandSection: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 12,
  },
  logo: {
    color: Colors.primary,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  headline: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 31,
  },
  sub: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
    minHeight: 140,
    justifyContent: 'flex-end',
  },
  authOptions: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  legal: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
