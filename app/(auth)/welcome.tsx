import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import {
  Wordmark,
  PageDots,
  useRise,
  HERO_SEQUENCE,
  INTRO_GRADIENT,
  HERO_GRADIENT,
} from '@/components/onboarding';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { track } from '@/lib/analytics';
import { AuthShell, AuthHeading, LimeLink, WBtn, WGhostBtn, FW, useIsDesktopWeb } from '@/components/web/kit';

// ── Content ───────────────────────────────────────────────────────────────
const INTRO_PAGES = [
  {
    image: HERO_SEQUENCE[0],
    kicker: '01 · BROWSE',
    headline: 'Browse for\na match.',
    sub: 'We line up football, basketball and padel games all over the city. Scroll and find one that fits.',
  },
  {
    image: HERO_SEQUENCE[1],
    kicker: '02 · BOOK A SLOT',
    headline: 'Grab your\nspot.',
    sub: "Found a game you like? Claim a spot in a tap — it's your ticket onto the court.",
  },
  {
    image: HERO_SEQUENCE[2],
    kicker: '03 · ARRIVE & PLAY',
    headline: 'Turn up\nand play.',
    sub: 'Show up at the time and place. No teams to organise, no hassle — just play.',
  },
] as const;

const SPORT_TAGS = ['FOOTBALL · GRAB A SPOT', 'BASKETBALL · GRAB A SPOT', 'PADEL · GRAB A SPOT'] as const;
const HERO_PAGE = INTRO_PAGES.length; // index 3

// ── Desktop (≥1024px web) ─────────────────────────────────────────
function DesktopWelcome() {
  const router = useRouter();
  return (
    <AuthShell
      footer={
        <Text style={{ fontSize: 13.5, color: FW.sec }}>
          By continuing you agree to our <LimeLink onPress={() => router.push('/legal/terms')}>Terms</LimeLink> & <LimeLink onPress={() => router.push('/legal/privacy')}>Privacy Policy</LimeLink>.
        </Text>
      }
    >
      <AuthHeading
        kicker="Welcome"
        title={'Your next game\nstarts here.'}
        sub="Create a free account to book courts and join events across Nairobi — or sign back in to pick up where you left off."
      />
      <View style={{ gap: 12 }}>
        <WBtn label="Create Account" size="lg" full onPress={() => router.push('/(auth)/register')} />
        <WGhostBtn label="Sign In" size="lg" full onPress={() => router.push('/(auth)/login')} />
      </View>
      <View style={desktop.statsRow}>
        {[['40+', 'venues'], ['6', 'sports'], ['1.2k', 'players']].map(([n, l]) => (
          <View key={l}>
            <Text style={desktop.statValue}>{n}</Text>
            <Text style={desktop.statLabel}>{l}</Text>
          </View>
        ))}
      </View>
    </AuthShell>
  );
}

const desktop = StyleSheet.create({
  statsRow: {
    marginTop: 36, paddingTop: 24, borderTopWidth: 1, borderTopColor: FW.borderSoft,
    flexDirection: 'row', gap: 28,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: FW.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 12.5, color: FW.muted, marginTop: 2 },
});

// ── Hero cross-fade ───────────────────────────────────────────────
// Three stacked photos cross-fade football → basketball → padel on a loop, each
// with a slow zoom, mirroring the prototype's `cyc` / `zoomcyc` keyframes.
const HOLD_MS = 4000;
const FADE_MS = 1200;

function CrossfadeHero({ index, reduced }: { index: number; reduced: boolean }) {
  // One opacity + one scale value per layer.
  const opacities = useRef(HERO_SEQUENCE.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const scales = useRef(HERO_SEQUENCE.map(() => new Animated.Value(1.02))).current;

  useEffect(() => {
    if (reduced) return; // hold a single static frame — no zoom, no cross-fade loop
    HERO_SEQUENCE.forEach((_, i) => {
      Animated.timing(opacities[i], {
        toValue: i === index ? 1 : 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start();
    });
    // Restart the slow zoom on the newly-active layer.
    scales[index].setValue(1.02);
    Animated.timing(scales[index], {
      toValue: 1.1,
      duration: HOLD_MS + FADE_MS,
      useNativeDriver: true,
    }).start();
  }, [index, reduced, opacities, scales]);

  // Reduce Motion: a single still photo — no parallax zoom, no looping dissolve.
  if (reduced) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <Image source={HERO_SEQUENCE[0]} resizeMode="cover" style={StyleSheet.absoluteFill} />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {HERO_SEQUENCE.map((src, i) => (
        <Animated.Image
          key={i}
          source={src}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { opacity: opacities[i], transform: [{ scale: scales[i] }] }]}
        />
      ))}
    </View>
  );
}

// ── Mobile ────────────────────────────────────────────────────────
function MobileWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const reduced = useReducedMotion();
  const rise = useRise(page);

  // Top of the onboarding funnel.
  useEffect(() => { track('onboarding_intro_viewed'); }, []);

  // Advance the hero photo/tag every HOLD_MS while the hero is showing — unless
  // the user has Reduce Motion on, in which case the hero stays a single frame.
  useEffect(() => {
    if (page !== HERO_PAGE || reduced) return;
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % HERO_SEQUENCE.length), HOLD_MS);
    return () => clearInterval(t);
  }, [page, reduced]);

  const tagRise = useRise(heroIndex);
  const isHero = page === HERO_PAGE;
  const topInset = insets.top || 20;

  return (
    <View style={styles.root}>
      {/* ── Background ── */}
      {isHero ? (
        <CrossfadeHero index={heroIndex} reduced={reduced} />
      ) : (
        <ImageBackground source={INTRO_PAGES[page].image} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <LinearGradient
        colors={(isHero ? HERO_GRADIENT : INTRO_GRADIENT).colors}
        locations={(isHero ? HERO_GRADIENT : INTRO_GRADIENT).locations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* ── Top bar ── */}
      {isHero ? (
        <View style={[styles.heroTop, { top: topInset + 14 }]} pointerEvents="none">
          <Wordmark size={26} />
        </View>
      ) : (
        <View style={[styles.introTop, { top: topInset + 6 }]}>
          <Wordmark size={23} />
          <TouchableOpacity style={styles.skipPill} onPress={() => setPage(HERO_PAGE)} activeOpacity={0.85}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Cycling sport tag (hero only) ── */}
      {isHero && (
        <Animated.View style={[styles.sportTag, { top: topInset + 62 }, tagRise]} pointerEvents="none">
          <View style={styles.sportDot} />
          <Text style={styles.sportTagText}>{SPORT_TAGS[heroIndex]}</Text>
        </Animated.View>
      )}

      {/* ── Bottom content ── */}
      <Animated.View style={[styles.bottom, { paddingBottom: (insets.bottom || 16) + 24 }, rise]}>
        {isHero ? (
          <>
            <Text style={styles.heroHeadline}>
              Pick your sport.{'\n'}Grab your spot.{'\n'}
              <Text style={{ color: Colors.primary }}>Turn up and play.</Text>
            </Text>
            <Text style={styles.heroSub}>
              We set up the matches for you. Grab a spot and just show up to play. Friendly sporting experience.
            </Text>
            <View style={{ gap: 11 }}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => { track('onboarding_get_started'); router.push('/(auth)/register'); }}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Get Started</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => { track('onboarding_signin_tapped'); router.push('/(auth)/login'); }}
                activeOpacity={0.85}
              >
                <Text style={styles.ghostBtnText}>I already have an account</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.legal}>
              By continuing you agree to our{' '}
              <Text style={styles.legalLink} onPress={() => router.push('/legal/terms')}>Terms</Text>
              {' '}&{' '}
              <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy')}>Privacy</Text>.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.kicker}>{INTRO_PAGES[page].kicker}</Text>
            <Text style={styles.introHeadline}>{INTRO_PAGES[page].headline}</Text>
            <Text style={styles.introSub}>{INTRO_PAGES[page].sub}</Text>
            <View style={styles.dotsRow}>
              <PageDots count={INTRO_PAGES.length} active={page} />
              <TouchableOpacity style={styles.nextBtn} onPress={() => setPage((p) => p + 1)} activeOpacity={0.85}>
                <Text style={styles.nextBtnText}>→</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

// ── Entry point ───────────────────────────────────────────────────
export default function WelcomeScreen() {
  const isDesktop = useIsDesktopWeb();
  return isDesktop ? <DesktopWelcome /> : <MobileWelcome />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Top bars
  introTop: {
    position: 'absolute', left: 24, right: 22, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  heroTop: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  skipPill: {
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  skipText: { color: Colors.textPrimary, fontSize: 13.5, fontWeight: '600' },

  // Sport tag
  sportTag: {
    position: 'absolute', left: 26, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  sportDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.primary },
  sportTagText: { color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 2 },

  // Bottom block
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 26, zIndex: 20 },

  // Intro copy
  kicker: { color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 2.5, marginBottom: 12 },
  introHeadline: {
    color: Colors.textPrimary, fontSize: 40, fontWeight: '900', letterSpacing: -1.6, lineHeight: 39, marginBottom: 14,
  },
  introSub: { color: '#cfcfcf', fontSize: 15, lineHeight: 22.5, marginBottom: 30, maxWidth: 300 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextBtn: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtnText: { color: Colors.background, fontSize: 24, fontWeight: '900', lineHeight: 28 },

  // Hero copy
  heroHeadline: {
    color: Colors.textPrimary, fontSize: 39, fontWeight: '900', letterSpacing: -1.6, lineHeight: 38, marginBottom: 14,
  },
  heroSub: { color: '#cfcfcf', fontSize: 15, lineHeight: 21.75, marginBottom: 22, maxWidth: 300 },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 30, paddingVertical: 17, alignItems: 'center' },
  primaryBtnText: { color: Colors.background, fontSize: 16.5, fontWeight: '800', letterSpacing: -0.2 },
  ghostBtn: {
    borderRadius: 30, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  ghostBtnText: { color: Colors.textPrimary, fontSize: 15.5, fontWeight: '700' },
  legal: { color: '#6a6a6a', fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 16 },
  legalLink: { color: '#99aaaa', textDecorationLine: 'underline' },
});
