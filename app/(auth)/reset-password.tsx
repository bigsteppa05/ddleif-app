import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

function ReqRow({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={14}
        color={met ? Colors.primary : Colors.textMuted}
      />
      <Text style={{ color: met ? Colors.primary : Colors.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pwReqs = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const pwValid = pwReqs.length && pwReqs.upper && pwReqs.number;
  const confirmMatch = password === confirm && confirm.length > 0;

  async function handleReset() {
    if (!pwValid) { setError("Password doesn't meet all requirements."); return; }
    if (!confirmMatch) { setError('Passwords do not match.'); return; }
    setError('');
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      Alert.alert('Password reset', 'Your password has been updated.', [
        { text: 'Sign in', onPress: () => router.replace('/(auth)/login') },
      ]);
    }
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
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed-outline" size={26} color={Colors.primary} />
        </View>

        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.desc}>Create a new secure password for your account.</Text>

        <View style={styles.form}>
          {/* New password */}
          <View style={styles.field}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.inputInner}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                placeholder="Min 8 characters"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!passwordVisible}
                autoCorrect={false}
                returnKeyType="next"
              />
              <TouchableOpacity onPress={() => setPasswordVisible((p) => !p)} style={styles.eyeBtn}>
                <Ionicons
                  name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
            {password.length > 0 && (
              <View style={{ gap: 6, marginTop: 4 }}>
                <ReqRow met={pwReqs.length} label="At least 8 characters" />
                <ReqRow met={pwReqs.upper} label="One uppercase letter" />
                <ReqRow met={pwReqs.number} label="One number" />
              </View>
            )}
          </View>

          {/* Confirm password */}
          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={[styles.inputWrap, !!confirm && !confirmMatch && styles.inputWrapError]}>
              <TextInput
                style={styles.inputInner}
                value={confirm}
                onChangeText={(v) => { setConfirm(v); setError(''); }}
                placeholder="Re-enter password"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!confirmVisible}
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleReset}
              />
              {confirmMatch ? (
                <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginRight: 14 }} />
              ) : (
                <TouchableOpacity onPress={() => setConfirmVisible((p) => !p)} style={styles.eyeBtn}>
                  <Ionicons name={confirmVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, (!pwValid || !confirmMatch || loading) && styles.buttonDisabled]}
            onPress={handleReset}
            activeOpacity={0.85}
            disabled={!pwValid || !confirmMatch || loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.buttonText}>Reset password</Text>
            )}
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
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', letterSpacing: -0.3, marginBottom: 10 },
  desc: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  form: { gap: 20 },
  field: { gap: 8 },
  label: {
    color: Colors.textSecondary, fontSize: 12, fontWeight: '600',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, paddingLeft: 16,
  },
  inputWrapError: { borderColor: Colors.error },
  inputInner: { flex: 1, color: Colors.textPrimary, fontSize: 16, paddingVertical: 14 },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  errorText: { color: Colors.error, fontSize: 13 },
  button: {
    backgroundColor: Colors.primary, borderRadius: 28,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
});
