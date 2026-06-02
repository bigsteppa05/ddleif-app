import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

export default function CheckInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { email } = useLocalSearchParams<{ email: string }>();

  async function handleResend() {
    if (!email) return;
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'fieldd://reset-password',
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
      </TouchableOpacity>

      <View style={styles.center}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="mail-outline" size={46} color={Colors.primary} />
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={15} color={Colors.background} />
          </View>
        </View>

        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.desc}>
          We sent a reset link to{'\n'}
          <Text style={styles.emailHighlight}>{email ?? 'your email'}</Text>.
          {'\n'}Tap the link in the email to set a new password.
        </Text>

        <View style={styles.actions}>
          {/* Open Gmail */}
          <TouchableOpacity
            style={styles.gmailBtn}
            onPress={() => Linking.openURL('googlegmail://')}
            activeOpacity={0.85}
          >
            <Ionicons name="mail-outline" size={18} color={Colors.textPrimary} />
            <Text style={styles.gmailBtnText}>Open Gmail</Text>
          </TouchableOpacity>

          <Text style={styles.resendRow}>
            Didn't get it?{' '}
            <Text style={styles.resendLink} onPress={handleResend}>Resend email</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  iconWrap: {
    width: 96, height: 96, borderRadius: 28,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    marginBottom: 26,
  },
  checkBadge: {
    position: 'absolute', top: -8, right: -8,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.background,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 26, fontWeight: '800', letterSpacing: -0.3,
    marginBottom: 14, textAlign: 'center',
  },
  desc: {
    color: Colors.textSecondary,
    fontSize: 15, lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 32,
  },
  emailHighlight: { color: Colors.textPrimary, fontWeight: '600' },
  actions: { width: '100%', gap: 16, alignItems: 'center' },
  gmailBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 28, paddingVertical: 16,
  },
  gmailBtnText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  resendRow: { color: Colors.textSecondary, fontSize: 14 },
  resendLink: { color: Colors.primary, fontWeight: '700' },
});
