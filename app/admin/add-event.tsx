import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase, uploadEventImage } from '@/lib/supabase';
import { Dropdown } from '@/components/Dropdown';
import { DatePicker } from '@/components/DatePicker';
import { TimePicker } from '@/components/TimePicker';
import { Colors } from '@/constants/colors';
import { SPORTS, DURATION_OPTIONS } from '@/lib/options';

const now = new Date();
const TODAY_ISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const currentYear = now.getFullYear();
const EVENT_YEARS = Array.from({ length: 3 }, (_, i) => {
  const y = currentYear + i;
  return { label: String(y), value: String(y) };
});

export type FormState = {
  title: string;
  sport: string;
  description: string;
  date: string;
  time: string;
  location: string;
  location_full: string;
  duration: string;
  mode: string;
  cost_in_credits: string;
  slots_available: string;
  image_url: string;
  imageUri: string;
  is_free: boolean;
};

export const EMPTY_FORM: FormState = {
  title: '',
  sport: '',
  description: '',
  date: '',
  time: '',
  location: '',
  location_full: '',
  duration: '',
  mode: '',
  cost_in_credits: '0',
  slots_available: '20',
  image_url: '',
  imageUri: '',
  is_free: false,
};

export default function AddEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  function set(key: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.title.trim() || !form.sport || !form.date) {
      Alert.alert('Missing Fields', 'Title, sport, and date are required.');
      return;
    }
    setLoading(true);

    let finalImageUrl = form.image_url || null;
    if (form.imageUri) {
      const uploaded = await uploadEventImage(form.imageUri);
      if (uploaded) finalImageUrl = uploaded;
    }

    const { error } = await supabase.from('events').insert({
      title: form.title.trim(),
      sport: form.sport,
      description: form.description.trim(),
      date: form.date,
      time: /^\d{2}:\d{2}$/.test(form.time) ? form.time : null,
      location: form.location.trim(),
      location_full: form.location_full.trim(),
      duration: form.duration.trim(),
      mode: form.mode.trim(),
      cost_in_credits: parseInt(form.cost_in_credits, 10) || 0,
      slots_available: parseInt(form.slots_available, 10) || 20,
      slots_booked: 0,
      image_url: finalImageUrl,
      is_free: form.is_free,
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Event created!', [{ text: 'OK', onPress: () => router.back() }]);
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
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Add Event</Text>
          <View style={{ width: 36 }} />
        </View>

        <EventForm form={form} set={set} minDate={TODAY_ISO} />

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Text style={styles.saveButtonText}>Create Event</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function EventForm({
  form,
  set,
  minDate,
}: {
  form: FormState;
  set: (key: keyof FormState, value: string | boolean) => void;
  minDate?: string;
}) {
  const displayImage = form.imageUri || form.image_url;

  async function pickImage() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ImagePicker = require('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        set('imageUri', result.assets[0].uri);
      }
    } catch {
      Alert.alert('Not available', 'Image picker requires a native build. Run npx expo run:ios to enable it.');
    }
  }

  return (
    <View style={formStyles.container}>

      {/* Event photo */}
      <TouchableOpacity style={formStyles.imagePicker} onPress={pickImage} activeOpacity={0.8}>
        {displayImage ? (
          <>
            <Image source={{ uri: displayImage }} style={formStyles.imagePreview} />
            <View style={formStyles.imageEditBadge}>
              <Ionicons name="camera" size={14} color={Colors.background} />
            </View>
          </>
        ) : (
          <View style={formStyles.imagePlaceholder}>
            <Ionicons name="image-outline" size={36} color={Colors.textMuted} />
            <Text style={formStyles.imagePlaceholderText}>Tap to add event photo</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Core details */}
      <Text style={formStyles.sectionLabel}>Details</Text>
      <View style={formStyles.card}>
        <Field label="Title *" value={form.title} onChangeText={(v) => set('title', v)} placeholder="Football Friday" padded />
        <View style={formStyles.divider} />
        <Dropdown
          label="Sport *"
          value={form.sport}
          options={SPORTS}
          onChange={(v) => set('sport', v)}
          placeholder="Select sport"
          flat
        />
        <View style={formStyles.divider} />
        <Field label="Mode" value={form.mode} onChangeText={(v) => set('mode', v)} placeholder="5-a-side, 3-on-3…" padded />
      </View>

      {/* Date & time */}
      <Text style={formStyles.sectionLabel}>When</Text>
      <View style={formStyles.card}>
        <DatePicker
          label="Date *"
          value={form.date}
          onChange={(v) => set('date', v)}
          flat
          years={EVENT_YEARS}
          minDate={minDate}
        />
        <View style={formStyles.divider} />
        <TimePicker
          label="Time"
          value={form.time}
          onChange={(v) => set('time', v)}
          flat
        />
        <View style={formStyles.divider} />
        <Dropdown
          label="Duration"
          value={form.duration}
          options={DURATION_OPTIONS}
          onChange={(v) => set('duration', v)}
          placeholder="Select duration"
          flat
        />
      </View>

      {/* Location */}
      <Text style={formStyles.sectionLabel}>Where</Text>
      <View style={formStyles.card}>
        <Field label="Location Name" value={form.location} onChangeText={(v) => set('location', v)} placeholder="City Park, Nairobi" padded />
        <View style={formStyles.divider} />
        <Field
          label="Maps Link"
          value={form.location_full}
          onChangeText={(v) => set('location_full', v)}
          placeholder="Paste Google Maps or Apple Maps link"
          keyboardType="url"
          padded
        />
      </View>

      {/* Description */}
      <Text style={formStyles.sectionLabel}>About</Text>
      <View style={formStyles.card}>
        <Field
          label="Description"
          value={form.description}
          onChangeText={(v) => set('description', v)}
          placeholder="Tell players what to expect…"
          multiline
          padded
        />
      </View>

      {/* Capacity & cost */}
      <Text style={formStyles.sectionLabel}>Capacity & Cost</Text>
      <View style={formStyles.card}>
        <Field label="Slots Available" value={form.slots_available} onChangeText={(v) => set('slots_available', v)} placeholder="20" keyboardType="number-pad" padded />
        <View style={formStyles.divider} />
        <View style={formStyles.toggleRow}>
          <View>
            <Text style={formStyles.toggleLabel}>Free Event</Text>
            <Text style={formStyles.toggleSub}>Toggle off to set credit cost</Text>
          </View>
          <Switch
            value={form.is_free}
            onValueChange={(v) => set('is_free', v)}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.background}
          />
        </View>
        {!form.is_free && (
          <>
            <View style={formStyles.divider} />
            <Field
              label="Cost (Credits)"
              value={form.cost_in_credits}
              onChangeText={(v) => set('cost_in_credits', v)}
              placeholder="10"
              keyboardType="number-pad"
              padded
            />
          </>
        )}
      </View>

    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, multiline, padded,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'url';
  multiline?: boolean;
  padded?: boolean;
}) {
  return (
    <View style={[formStyles.field, padded && formStyles.fieldPadded]}>
      <Text style={formStyles.label}>{label}</Text>
      <TextInput
        style={[formStyles.input, multiline && formStyles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize="sentences"
        autoCorrect={false}
      />
    </View>
  );
}

const formStyles = StyleSheet.create({
  container: { gap: 0, marginBottom: 24 },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  field: { gap: 4 },
  fieldPadded: { paddingVertical: 12 },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  input: {
    color: Colors.textPrimary,
    fontSize: 15,
    paddingVertical: 2,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingVertical: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  toggleLabel: {
    color: Colors.textPrimary,
    fontSize: 15,
  },
  toggleSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  imagePicker: {
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 4,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageEditBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
});

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
});
