import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getUserProfile, updateProfile, uploadAvatar, type Profile } from '@/lib/supabase';
import { Dropdown } from '@/components/Dropdown';
import { DatePicker } from '@/components/DatePicker';
import { Colors } from '@/constants/colors';
import { notify } from '@/lib/ui';
import { pickImageFromLibrary } from '@/lib/media';
import { GENDERS, COUNTRIES, VISIBILITY_OPTIONS } from '@/lib/options';

type Form = {
  name: string;
  username: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  country: string;
  favourite_club: string;
  height: string;
  weight: string;
  visibility: string;
  avatarUri: string;
};

// ── Web-native controls ──────────────────────────────────────────────────────
// RN Modal-based pickers misbehave on web (stuck overlays, unscrollable option
// lists). On web we render real DOM <select> / <input type="date"> instead —
// native scrolling, native calendar popup, zero overlay state.

const domControlStyle: Record<string, string | number> = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: Colors.textPrimary,
  fontSize: 15,
  padding: '6px 0',
  fontFamily: 'inherit',
  colorScheme: 'dark', // dark-themed native calendar/select chrome
  cursor: 'pointer',
};

function WebSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder: string;
}) {
  return React.createElement(
    'select',
    {
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: { ...domControlStyle, color: value ? Colors.textPrimary : Colors.textMuted },
    },
    React.createElement('option', { value: '', disabled: true, hidden: true }, placeholder),
    ...options.map((o) =>
      React.createElement('option', { key: o.value, value: o.value, style: { color: '#111' } }, o.label)
    ),
  );
}

function WebDate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return React.createElement('input', {
    type: 'date',
    value,
    max: new Date().toISOString().slice(0, 10),
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    style: { ...domControlStyle, color: value ? Colors.textPrimary : Colors.textMuted },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [form, setForm] = useState<Form>({
    name: '', username: '', phone: '', date_of_birth: '', gender: '', country: '',
    favourite_club: '', height: '', weight: '',
    visibility: 'public', avatarUri: '',
  });
  const [email, setEmail] = useState('');
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) { router.back(); return; }
      setUserId(user.id);
      const profile = await getUserProfile(user.id);
      if (profile) {
        setEmail(profile.email ?? '');
        setCurrentAvatarUrl(profile.avatar_url ?? '');
        setForm({
          name: profile.name ?? '',
          username: profile.username ?? '',
          phone: profile.phone ?? '',
          date_of_birth: profile.date_of_birth ?? '',
          gender: profile.gender ?? '',
          country: profile.country ?? '',
          favourite_club: profile.favourite_club ?? '',
          height: profile.height ?? '',
          weight: profile.weight ?? '',
          visibility: profile.visibility ?? 'public',
          avatarUri: '',
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  function set(key: keyof Form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function pickAvatar() {
    const uri = await pickImageFromLibrary({ aspect: [1, 1], quality: 0.8 });
    if (uri) set('avatarUri', uri);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      notify('Name required', 'Please enter your full name.');
      return;
    }
    setSaving(true);
    try {
      const data: Partial<Omit<Profile, 'id' | 'created_at' | 'is_admin'>> = {
        name: form.name.trim(),
        username: form.username.trim() || null,
        phone: form.phone.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        country: form.country || null,
        favourite_club: form.favourite_club.trim() || null,
        height: form.height.trim() || null,
        weight: form.weight.trim() || null,
        visibility: form.visibility || 'public',
      };

      if (form.avatarUri) {
        data.avatar_url = await uploadAvatar(userId, form.avatarUri);
      }

      await updateProfile(userId, data);
      notify('Saved', 'Profile updated.');
      router.back();
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Failed to save. Please try again.';
      if (msg.includes('duplicate key') && msg.includes('username')) {
        msg = 'That username is already taken — pick another.';
      }
      notify('Error', msg);
    } finally {
      setSaving(false);
    }
  }

  const displayAvatar = form.avatarUri || currentAvatarUrl;
  const initials = form.name
    ? form.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Personal Info</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Avatar */}
            <View style={styles.avatarSection}>
              <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.85}>
                {displayAvatar ? (
                  <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.cameraOverlay}>
                  <Ionicons name="camera" size={14} color={Colors.background} />
                </View>
              </TouchableOpacity>
              <Text style={styles.changePhotoText}>Tap to change photo</Text>
            </View>

            {/* ── Personal Info ── */}
            <Text style={styles.sectionLabel}>Personal Info</Text>
            <View style={styles.card}>
              <Field label="Full Name" value={form.name} onChangeText={(v) => set('name', v)}
                placeholder="Alex Kamau" autoCapitalize="words" />
              <View style={styles.divider} />
              <Field label="Username" value={form.username}
                onChangeText={(v) => set('username', v.replace(/\s/g, '').toLowerCase())}
                placeholder="alexkamau" autoCapitalize="none" prefix="@" />
              <View style={styles.divider} />
              <Field label="Phone" value={form.phone} onChangeText={(v) => set('phone', v)}
                placeholder="+254712345678" keyboardType="number-pad" />
              <View style={styles.divider} />
              <Field label="Email" value={email} onChangeText={() => {}} disabled />
            </View>

            {/* ── About You ── */}
            <Text style={styles.sectionLabel}>About You</Text>
            <View style={styles.card}>
              {isWeb ? (
                <LabeledRow label="Date of Birth">
                  <WebDate value={form.date_of_birth} onChange={(v) => set('date_of_birth', v)} />
                </LabeledRow>
              ) : (
                <DatePicker
                  label="Date of Birth"
                  value={form.date_of_birth}
                  onChange={(v) => set('date_of_birth', v)}
                  flat
                />
              )}
              <View style={styles.divider} />
              {isWeb ? (
                <LabeledRow label="Gender">
                  <WebSelect value={form.gender} onChange={(v) => set('gender', v)}
                    options={GENDERS} placeholder="Select gender" />
                </LabeledRow>
              ) : (
                <Dropdown label="Gender" value={form.gender} options={GENDERS}
                  onChange={(v) => set('gender', v)} placeholder="Select gender" flat />
              )}
              <View style={styles.divider} />
              {isWeb ? (
                <LabeledRow label="Country">
                  <WebSelect value={form.country} onChange={(v) => set('country', v)}
                    options={COUNTRIES} placeholder="Select country" />
                </LabeledRow>
              ) : (
                <Dropdown label="Country" value={form.country} options={COUNTRIES}
                  onChange={(v) => set('country', v)} placeholder="Select country" flat />
              )}
            </View>

            {/* ── Physical ── */}
            <Text style={styles.sectionLabel}>Physical</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Field label="Height" value={form.height} onChangeText={(v) => set('height', v)}
                    placeholder="e.g. 178 cm" />
                </View>
                <View style={styles.rowDivider} />
                <View style={styles.half}>
                  <Field label="Weight" value={form.weight} onChangeText={(v) => set('weight', v)}
                    placeholder="e.g. 75 kg" />
                </View>
              </View>
              <View style={styles.divider} />
              <Field label="Favourite Club" value={form.favourite_club}
                onChangeText={(v) => set('favourite_club', v)} placeholder="e.g. Arsenal" />
            </View>

            {/* ── Account ── */}
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.card}>
              {isWeb ? (
                <LabeledRow label="Profile Visibility">
                  <WebSelect value={form.visibility} onChange={(v) => set('visibility', v)}
                    options={VISIBILITY_OPTIONS} placeholder="Select visibility" />
                </LabeledRow>
              ) : (
                <Dropdown label="Profile Visibility" value={form.visibility}
                  options={VISIBILITY_OPTIONS} onChange={(v) => set('visibility', v)}
                  placeholder="Select visibility" flat />
              )}
            </View>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LabeledRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={fieldStyles.containerPadded}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, autoCapitalize, prefix, disabled,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  prefix?: string;
  disabled?: boolean;
}) {
  return (
    <View style={fieldStyles.containerPadded}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={fieldStyles.inputRow}>
        {prefix ? <Text style={fieldStyles.prefix}>{prefix}</Text> : null}
        <TextInput
          style={[fieldStyles.input, disabled && fieldStyles.inputDisabled]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          autoCorrect={false}
          editable={!disabled}
        />
      </View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  containerPadded: { gap: 4, paddingVertical: 12 },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefix: {
    color: Colors.textSecondary,
    fontSize: 15,
    marginRight: 2,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    paddingVertical: 2,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputDisabled: {
    color: Colors.textMuted,
  },
});

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    paddingHorizontal: 16,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },
  center: { paddingTop: 80, alignItems: 'center' },
  avatarSection: { alignItems: 'center', gap: 10, marginBottom: 32 },
  avatarWrap: { position: 'relative' },
  avatarImage: { width: 90, height: 90, borderRadius: 45 },
  avatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { color: Colors.background, fontSize: 30, fontWeight: '800' },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  changePhotoText: { color: Colors.textMuted, fontSize: 13 },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rowDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  half: {
    flex: 1,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
});
