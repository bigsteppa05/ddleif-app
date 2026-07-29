import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { notify } from '@/lib/ui';
import { useAppConfig, useRefreshAppConfig } from '@/components/AppConfigProvider';
import { updateAppConfig, type AppBanner, type CreditPack } from '@/lib/appConfig';

// First-class event controls surfaced as labelled toggles (rather than raw flag
// keys). These map to entries in app_config.feature_flags read via useFlag().
const EVENT_FLAGS: { key: string; label: string; sub: string }[] = [
  {
    key: 'hide_attendees',
    label: 'Hide attendees',
    sub: "Hides the participant list and 'going' counts across the app.",
  },
  {
    key: 'booking_sold_out',
    label: 'Booking sold out',
    sub: "Shows 'Sold out' and disables the Book button on all events.",
  },
];

// Small labelled toggle pill.
function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.toggle, { backgroundColor: on ? Colors.primary : Colors.surfaceElevated }]}
    >
      <View style={[styles.knob, { alignSelf: on ? 'flex-end' : 'flex-start' }]} />
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export default function AdminConfigScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const config = useAppConfig();
  const refresh = useRefreshAppConfig();

  // Local editable copies seeded from the live config.
  const [paymentsLive, setPaymentsLive] = useState(config.payments_live);
  const [kesPerCredit, setKesPerCredit] = useState(String(config.kes_per_credit));
  const [minCredits, setMinCredits] = useState(String(config.min_credits));
  const [flags, setFlags] = useState<Record<string, boolean>>(config.feature_flags);
  const [newFlag, setNewFlag] = useState('');
  const [content, setContent] = useState<Record<string, string>>(config.content);
  const [newContentKey, setNewContentKey] = useState('');
  const [banner, setBanner] = useState<AppBanner>(config.banner ?? { enabled: false, tone: 'info' });
  // Advanced: packs edited as JSON so discounts/labels stay flexible.
  const [packsJson, setPacksJson] = useState(JSON.stringify(config.credit_packs, null, 2));
  const [saving, setSaving] = useState(false);

  function setBannerField<K extends keyof NonNullable<AppBanner>>(key: K, value: NonNullable<AppBanner>[K]) {
    setBanner((b) => ({ ...(b ?? {}), [key]: value }));
  }

  async function handleSave() {
    // Validate numeric price.
    const kes = Number(kesPerCredit);
    if (!isFinite(kes) || kes <= 0) {
      notify('Invalid price', 'KES per credit must be a positive number.');
      return;
    }
    const min = Math.round(Number(minCredits));
    if (!isFinite(min) || min < 1) {
      notify('Invalid minimum', 'Minimum credits must be a positive whole number.');
      return;
    }
    // Validate packs JSON.
    let packs: CreditPack[];
    try {
      const parsed = JSON.parse(packsJson);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      packs = parsed;
    } catch {
      notify('Invalid packs', 'Credit packs must be valid JSON (an array).');
      return;
    }

    setSaving(true);
    try {
      await updateAppConfig({
        payments_live: paymentsLive,
        kes_per_credit: kes,
        min_credits: min,
        feature_flags: flags,
        content,
        credit_packs: packs,
        banner: banner?.enabled || banner?.text ? banner : null,
      });
      await refresh();
      notify('Saved', 'Config updated — live for all users.');
      if (router.canGoBack()) router.back();
    } catch (err) {
      notify('Error', err instanceof Error ? err.message : 'Could not save config.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>App Config</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={styles.hint}>
        Changes are live for everyone on next app open (web: on refresh). No app update needed.
      </Text>

      {/* Payments */}
      <Section title="Payments">
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Payments live</Text>
            <Text style={styles.rowSub}>Shows the top-up flow to all users.</Text>
          </View>
          <Toggle on={paymentsLive} onPress={() => setPaymentsLive((v) => !v)} />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>KES per credit</Text>
          <TextInput
            style={styles.numInput}
            value={kesPerCredit}
            onChangeText={setKesPerCredit}
            keyboardType="number-pad"
            placeholder="10"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Minimum credits per top-up</Text>
          <TextInput
            style={styles.numInput}
            value={minCredits}
            onChangeText={setMinCredits}
            keyboardType="number-pad"
            placeholder="25"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </Section>

      {/* Event controls — first-class labelled toggles */}
      <Section title="Event controls">
        {EVENT_FLAGS.map((f, i) => (
          <View key={f.key}>
            {i > 0 && <View style={styles.divider} />}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{f.label}</Text>
                <Text style={styles.rowSub}>{f.sub}</Text>
              </View>
              <Toggle
                on={!!flags[f.key]}
                onPress={() => setFlags((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
              />
            </View>
          </View>
        ))}
      </Section>

      {/* Other feature flags (raw keys) */}
      <Section title="Other feature flags">
        {(() => {
          const known = new Set(EVENT_FLAGS.map((f) => f.key));
          const extra = Object.entries(flags).filter(([name]) => !known.has(name));
          return extra.length === 0 ? (
            <Text style={styles.empty}>No other flags.</Text>
          ) : (
            extra.map(([name, on], i, arr) => (
              <View key={name}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{name}</Text>
                  <Toggle on={on} onPress={() => setFlags((f) => ({ ...f, [name]: !f[name] }))} />
                </View>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </View>
            ))
          );
        })()}
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            value={newFlag}
            onChangeText={setNewFlag}
            placeholder="new_flag_name"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              const key = newFlag.trim();
              if (key) { setFlags((f) => ({ ...f, [key]: true })); setNewFlag(''); }
            }}
          >
            <Ionicons name="add" size={18} color={Colors.background} />
          </TouchableOpacity>
        </View>
      </Section>

      {/* Promo banner */}
      <Section title="Promo banner">
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Enabled</Text>
          <Toggle on={!!banner?.enabled} onPress={() => setBannerField('enabled', !banner?.enabled)} />
        </View>
        <View style={styles.divider} />
        <TextInput
          style={styles.textArea}
          value={banner?.text ?? ''}
          onChangeText={(v) => setBannerField('text', v)}
          placeholder="Banner message"
          placeholderTextColor={Colors.textMuted}
          multiline
        />
        <View style={styles.divider} />
        <TextInput
          style={styles.lineInput}
          value={banner?.cta_label ?? ''}
          onChangeText={(v) => setBannerField('cta_label', v)}
          placeholder="Button label (optional)"
          placeholderTextColor={Colors.textMuted}
        />
        <View style={styles.divider} />
        <TextInput
          style={styles.lineInput}
          value={banner?.cta_url ?? ''}
          onChangeText={(v) => setBannerField('cta_url', v)}
          placeholder="https://button-link (optional)"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
        />
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Tone</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['info', 'success', 'warning'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setBannerField('tone', t)}
                style={[styles.tone, { borderColor: banner?.tone === t ? Colors.primary : Colors.border }]}
              >
                <Text style={{ color: banner?.tone === t ? Colors.primary : Colors.textSecondary, fontSize: 12.5 }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Section>

      {/* Editable copy */}
      <Section title="Editable copy">
        {Object.keys(content).length === 0 && <Text style={styles.empty}>No content keys yet.</Text>}
        {Object.entries(content).map(([key, val]) => (
          <View key={key} style={{ marginBottom: 10 }}>
            <Text style={styles.contentKey}>{key}</Text>
            <TextInput
              style={styles.lineInput}
              value={val}
              onChangeText={(v) => setContent((c) => ({ ...c, [key]: v }))}
              placeholder="text"
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>
        ))}
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            value={newContentKey}
            onChangeText={setNewContentKey}
            placeholder="new_content_key"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              const key = newContentKey.trim();
              if (key) { setContent((c) => ({ ...c, [key]: '' })); setNewContentKey(''); }
            }}
          >
            <Ionicons name="add" size={18} color={Colors.background} />
          </TouchableOpacity>
        </View>
      </Section>

      {/* Advanced */}
      <Section title="Credit packs (advanced — JSON)">
        <TextInput
          style={styles.jsonInput}
          value={packsJson}
          onChangeText={setPacksJson}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder='[{"credits":10,"discount":0}]'
          placeholderTextColor={Colors.textMuted}
        />
        <Text style={styles.rowSub}>Each: {'{'} credits, discount (0–1), label? {'}'}. Price = credits × KES × (1 − discount).</Text>
      </Section>

      <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
        {saving ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.saveText}>Save changes</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, width: '100%', maxWidth: 620, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backButton: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, color: Colors.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  hint: { color: Colors.textMuted, fontSize: 12.5, marginBottom: 20, paddingHorizontal: 4, lineHeight: 18 },
  section: { marginBottom: 20 },
  sectionLabel: {
    color: Colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4,
  },
  card: { backgroundColor: Colors.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  rowLabel: { color: Colors.textPrimary, fontSize: 14.5, fontWeight: '600', flexShrink: 1 },
  rowSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 2 },
  empty: { color: Colors.textMuted, fontSize: 13, paddingVertical: 10 },
  numInput: {
    marginLeft: 'auto', minWidth: 80, textAlign: 'right', color: Colors.textPrimary,
    fontSize: 15, fontWeight: '700',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  lineInput: {
    color: Colors.textPrimary, fontSize: 14.5, paddingVertical: 10,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  textArea: {
    color: Colors.textPrimary, fontSize: 14.5, paddingVertical: 10, minHeight: 44,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  contentKey: { color: Colors.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 8, fontFamily: mono },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  addInput: {
    flex: 1, color: Colors.textPrimary, fontSize: 14, backgroundColor: Colors.surfaceElevated,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  addBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  tone: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  jsonInput: {
    color: Colors.textPrimary, fontSize: 13, fontFamily: mono, minHeight: 120, paddingVertical: 10,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  saveButton: {
    backgroundColor: Colors.primary, borderRadius: 28, paddingVertical: 16,
    alignItems: 'center', marginTop: 4,
  },
  saveText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
  toggle: {
    width: 46, height: 28, borderRadius: 14, padding: 3, marginLeft: 'auto',
    justifyContent: 'center',
  },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.background },
});
