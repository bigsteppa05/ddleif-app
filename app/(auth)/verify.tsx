import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { OtpInput } from '@/components/OtpInput';
import { Colors } from '@/constants/colors';
import { AuthShell, AuthHeading, LimeLink, WBtn, FW, useIsDesktopWeb } from '@/components/web/kit';

const CODE_LENGTH = 8;

export default function VerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const { phone, email, type, next } = useLocalSearchParams<{
    phone?: string;
    email?: string;
    type?: 'sms' | 'email';
    next?: string;
  }>();
  const otpType = type ?? 'sms';

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  const isFull = code.length === CODE_LENGTH;

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);


  async function handleVerify(overrideCode?: string) {
    const token = overrideCode ?? code;
    if (token.length < CODE_LENGTH) return;
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp(
      otpType === 'email'
        ? { email: email ?? '', token, type: 'email' }
        : { phone: phone ?? '', token, type: 'sms' }
    );
    setLoading(false);
    if (verifyError) {
      setError("That code isn't right. Check and try again.");
    } else {
      setVerified(true);
    }
  }

  async function handleResend() {
    if (!canResend) return;
    setCanResend(false);
    setCountdown(27);
    if (otpType === 'email') {
      await supabase.auth.signInWithOtp({ email: email ?? '' });
    } else {
      await supabase.auth.signInWithOtp({ phone: phone ?? '' });
    }
  }

  const displayTarget = otpType === 'email'
    ? (email ?? '···')
    : phone
      ? `+254 ${phone.replace(/^(\+?254)?/, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}`
      : '+254 ···';

  if (isDesktop) {
    return (
      <AuthShell
        footer={
          <Text style={{ fontSize: 13.5, color: FW.sec }}>
            Wrong {otpType === 'email' ? 'email' : 'number'}?{' '}
            <LimeLink onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/welcome'))}>
              Go back and change it
            </LimeLink>
          </Text>
        }
      >
        <AuthHeading
          title={otpType === 'email' ? 'Verify your email' : 'Verify your number'}
          sub={`Enter the ${CODE_LENGTH}-digit code we sent to ${displayTarget} to confirm it's you.`}
        />
        <OtpInput
          value={code}
          length={CODE_LENGTH}
          onChange={(v) => { setCode(v); setError(''); }}
          onComplete={handleVerify}
          hasError={!!error}
          verified={verified}
          autoFocus
        />
        {!!error && (
          <Text style={{ color: FW.error, fontSize: 13.5, marginTop: 16 }}>{error}</Text>
        )}
        {verified && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <Ionicons name="checkmark-circle" size={16} color={FW.primary} />
            <Text style={{ color: FW.primary, fontSize: 13.5, fontWeight: '700' }}>Verified</Text>
          </View>
        )}
        {!verified && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24 }}>
            <Text style={{ color: FW.sec, fontSize: 14 }}>Didn't get a code?</Text>
            {canResend ? (
              <Text onPress={handleResend} style={{ color: FW.primary, fontSize: 14, fontWeight: '700' }}>
                Resend code
              </Text>
            ) : (
              <Text style={{ color: FW.muted, fontSize: 14 }}>
                Resend in 0:{countdown.toString().padStart(2, '0')}
              </Text>
            )}
          </View>
        )}
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 18, marginTop: 32 }}>
            <ActivityIndicator color={FW.primary} />
          </View>
        ) : (
          <WBtn
            label={verified ? 'Continue' : 'Verify'}
            size="lg"
            full
            dim={!verified && !isFull}
            onPress={() => (verified ? router.replace((next ?? '/(auth)/register') as any) : handleVerify())}
            style={{ marginTop: 32 }}
          />
        )}
      </AuthShell>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.stepHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/welcome')}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <StepDots step={1} total={4} />
        <Text style={styles.stepCount}>Step 2 of 4</Text>
      </View>

      <Text style={styles.title}>Verify your number</Text>

      <View style={styles.body}>
        <Text style={styles.desc}>
          Enter the {CODE_LENGTH}-digit code we sent to{' '}
          <Text style={styles.phoneHighlight}>{displayTarget}</Text>{'\n'}
          to confirm it's you.
        </Text>

        {/* OTP input */}
        <OtpInput
          value={code}
          length={CODE_LENGTH}
          onChange={(v) => { setCode(v); setError(''); }}
          onComplete={handleVerify}
          hasError={!!error}
          verified={verified}
          autoFocus
        />

        {/* Error / success state */}
        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={15} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {verified ? (
          <View style={styles.verifiedPill}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
            <Text style={styles.verifiedText}>Number verified</Text>
          </View>
        ) : null}

        {/* Resend */}
        {!verified && (
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't get a code? </Text>
            {canResend ? (
              <TouchableOpacity onPress={handleResend}>
                <Text style={styles.resendLink}>Resend code</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.resendCountdown}>
                Resend in 0:{countdown.toString().padStart(2, '0')}
              </Text>
            )}
          </View>
        )}

        {/* Change phone */}
        {!verified && (
          <TouchableOpacity style={styles.changeRow} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color={Colors.primary} />
            <Text style={styles.changeText}>Change phone number</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {verified ? (
          <TouchableOpacity
            style={styles.cta}
            onPress={() => router.replace((next ?? '/(auth)/register') as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.cta, (!isFull || loading) && styles.ctaDim]}
            onPress={() => handleVerify()}
            disabled={!isFull || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.ctaText}>Verify</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            i === step && dotStyles.dotActive,
            i < step && dotStyles.dotDone,
          ]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { width: 20, borderRadius: 4, backgroundColor: Colors.primary },
  dotDone: { backgroundColor: Colors.primaryDim, opacity: 0.6 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  stepCount: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  title: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  body: { paddingHorizontal: 20, gap: 24 },
  desc: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  phoneHighlight: { color: Colors.textPrimary, fontWeight: '600' },
  boxRow: { flexDirection: 'row', gap: 9 },
  box: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: Colors.primary },
  boxError: { borderColor: Colors.error },
  boxVerified: { backgroundColor: `${Colors.primary}1A`, borderColor: Colors.primary },
  boxInput: {
    width: '100%',
    height: '100%',
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { color: Colors.error, fontSize: 13 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    backgroundColor: `${Colors.primary}14`,
    borderWidth: 1,
    borderColor: `${Colors.primary}55`,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  verifiedText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  resendRow: { flexDirection: 'row', alignItems: 'center' },
  resendLabel: { color: Colors.textSecondary, fontSize: 14 },
  resendLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  resendCountdown: { color: Colors.textMuted, fontSize: 14 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  changeText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 14,
    minWidth: 130,
    alignItems: 'center',
  },
  ctaDim: { opacity: 0.4 },
  ctaText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
});
