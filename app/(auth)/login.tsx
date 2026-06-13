import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle, signInWithApple } from '@/lib/socialAuth';
import { Colors } from '@/constants/colors';
import { AuthShell, AuthHeading, LimeLink, WBtn, WGhostBtn, FW, useIsDesktopWeb } from '@/components/web/kit';
import { WField } from '@/components/web/WField';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');

  async function handlePasswordSignIn() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: pwError } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    setLoading(false);
    if (pwError) {
      setError(
        pwError.message === 'Invalid login credentials'
          ? 'Wrong email or password. If you signed up before passwords existed, use "Email me a code" below.'
          : pwError.message
      );
    } else {
      router.replace('/(tabs)');
    }
  }

  async function handleGoogleSignIn() {
    setSocialLoading('google');
    setError('');
    const { error: err } = await signInWithGoogle();
    setSocialLoading(null);
    if (err) setError(err);
  }

  async function handleAppleSignIn() {
    setSocialLoading('apple');
    setError('');
    const { error: err } = await signInWithApple();
    setSocialLoading(null);
    if (err) setError(err);
  }

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: trimmed });
    setLoading(false);
    if (otpError) {
      setError(otpError.message);
    } else {
      router.push({
        pathname: '/(auth)/verify',
        params: { email: trimmed, type: 'email', next: '/(tabs)' },
      });
    }
  }

  if (isDesktop) {
    return (
      <AuthShell
        footer={
          <Text style={{ fontSize: 13.5, color: FW.sec }}>
            New to fitXball? <LimeLink onPress={() => router.replace('/(auth)/register')}>Create an account</LimeLink>
          </Text>
        }
      >
        <AuthHeading
          title="Welcome back"
          sub={mode === 'password'
            ? 'Sign in with your email and password.'
            : "Sign in with your email — we'll send you a code. No password needed."}
        />
        <View style={{ gap: 20 }}>
          <WField
            label="Email"
            value={email}
            onChangeText={(v) => { setEmail(v.trimStart()); setError(''); }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={mode === 'password' ? undefined : handleSendCode}
            error={mode === 'otp' ? (error || undefined) : undefined}
            autoFocus
          />
          {mode === 'password' && (
            <WField
              label="Password"
              value={password}
              onChangeText={(v) => { setPassword(v); setError(''); }}
              placeholder="Your password"
              secureTextEntry
              onSubmitEditing={handlePasswordSignIn}
              error={error || undefined}
            />
          )}
          {mode === 'password' && (
            <Text style={{ fontSize: 13, color: FW.sec, marginTop: -8 }}>
              <LimeLink onPress={() => router.push('/(auth)/forgot')}>Forgot password?</LimeLink>
            </Text>
          )}
          {loading ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <ActivityIndicator color={FW.primary} />
            </View>
          ) : mode === 'password' ? (
            <WBtn label="Sign In" size="lg" full onPress={handlePasswordSignIn} />
          ) : (
            <WBtn label="Send Code" size="lg" full onPress={handleSendCode} />
          )}
          <Text style={{ fontSize: 13.5, color: FW.sec, textAlign: 'center' }}>
            {mode === 'password' ? (
              <LimeLink onPress={() => { setMode('otp'); setError(''); }}>Email me a code instead</LimeLink>
            ) : (
              <LimeLink onPress={() => { setMode('password'); setError(''); }}>Use my password instead</LimeLink>
            )}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: FW.borderSoft }} />
            <Text style={{ color: FW.muted, fontSize: 13 }}>or continue with</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: FW.borderSoft }} />
          </View>
          <WGhostBtn
            label={socialLoading === 'google' ? 'Connecting…' : 'Google'}
            icon="logo-google"
            full
            onPress={handleGoogleSignIn}
          />
        </View>
      </AuthShell>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoSection}>
          <Text style={styles.logo}>fitXball</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, !!error && styles.inputError]}
              value={email}
              onChangeText={(v) => { setEmail(v.trimStart()); setError(''); }}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType={mode === 'password' ? 'next' : 'done'}
              onSubmitEditing={mode === 'otp' ? handleSendCode : undefined}
              autoFocus
            />
          </View>

          {mode === 'password' && (
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={[styles.input, !!error && styles.inputError]}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                placeholder="Your password"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handlePasswordSignIn}
              />
              <TouchableOpacity onPress={() => router.push('/(auth)/forgot')}>
                <Text style={styles.footerLink}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
          )}

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={mode === 'password' ? handlePasswordSignIn : handleSendCode}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.background} />
              : <Text style={styles.buttonText}>{mode === 'password' ? 'Sign In' : 'Send Code'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setMode(mode === 'password' ? 'otp' : 'password'); setError(''); }}>
            <Text style={[styles.hint, { color: Colors.primary, fontWeight: '700' }]}>
              {mode === 'password' ? 'Email me a code instead' : 'Use my password instead'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social buttons */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={handleGoogleSignIn}
            disabled={!!socialLoading}
            activeOpacity={0.8}
          >
            {socialLoading === 'google'
              ? <ActivityIndicator size="small" color={Colors.textPrimary} />
              : <>
                  <Ionicons name="logo-google" size={20} color={Colors.textPrimary} />
                  <Text style={styles.socialBtnText}>Google</Text>
                </>
            }
          </TouchableOpacity>

          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.socialBtn}
              onPress={handleAppleSignIn}
              disabled={!!socialLoading}
              activeOpacity={0.8}
            >
              {socialLoading === 'apple'
                ? <ActivityIndicator size="small" color={Colors.textPrimary} />
                : <>
                    <Ionicons name="logo-apple" size={20} color={Colors.textPrimary} />
                    <Text style={styles.socialBtnText}>Apple</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/register')}>
            <Text style={styles.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 24 },
  logoSection: { marginBottom: 36 },
  logo: {
    color: Colors.primary,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 40,
    marginBottom: 8,
  },
  subtitle: { color: Colors.textSecondary, fontSize: 16 },
  form: { gap: 20, marginBottom: 32 },
  field: { gap: 8 },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputError: { borderColor: Colors.error },
  errorText: { color: Colors.error, fontSize: 13 },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
  hint: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: 13 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 28,
    paddingVertical: 13,
    backgroundColor: Colors.surface,
  },
  socialBtnText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: Colors.textSecondary, fontSize: 15 },
  footerLink: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
});
