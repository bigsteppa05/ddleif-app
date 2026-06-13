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
import { Colors } from '@/constants/colors';
import { AuthShell, AuthHeading, LimeLink, WBtn, FW, useIsDesktopWeb } from '@/components/web/kit';
import { WField } from '@/components/web/WField';

export default function ForgotScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    // Web: link must open in the browser; native: use the app's deep-link scheme
    const redirectTo = Platform.OS === 'web'
      ? `${window.location.origin}/reset-password`
      : 'fitxball://reset-password';
    await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
    setLoading(false);
    // Navigate to check-inbox regardless (Supabase doesn't leak whether email exists)
    router.push({ pathname: '/(auth)/check-inbox', params: { email: trimmed } });
  }

  if (isDesktop) {
    return (
      <AuthShell
        footer={
          <Text style={{ fontSize: 13.5, color: FW.sec }}>
            Remembered it? <LimeLink onPress={() => router.back()}>Back to sign in</LimeLink>
          </Text>
        }
      >
        <AuthHeading
          title="Reset your password"
          sub="Enter the email on your account and we'll send you a secure link to set a new password."
        />
        <View style={{ gap: 20 }}>
          <WField
            label="Email"
            value={email}
            onChangeText={(v) => { setEmail(v); setError(''); }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleSend}
            error={error || undefined}
            autoFocus
          />
          {loading ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <ActivityIndicator color={FW.primary} />
            </View>
          ) : (
            <WBtn label="Send Reset Link" size="lg" full onPress={handleSend} />
          )}
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>

        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="mail-outline" size={28} color={Colors.primary} />
        </View>

        <Text style={styles.title}>Forgot password?</Text>
        <Text style={styles.desc}>
          Enter the email linked to your account and we'll send you a link to reset your password.
        </Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, !!error && styles.inputError]}
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              placeholder="you@gmail.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.buttonText}>Send reset link</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Remembered it? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.footerLink}>Back to sign in</Text>
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
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 26, fontWeight: '800', letterSpacing: -0.3,
    marginBottom: 12,
  },
  desc: {
    color: Colors.textSecondary,
    fontSize: 15, lineHeight: 22,
    marginBottom: 28,
  },
  form: { gap: 20, marginBottom: 32 },
  field: { gap: 8 },
  label: {
    color: Colors.textSecondary,
    fontSize: 12, fontWeight: '600',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 16,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  inputError: { borderColor: Colors.error },
  errorText: { color: Colors.error, fontSize: 12 },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 28, paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: Colors.textSecondary, fontSize: 15 },
  footerLink: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
});
