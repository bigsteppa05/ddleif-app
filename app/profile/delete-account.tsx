import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { deleteAccount } from '@/lib/supabase';

const REMOVED = [
  'Your profile — name, username, photo, and contact details',
  'Your bookings and check-in history',
  'Your credit balance and top-up (payment) history',
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runDelete() {
    setError('');
    setLoading(true);
    const { error: delError } = await deleteAccount();
    setLoading(false);
    if (delError) {
      setError(delError);
      return;
    }
    // Account + local session are gone — send them to the start.
    router.replace('/(auth)/welcome');
  }

  function confirmDelete() {
    if (loading) return;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' &&
        window.confirm('Permanently delete your fitXball account? This cannot be undone.')) {
        runDelete();
      }
      return;
    }
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: runDelete },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} disabled={loading}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delete account</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <Ionicons name="trash-outline" size={28} color={Colors.error} />
        </View>
        <Text style={styles.title}>Permanently delete your account</Text>
        <Text style={styles.sub}>
          This can’t be undone. Deleting your account immediately removes:
        </Text>

        <View style={styles.list}>
          {REMOVED.map((item) => (
            <View key={item} style={styles.listRow}>
              <Ionicons name="close-circle" size={18} color={Colors.error} style={{ marginTop: 1 }} />
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          Some transaction records may be retained where required by law. You’ll be signed out
          right away, and you can create a new account any time.
        </Text>

        {!!error && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.deleteBtn, loading && styles.deleteBtnDisabled]}
          onPress={confirmDelete}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.deleteBtnText}>Delete my account</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} disabled={loading}>
          <Text style={styles.cancelBtnText}>Keep my account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  content: { paddingHorizontal: 24, paddingTop: 16, alignItems: 'center', maxWidth: 520, alignSelf: 'center', width: '100%' },
  iconCircle: {
    width: 64, height: 64, borderRadius: 20, marginBottom: 20,
    backgroundColor: `${Colors.error}1A`, borderWidth: 1, borderColor: `${Colors.error}55`,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
  sub: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  list: { alignSelf: 'stretch', gap: 12, marginTop: 24 },
  listRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  listText: { flex: 1, color: Colors.textPrimary, fontSize: 14.5, lineHeight: 21 },
  note: { color: Colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 24 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  errorText: { color: Colors.error, fontSize: 13.5, flex: 1 },
  footer: { paddingHorizontal: 24, paddingTop: 12, gap: 12 },
  deleteBtn: {
    backgroundColor: Colors.error, borderRadius: 28, paddingVertical: 16, alignItems: 'center',
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '600' },
});
