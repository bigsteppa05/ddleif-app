import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signInWithGoogle, signInWithApple } from '@/lib/socialAuth';
import { Colors } from '@/constants/colors';
import { AuthShell, AuthHeading, LimeLink, WBtn, WGhostBtn, FW, useIsDesktopWeb } from '@/components/web/kit';

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

// ── Mobile ────────────────────────────────────────────────────────
function MobileWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const slideAnim = useRef(new Animated.Value(120)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  function handleGetStarted() {
    setExpanded(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 65, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }

  async function handleGoogle() {
    setSocialLoading('google');
    await signInWithGoogle();
    setSocialLoading(null);
  }

  async function handleApple() {
    setSocialLoading('apple');
    await signInWithApple();
    setSocialLoading(null);
  }

  return (
    <View style={[mobile.container, { paddingTop: insets.top }]}>
      <View style={mobile.heroContainer}>
        <View style={mobile.heroStripes} />
      </View>

      <View style={mobile.brandSection}>
        <Text style={mobile.logo}>fitXball</Text>
        <Text style={mobile.headline}>Book courts.{'\n'}Find games. Play more.</Text>
        <Text style={mobile.sub}>
          Reserve a slot, join a pickup match, and keep your crew on the same page.
        </Text>
      </View>

      <View style={[mobile.actions, { paddingBottom: insets.bottom + 24 }]}>
        {!expanded ? (
          <TouchableOpacity style={mobile.primaryBtn} onPress={handleGetStarted} activeOpacity={0.85}>
            <Text style={mobile.primaryBtnText}>Get Started</Text>
          </TouchableOpacity>
        ) : (
          <Animated.View style={[mobile.authOptions, { transform: [{ translateY: slideAnim }], opacity: fadeAnim }]}>
            <TouchableOpacity style={mobile.primaryBtn} onPress={() => router.push('/(auth)/register')} activeOpacity={0.85}>
              <Text style={mobile.primaryBtnText}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mobile.secondaryBtn} onPress={() => router.push('/(auth)/login')} activeOpacity={0.85}>
              <Text style={mobile.secondaryBtnText}>Sign In</Text>
            </TouchableOpacity>

            <View style={mobile.dividerRow}>
              <View style={mobile.dividerLine} />
              <Text style={mobile.dividerText}>or</Text>
              <View style={mobile.dividerLine} />
            </View>

            <View style={mobile.socialRow}>
              <TouchableOpacity style={mobile.socialBtn} onPress={handleGoogle} disabled={!!socialLoading} activeOpacity={0.8}>
                {socialLoading === 'google'
                  ? <ActivityIndicator size="small" color={Colors.textPrimary} />
                  : <><Ionicons name="logo-google" size={18} color={Colors.textPrimary} /><Text style={mobile.socialBtnText}>Google</Text></>
                }
              </TouchableOpacity>
              {Platform.OS === 'ios' && (
                <TouchableOpacity style={mobile.socialBtn} onPress={handleApple} disabled={!!socialLoading} activeOpacity={0.8}>
                  {socialLoading === 'apple'
                    ? <ActivityIndicator size="small" color={Colors.textPrimary} />
                    : <><Ionicons name="logo-apple" size={18} color={Colors.textPrimary} /><Text style={mobile.socialBtnText}>Apple</Text></>
                  }
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}
        <Text style={mobile.legal}>By continuing you agree to our Terms & Privacy Policy.</Text>
      </View>
    </View>
  );
}

// ── Entry point ───────────────────────────────────────────────────
export default function WelcomeScreen() {
  const isDesktop = useIsDesktopWeb();
  return isDesktop ? <DesktopWelcome /> : <MobileWelcome />;
}

const mobile = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heroContainer: {
    flex: 1, margin: 16, marginBottom: 0,
    borderRadius: 24, overflow: 'hidden',
    position: 'relative', justifyContent: 'flex-end', padding: 16,
  },
  heroStripes: { ...StyleSheet.absoluteFill, backgroundColor: Colors.surface },
  brandSection: { paddingHorizontal: 24, paddingTop: 28, gap: 12 },
  logo: { color: Colors.primary, fontSize: 44, fontWeight: '900', letterSpacing: -1.5, lineHeight: 44 },
  headline: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', letterSpacing: -0.4, lineHeight: 31 },
  sub: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  actions: { paddingHorizontal: 24, paddingTop: 24, gap: 12, minHeight: 140, justifyContent: 'flex-end' },
  authOptions: { gap: 12 },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
  secondaryBtn: { borderRadius: 28, borderWidth: 1, borderColor: Colors.border, paddingVertical: 16, alignItems: 'center' },
  secondaryBtnText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  legal: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: 13 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: 28,
    paddingVertical: 13, backgroundColor: Colors.surface,
  },
  socialBtnText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
});
