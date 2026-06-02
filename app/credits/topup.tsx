import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

const CREDIT_PACKS = [
  { credits: 100, kes: 100, label: null },
  { credits: 250, kes: 250, label: null },
  { credits: 500, kes: 475, label: '5% off' },
  { credits: 1000, kes: 900, label: '10% off' },
] as const;

const PAYMENT_METHODS = [
  { id: 'mpesa', label: 'M-Pesa', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Card', icon: 'card-outline' },
] as const;

export default function TopUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedPack, setSelectedPack] = useState<number | null>(0);
  const [customAmount, setCustomAmount] = useState('');
  const [customError, setCustomError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card'>('mpesa');
  const [toastMsg, setToastMsg] = useState('');
  const toastSlide = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    if (!toastMsg) return;
    toastSlide.setValue(80);
    Animated.spring(toastSlide, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(toastSlide, { toValue: 80, duration: 220, useNativeDriver: true }).start(() =>
        setToastMsg('')
      );
    }, 3000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const isCustom = selectedPack === null;
  const customCredits = parseInt(customAmount, 10);
  const customValid = !isNaN(customCredits) && customCredits >= 50;
  const totalKes = isCustom ? (customValid ? customCredits : 0) : CREDIT_PACKS[selectedPack!].kes;
  const totalCredits = isCustom ? (customValid ? customCredits : 0) : CREDIT_PACKS[selectedPack!].credits;
  const canPay = totalKes > 0;

  function handlePay() {
    if (!canPay) return;
    setToastMsg('Payments coming soon. Stay tuned!');
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Top Up Credits</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Packs */}
        <Text style={styles.sectionLabel}>Choose a Pack</Text>
        <View style={styles.packsGrid}>
          {CREDIT_PACKS.map((pack, idx) => {
            const selected = selectedPack === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.packCard, selected && styles.packCardSelected]}
                onPress={() => { setSelectedPack(idx); setCustomAmount(''); setCustomError(''); }}
                activeOpacity={0.8}
              >
                {pack.label && (
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountText}>{pack.label}</Text>
                  </View>
                )}
                <Text style={[styles.packCredits, selected && styles.packCreditsSelected]}>
                  {pack.credits}
                </Text>
                <Text style={styles.packCreditsLabel}>credits</Text>
                <Text style={styles.packKes}>KES {pack.kes}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom amount */}
        <Text style={styles.sectionLabel}>Or Enter Custom Amount</Text>
        <View style={[styles.inputWrap, isCustom && customAmount.length > 0 && styles.inputWrapActive]}>
          <TextInput
            style={styles.input}
            value={customAmount}
            onChangeText={(v) => {
              setCustomAmount(v.replace(/[^0-9]/g, ''));
              setCustomError('');
              setSelectedPack(null);
            }}
            onBlur={() => {
              if (customAmount && !customValid) {
                setCustomError('Minimum 50 credits');
              }
            }}
            placeholder="e.g. 200"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
          />
          <Text style={styles.inputSuffix}>credits</Text>
        </View>
        {!!customError && <Text style={styles.errorText}>{customError}</Text>}
        <Text style={styles.equivalenceNote}>1 credit = KES 1</Text>

        {/* Payment method */}
        <Text style={styles.sectionLabel}>Payment Method</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((m) => {
            const active = paymentMethod === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.methodCard, active && styles.methodCardActive]}
                onPress={() => setPaymentMethod(m.id as 'mpesa' | 'card')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={m.icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={22}
                  color={active ? Colors.primary : Colors.textSecondary}
                />
                <Text style={[styles.methodLabel, active && styles.methodLabelActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Pay button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.payBtn, !canPay && styles.payBtnDisabled]}
          onPress={handlePay}
          activeOpacity={0.85}
          disabled={!canPay}
        >
          <Text style={[styles.payBtnText, !canPay && styles.payBtnTextDisabled]}>
            {canPay ? `Pay KES ${totalKes}  ·  ${totalCredits} Credits` : 'Select an amount'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Toast */}
      {!!toastMsg && (
        <Animated.View
          style={[styles.toast, { bottom: insets.bottom + 100, transform: [{ translateY: toastSlide }] }]}
        >
          <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  content: { paddingHorizontal: 16 },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 12,
  },
  packsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  packCard: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  packCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceElevated,
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountText: { color: Colors.background, fontSize: 10, fontWeight: '700' },
  packCredits: { color: Colors.textPrimary, fontSize: 32, fontWeight: '800' },
  packCreditsSelected: { color: Colors.primary },
  packCreditsLabel: { color: Colors.textMuted, fontSize: 12 },
  packKes: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600', marginTop: 4 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
  },
  inputWrapActive: { borderColor: Colors.primary },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    paddingVertical: 14,
  },
  inputSuffix: { color: Colors.textMuted, fontSize: 14 },
  errorText: { color: Colors.error, fontSize: 12, marginTop: 6 },
  equivalenceNote: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  methodRow: { flexDirection: 'row', gap: 12 },
  methodCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 14,
  },
  methodCardActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceElevated },
  methodLabel: { color: Colors.textSecondary, fontSize: 15, fontWeight: '600' },
  methodLabelActive: { color: Colors.primary },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  payBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payBtnDisabled: { backgroundColor: Colors.surfaceElevated },
  payBtnText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
  payBtnTextDisabled: { color: Colors.textMuted },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toastText: { color: Colors.textPrimary, fontSize: 14, flex: 1 },
});
