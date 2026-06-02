import { useState, useRef } from 'react';
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

type Method = 'phone' | 'email';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<Method>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);

  async function handleSignIn() {
    const identifier = method === 'phone'
      ? `+254${phone.replace(/\D/g, '')}`
      : email.trim().toLowerCase();

    if (!identifier || !password) {
      setError(`Please enter your ${method === 'phone' ? 'phone number' : 'email'} and password.`);
      return;
    }
    setError('');
    setLoading(true);

    // Always sign in via email/password; phone is stored in profile but auth uses email
    const loginEmail = method === 'phone' ? '' : identifier;

    if (method === 'phone') {
      // Look up email from phone number in profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('phone', `+254${phone.replace(/\D/g, '')}`)
        .maybeSingle();

      if (!profile?.email) {
        setLoading(false);
        setError('No account found with that phone number.');
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });
      setLoading(false);
      if (signInError) {
        setError('Incorrect phone number or password.');
      } else {
        router.replace('/(tabs)');
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      setLoading(false);
      if (signInError) {
        setError(signInError.message);
      } else {
        router.replace('/(tabs)');
      }
    }
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
        {/* Logo */}
        <View style={styles.logoSection}>
          <Text style={styles.logo}>fieldd</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        {/* Phone / Email toggle */}
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleTab, method === 'phone' && styles.toggleTabActive]}
            onPress={() => { setMethod('phone'); setError(''); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleTabText, method === 'phone' && styles.toggleTabTextActive]}>Phone</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleTab, method === 'email' && styles.toggleTabActive]}
            onPress={() => { setMethod('email'); setError(''); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleTabText, method === 'email' && styles.toggleTabTextActive]}>Email</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {method === 'phone' ? (
            <View style={styles.field}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={[styles.phoneWrap, !!error && styles.inputError]}>
                <View style={styles.prefix}>
                  <Text style={styles.flag}>🇰🇪</Text>
                  <Text style={styles.prefixCode}>+254</Text>
                  <Ionicons name="chevron-down" size={12} color={Colors.textMuted} />
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={(v) => { setPhone(v.replace(/\D/g, '')); setError(''); }}
                  placeholder="712 345 678"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>
            </View>
          ) : (
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, !!error && styles.inputError]}
                value={email}
                onChangeText={(v) => { setEmail(v); setError(''); }}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                ref={passwordRef}
                style={styles.passwordInput}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!passwordVisible}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />
              <TouchableOpacity onPress={() => setPasswordVisible((p) => !p)} style={styles.eyeBtn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Ionicons
                  name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.forgotRow} onPress={() => router.push('/(auth)/forgot')}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
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
  logoSection: { marginBottom: 28 },
  logo: {
    color: Colors.primary,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 40,
    marginBottom: 8,
  },
  subtitle: { color: Colors.textSecondary, fontSize: 16 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    gap: 4,
    marginBottom: 20,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  toggleTabActive: { backgroundColor: Colors.primary },
  toggleTabText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  toggleTabTextActive: { color: Colors.background },
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
  phoneWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  prefix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  flag: { fontSize: 18 },
  prefixCode: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    letterSpacing: 0.3,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: 16,
  },
  passwordInput: { flex: 1, color: Colors.textPrimary, fontSize: 16, paddingVertical: 14 },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  forgotRow: { alignItems: 'flex-end', marginTop: -8 },
  forgotText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  errorText: { color: Colors.error, fontSize: 13, marginTop: -8 },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: Colors.textSecondary, fontSize: 15 },
  footerLink: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
});
