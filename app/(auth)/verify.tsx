import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [focused, setFocused] = useState(0);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(27);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const code = digits.join('');
  const isFull = code.length === CODE_LENGTH;

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  function handleDigit(value: string, index: number) {
    const char = value.slice(-1);
    if (char && !/\d/.test(char)) return;
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError('');
    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
      setFocused(index + 1);
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
      setFocused(index - 1);
    }
  }

  async function handleVerify() {
    if (!isFull) return;
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: phone ?? '',
      token: code,
      type: 'sms',
    });
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
    await supabase.auth.signInWithOtp({ phone: phone ?? '' });
  }

  const displayPhone = phone
    ? `+254 ${phone.replace(/^(\+?254)?/, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}`
    : '+254 ···';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.stepHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <StepDots step={1} total={4} />
        <Text style={styles.stepCount}>Step 2 of 4</Text>
      </View>

      <Text style={styles.title}>Verify your number</Text>

      <View style={styles.body}>
        <Text style={styles.desc}>
          We sent a 6-digit code to{' '}
          <Text style={styles.phoneHighlight}>{displayPhone}</Text>.{'\n'}
          Enter it below to confirm it's you.
        </Text>

        {/* OTP boxes */}
        <View style={styles.boxRow}>
          {digits.map((d, i) => {
            const isActive = focused === i && !verified;
            const isError = !!error;
            const isVerified = verified;
            return (
              <View
                key={i}
                style={[
                  styles.box,
                  isActive && styles.boxActive,
                  isError && styles.boxError,
                  isVerified && styles.boxVerified,
                ]}
              >
                <TextInput
                  ref={(r) => { inputRefs.current[i] = r; }}
                  style={styles.boxInput}
                  value={d}
                  onChangeText={(v) => handleDigit(v, i)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                  onFocus={() => setFocused(i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  textAlign="center"
                  caretHidden
                  editable={!verified}
                />
              </View>
            );
          })}
        </View>

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
            onPress={() => router.push('/(auth)/register')}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.cta, (!isFull || loading) && styles.ctaDim]}
            onPress={handleVerify}
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
