import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getEventById, uploadEventImage, deleteEventImage } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { notify, confirmAsync } from '@/lib/ui';
import { EventForm, type FormState } from '../add-event';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const event = await getEventById(id);
      if (!event) {
        notify('Error', 'Event not found.');
        router.back();
        return;
      }
      setForm({
        title: event.title,
        sport: event.sport,
        description: event.description,
        date: event.date,
        time: event.time ?? '',
        location: event.location,
        location_details: event.location_details ?? '',
        maps_url: event.maps_url ?? '',
        duration: event.duration ?? '',
        mode: event.mode ?? '',
        cost_in_credits: String(event.cost_in_credits),
        slots_available: String(event.slots_available),
        image_url: event.image_url ?? '',
        imageUri: '',
        is_free: event.is_free,
      });
      setLoading(false);
    }
    load();
  }, [id]);

  function set(key: keyof FormState, value: string | boolean) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function handleSave() {
    if (!form) return;
    if (!form.title.trim() || !form.sport || !form.date) {
      notify('Missing Fields', 'Title, sport, and date are required.');
      return;
    }
    setSaving(true);

    const previousImageUrl = form.image_url || null;
    let finalImageUrl = previousImageUrl;
    if (form.imageUri) {
      try {
        finalImageUrl = await uploadEventImage(form.imageUri, id);
      } catch (e) {
        setSaving(false);
        notify('Image upload failed', `${e instanceof Error ? e.message : e}\nYour changes were not saved — please try again.`);
        return;
      }
    }

    const { error } = await supabase.from('events').update({
      title: form.title.trim(),
      sport: form.sport,
      description: form.description.trim(),
      date: form.date,
      time: /^\d{2}:\d{2}$/.test(form.time) ? form.time : null,
      location: form.location.trim(),
      location_details: form.location_details.trim() || null,
      maps_url: form.maps_url.trim() || null,
      duration: form.duration.trim(),
      mode: form.mode.trim(),
      cost_in_credits: parseInt(form.cost_in_credits, 10) || 0,
      slots_available: parseInt(form.slots_available, 10) || 20,
      image_url: finalImageUrl,
      is_free: form.is_free,
    }).eq('id', id);

    setSaving(false);
    if (error) {
      notify('Error', error.message);
    } else {
      // Image was replaced — clean up the old file (fire-and-forget)
      if (previousImageUrl && finalImageUrl !== previousImageUrl) {
        deleteEventImage(previousImageUrl);
      }
      notify('Saved', 'Event updated successfully.');
      router.back();
    }
  }

  async function handleDelete() {
    const ok = await confirmAsync('Delete Event', 'Are you sure? This cannot be undone.', 'Delete', true);
    if (!ok) return;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) {
      notify('Error', error.message);
    } else {
      router.back();
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
          <Text style={styles.title}>Edit Event</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        </View>

        {loading || !form ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <>
            <EventForm form={form} set={set} />

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
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { paddingTop: 80, alignItems: 'center' },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
});
