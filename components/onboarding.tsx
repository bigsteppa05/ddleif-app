// Shared building blocks for the native onboarding flow (intro + hero + auth
// steps). These recreate the fitXball "iOS onboarding revamp" design handoff in
// React Native primitives, reusing the app's existing colour tokens.
//
// The web/desktop auth layouts (see components/web/kit) are unaffected — these
// pieces are only rendered on the mobile (iOS/Android) branch of the screens.
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, TextStyle, ViewStyle, StyleProp, Easing } from 'react-native';
import { Colors } from '@/constants/colors';
import { useReducedMotion } from '@/lib/useReducedMotion';

const RISE_EASING = Easing.bezier(0.2, 0.75, 0.2, 1);

// ── Sport imagery ────────────────────────────────────────────────────────────
// Real client match photos, reused as intro backgrounds and the cycling hero.
// Order matters: football → basketball → padel (Browse → Book → Arrive).
export const SPORT_IMAGES = {
  football: require('@/assets/onboarding/football.png'),
  basketball: require('@/assets/onboarding/basketball.png'),
  padel: require('@/assets/onboarding/padel.png'),
} as const;

export const HERO_SEQUENCE = [
  SPORT_IMAGES.football,
  SPORT_IMAGES.basketball,
  SPORT_IMAGES.padel,
] as const;

// ── Gradient stops ───────────────────────────────────────────────────────────
// expo-linear-gradient takes `colors` + `locations` (0–1). These mirror the
// prototype's CSS `linear-gradient(180deg, …)` overlays that sit over the photo
// so the bottom text stays legible. Typed as non-empty tuples so they satisfy
// LinearGradient's props without casts at the call site.
type GradientStops = {
  colors: readonly [string, string, ...string[]];
  locations: readonly [number, number, ...number[]];
};

export const INTRO_GRADIENT: GradientStops = {
  colors: ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.8)', '#000000'],
  locations: [0, 0.3, 0.5, 0.76, 1],
};

export const HERO_GRADIENT: GradientStops = {
  colors: ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.72)', '#000000'],
  locations: [0, 0.26, 0.4, 0.74, 1],
};

// Banner gradient on the Create step (top photo strip → dark bottom).
export const BANNER_GRADIENT: GradientStops = {
  colors: ['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.85)'],
  locations: [0, 1],
};

// ── Wordmark ─────────────────────────────────────────────────────────────────
// `fitXball` — lime body, white "X". Weight 900, tight tracking. Font size is
// caller-controlled so the same mark serves the 23px intro and 26px hero.
export function Wordmark({ size = 23, style }: { size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[{ fontSize: size, fontWeight: '900', letterSpacing: -1.4, color: Colors.primary }, style]}>
      fit<Text style={{ color: Colors.textPrimary, fontWeight: '900' }}>X</Text>ball
    </Text>
  );
}

// ── Rise entrance animation ──────────────────────────────────────────────────
// The prototype animates every screen in with `rise`: opacity 0→1 +
// translateY(14→0) over 0.42s on a soft ease. Returns a style you spread onto an
// Animated.View. `key` re-triggers the animation when it changes (e.g. per page).
export function useRise(key: unknown): { opacity: Animated.Value; transform: { translateY: Animated.Value }[] } {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    // Under Reduce Motion, keep the fade but drop the upward slide (no movement).
    const duration = reduced ? 240 : 420;
    opacity.setValue(0);
    translateY.setValue(reduced ? 0 : 14);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, easing: RISE_EASING, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, easing: RISE_EASING, useNativeDriver: true }),
    ]).start();
  }, [key, reduced, opacity, translateY]);

  return { opacity, transform: [{ translateY }] };
}

// ── Page dots ────────────────────────────────────────────────────────────────
// Three dots; the active one widens to a lime pill. Animates width on change.
export function PageDots({ count, active }: { count: number; active: number }) {
  return (
    <Animated.View style={dots.row}>
      {Array.from({ length: count }).map((_, i) => (
        <Dot key={i} on={i === active} />
      ))}
    </Animated.View>
  );
}

function Dot({ on }: { on: boolean }) {
  const w = useRef(new Animated.Value(on ? 22 : 7)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: on ? 22 : 7, duration: 300, useNativeDriver: false }).start();
  }, [on, w]);
  return (
    <Animated.View
      style={[
        dots.dot,
        { width: w, backgroundColor: on ? Colors.primary : 'rgba(255,255,255,0.28)', borderRadius: on ? 4 : 3.5 },
      ]}
    />
  );
}

const dots = StyleSheet.create({
  row: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  dot: { height: 7 },
});

// ── Small helper wrappers reused across steps ───────────────────────────────
export function Fill({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}
