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
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAppConfig, useFlag } from '@/components/AppConfigProvider';
import { resolvePackKes } from '@/lib/appConfig';
import { notifyCreditsChanged } from '@/lib/credits';
import { track } from '@/lib/analytics';
import { FW, WBtn, WLabel, PageTitle, useIsDesktopWeb } from '@/components/web/kit';
import { WebShell } from '@/components/web/WebShell';

type PayState = 'idle' | 'requesting' | 'waiting' | 'success' | 'failed';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000; // STK prompts expire after ~60-90s
// If the callback hasn't settled the row by this point, start asking Daraja
// directly (STK query) — the fallback for a missed/late M-Pesa callback.
const RECONCILE_AFTER_MS = 20_000;
const RECONCILE_EVERY_MS = 9_000;

const PAYMENT_METHODS = [
  { id: 'mpesa', label: 'M-Pesa', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Card', icon: 'card-outline' },
] as const;

export default function TopUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Pricing, packs, and the payments master switch are all remote-configurable
  // (public.app_config) so they can change without an app update. Flip
  // payments_live to true in the admin config to restore top-ups.
  const config = useAppConfig();
  const KES_PER_CREDIT = config.kes_per_credit;
  const MIN_CREDITS = config.min_credits;
  const PAYMENTS_ENABLED = config.payments_live;
  const CREDIT_PACKS = config.credit_packs.map((p) => ({
    credits: p.credits,
    kes: resolvePackKes(p, config.kes_per_credit),
    label: p.label ?? null,
  }));
  // Card payments aren't wired up yet — hide the option from config when not ready.
  const showCard = useFlag('show_card_payment', true);
  const paymentMethods = PAYMENT_METHODS.filter((m) => m.id !== 'card' || showCard);

  const [selectedPack, setSelectedPack] = useState<number | null>(0);
  const [customAmount, setCustomAmount] = useState('');
  const [customError, setCustomError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card'>('mpesa');
  const [toastMsg, setToastMsg] = useState('');
  const [phone, setPhone] = useState('');
  const [payState, setPayState] = useState<PayState>('idle');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastSlide = useRef(new Animated.Value(80)).current;

  // Prefill phone from the profile, and resume any payment that's still in flight
  // (e.g. the user backgrounded the app mid-prompt). Resuming — rather than
  // letting them tap Pay again — is a key guard against double charges.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('phone').eq('id', user.id).single();
      if (prof?.phone) setPhone(prof.phone);

      const { data: pending } = await supabase
        .from('payments')
        .select('checkout_request_id, created_at')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .not('checkout_request_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pending?.checkout_request_id) {
        const ageMs = Date.now() - new Date(pending.created_at).getTime();
        if (ageMs < POLL_TIMEOUT_MS) {
          setPayState('waiting');
          setToastMsg('Resuming your pending payment…');
          pollPayment(pending.checkout_request_id);
        }
      }
    })();
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const customValid = !isNaN(customCredits) && customCredits >= MIN_CREDITS;
  const totalKes = isCustom ? (customValid ? customCredits * KES_PER_CREDIT : 0) : CREDIT_PACKS[selectedPack!].kes;
  const totalCredits = isCustom ? (customValid ? customCredits : 0) : CREDIT_PACKS[selectedPack!].credits;
  const canPay = totalKes > 0;

  // When the user changes the amount after a finished attempt, return the button
  // to its normal "Pay" state (but never interrupt an in-flight payment).
  function resetAfterResolve() {
    setPayState((s) => (s === 'success' || s === 'failed' ? 'idle' : s));
  }

  function settle(status: 'success' | 'failed', credits?: number, resultDesc?: string) {
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (status === 'success') {
      setPayState('success');
      setToastMsg(`${credits ?? ''} credits added to your account! 🎉`.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track('topup_succeeded', { credits });
      notifyCreditsChanged();
    } else {
      setPayState('failed');
      setToastMsg(resultDesc || 'Payment was not completed.');
      track('topup_failed', { reason: resultDesc ?? 'unknown' });
    }
  }

  // Ask the server to reconcile this payment against M-Pesa directly. Used as a
  // fallback when the callback is late/missing; it settles the row idempotently.
  async function reconcile(checkoutRequestId: string) {
    await supabase.functions
      .invoke('mpesa-stk-query', { body: { checkout_request_id: checkoutRequestId } })
      .catch(() => {});
  }

  function pollPayment(checkoutRequestId: string) {
    const startedAt = Date.now();
    let lastReconcileAt = 0;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      const elapsed = Date.now() - startedAt;

      const { data } = await supabase
        .from('payments')
        .select('status, result_desc, credits')
        .eq('checkout_request_id', checkoutRequestId)
        .single();

      if (data && data.status !== 'pending') {
        settle(data.status as 'success' | 'failed', data.credits, data.result_desc);
        return;
      }

      // Still pending. Once the prompt window has passed, stop trusting the
      // callback alone and ask M-Pesa directly (throttled).
      if (elapsed > RECONCILE_AFTER_MS && Date.now() - lastReconcileAt > RECONCILE_EVERY_MS) {
        lastReconcileAt = Date.now();
        reconcile(checkoutRequestId);
      }

      if (elapsed > POLL_TIMEOUT_MS) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        // One last forced reconcile, then read the final state.
        await reconcile(checkoutRequestId);
        const { data: final } = await supabase
          .from('payments')
          .select('status, result_desc, credits')
          .eq('checkout_request_id', checkoutRequestId)
          .single();
        if (final?.status === 'success') {
          settle('success', final.credits);
        } else if (final?.status === 'failed') {
          settle('failed', undefined, final.result_desc);
        } else {
          setPayState('failed');
          setToastMsg('Still confirming your payment. If your M-Pesa was debited, your credits will appear shortly — check Credit History.');
        }
      }
    }, POLL_INTERVAL_MS);
  }

  async function handlePay() {
    if (!canPay || payState === 'requesting' || payState === 'waiting') return;
    if (paymentMethod === 'card') {
      setToastMsg('Card payments coming soon — use M-Pesa for now.');
      return;
    }
    if (!/^(?:254|0)(7|1)\d{8}$/.test(phone.replace(/\D/g, ''))) {
      setPayState('failed');
      setToastMsg('Enter a valid M-Pesa number, e.g. 0712345678.');
      return;
    }
    setPayState('requesting');
    track('topup_started', { credits: totalCredits, kes: totalKes });
    // Pricing is enforced server-side from app_config; we send credits + phone.
    const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
      body: { credits: totalCredits, phone },
    });
    if (error) {
      setPayState('failed');
      setToastMsg('Could not start the payment. Please try again.');
      return;
    }
    // A previous top-up completed while we were away — treat as done.
    if (data?.settled === 'success') {
      setPayState('success');
      setToastMsg(`${data.credits ?? ''} credits added to your account! 🎉`.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track('topup_succeeded', { credits: data.credits });
      notifyCreditsChanged();
      return;
    }
    // A prompt is live (new or resumed) — poll it to completion.
    if (data?.ok && data.checkout_request_id) {
      setPayState('waiting');
      setToastMsg(data.resumed
        ? 'Finishing your earlier M-Pesa prompt…'
        : 'Check your phone and enter your M-Pesa PIN…');
      track('topup_prompt_sent', { credits: totalCredits });
      pollPayment(data.checkout_request_id);
      return;
    }
    // ok:false — a concurrent attempt is starting, or a validation/rejection.
    // 'in_progress' is transient (not a failure), so leave the button usable.
    setPayState(data?.code === 'in_progress' ? 'idle' : 'failed');
    setToastMsg(data?.message || 'Could not start the M-Pesa payment. Please try again.');
  }

  const paying = payState === 'requesting' || payState === 'waiting';
  const payLabel = payState === 'requesting' ? 'Sending…'
    : payState === 'waiting' ? 'Waiting for M-Pesa PIN…'
    : payState === 'success' ? 'Paid ✓'
    : canPay ? `Pay KES ${totalKes}` : 'Select an amount';

  const isDesktop = useIsDesktopWeb();

  // Chokepoint block: while payments are disabled, no top-up UI is shown on any
  // platform or entry point, so the mpesa-stk-push function can't be reached.
  if (!PAYMENTS_ENABLED) {
    if (isDesktop) {
      return (
        <WebShell>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
          >
            <Ionicons name="arrow-back" size={16} color={FW.sec} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: FW.sec }}>Profile</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 90, gap: 16 }}>
            <View style={{
              width: 64, height: 64, borderRadius: 18, backgroundColor: FW.surface,
              borderWidth: 1, borderColor: FW.border, alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="time-outline" size={30} color={FW.primary} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: FW.text }}>Top-ups are coming soon</Text>
            <Text style={{ fontSize: 14.5, color: FW.sec, textAlign: 'center', maxWidth: 380, lineHeight: 21 }}>
              Buying credits isn’t available just yet. We’re putting the finishing touches on
              payments — check back shortly.
            </Text>
          </View>
        </WebShell>
      );
    }
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Top Up Credits</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 18, backgroundColor: Colors.surface,
            borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="time-outline" size={30} color={Colors.primary} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' }}>
            Top-ups are coming soon
          </Text>
          <Text style={{ fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 }}>
            Buying credits isn’t available just yet. We’re putting the finishing touches on
            payments — check back shortly.
          </Text>
        </View>
      </View>
    );
  }

  if (isDesktop) {
    return (
      <WebShell>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
        >
          <Ionicons name="arrow-back" size={16} color={FW.sec} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: FW.sec }}>Profile</Text>
        </TouchableOpacity>
        <PageTitle title="Top up credits" sub={`1 credit = KES ${KES_PER_CREDIT}. Minimum ${MIN_CREDITS} credits.`} />
        <View style={{ flexDirection: 'row', gap: 28, marginTop: 24, alignItems: 'flex-start' }}>
          {/* Left: packs + custom + method */}
          <View style={{ flex: 1, gap: 30 }}>
            <View>
              <WLabel>Choose a pack</WLabel>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 12 }}>
                {CREDIT_PACKS.map((pack, idx) => {
                  const selected = selectedPack === idx;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={{
                        flex: 1, position: 'relative', backgroundColor: FW.surface,
                        borderRadius: 16, paddingVertical: 20, paddingHorizontal: 22,
                        borderWidth: 1.5, borderColor: selected ? FW.primary : FW.border,
                      }}
                      onPress={() => { setSelectedPack(idx); setCustomAmount(''); setCustomError(''); resetAfterResolve(); }}
                      activeOpacity={0.8}
                    >
                      {pack.label && (
                        <View style={{
                          position: 'absolute', top: -10, right: 14, backgroundColor: FW.primary,
                          paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6,
                        }}>
                          <Text style={{
                            color: '#0C0C0C', fontSize: 10.5, fontWeight: '800',
                            letterSpacing: 0.5, textTransform: 'uppercase',
                          }}>{pack.label}</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                        <Text style={{ fontSize: 26, fontWeight: '800', color: FW.text, letterSpacing: -0.7 }}>
                          {pack.credits}
                        </Text>
                        <Text style={{ fontSize: 12.5, color: FW.muted }}>cr</Text>
                      </View>
                      <Text style={{
                        marginTop: 6, fontSize: 13.5, fontWeight: '600',
                        color: selected ? FW.primary : FW.sec,
                      }}>KES {pack.kes.toLocaleString()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={{ maxWidth: 320, gap: 8 }}>
              <WLabel>Or enter a custom amount</WLabel>
              <View style={{
                flexDirection: 'row', alignItems: 'center', backgroundColor: FW.surface,
                borderRadius: 12, borderWidth: 1,
                borderColor: customError ? FW.error : isCustom && customAmount ? FW.primary : FW.border,
                paddingHorizontal: 16,
              }}>
                <TextInput
                  style={{ flex: 1, color: FW.text, fontSize: 15, paddingVertical: 13, outlineStyle: 'none' } as any}
                  value={customAmount}
                  onChangeText={(v) => {
                    setCustomAmount(v.replace(/[^0-9]/g, ''));
                    setCustomError('');
                    setSelectedPack(null);
                  }}
                  onBlur={() => {
                    if (customAmount && !customValid) setCustomError(`Minimum ${MIN_CREDITS} credits`);
                  }}
                  placeholder={`Minimum ${MIN_CREDITS} credits`}
                  placeholderTextColor={FW.muted}
                  keyboardType="number-pad"
                />
                <Text style={{ color: FW.muted, fontSize: 14 }}>credits</Text>
              </View>
              {!!customError && <Text style={{ color: FW.error, fontSize: 12.5 }}>{customError}</Text>}
            </View>
            <View>
              <WLabel>Payment method</WLabel>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 12, maxWidth: 560 }}>
                {paymentMethods.map((m) => {
                  const active = paymentMethod === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14,
                        paddingVertical: 16, paddingHorizontal: 18,
                        backgroundColor: FW.surface, borderRadius: 14,
                        borderWidth: 1.5, borderColor: active ? FW.primary : FW.border,
                      }}
                      onPress={() => setPaymentMethod(m.id as 'mpesa' | 'card')}
                      activeOpacity={0.8}
                    >
                      <View style={{
                        width: 40, height: 40, borderRadius: 11, backgroundColor: FW.surfaceEl,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name={m.icon as any} size={19} color={active ? FW.primary : FW.sec} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '700', color: FW.text }}>{m.label}</Text>
                      <View style={{
                        width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                        borderColor: active ? FW.primary : FW.muted,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: FW.primary }} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
          {/* Right: summary */}
          <View style={{
            width: 360, flexShrink: 0, backgroundColor: FW.surface,
            borderWidth: 1, borderColor: FW.border, borderRadius: 20, padding: 26, gap: 16,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: FW.text }}>Summary</Text>
            {([
              ['Pack', canPay ? `${totalCredits} credits` : '—'],
              ['Price', canPay ? `KES ${totalKes}` : '—'],
              ['Payment', paymentMethod === 'mpesa' ? 'M-Pesa' : 'Card'],
            ] as Array<[string, string]>).map(([k, v]) => (
              <View key={k} style={{
                flexDirection: 'row', justifyContent: 'space-between',
                paddingTop: 14, borderTopWidth: 1, borderTopColor: FW.borderSoft,
              }}>
                <Text style={{ fontSize: 13.5, color: FW.sec }}>{k}</Text>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: FW.text }}>{v}</Text>
              </View>
            ))}
            {paymentMethod === 'mpesa' && (
              <View style={{ gap: 6 }}>
                <WLabel>M-Pesa number</WLabel>
                <TextInput
                  style={{
                    backgroundColor: FW.surfaceEl, borderWidth: 1, borderColor: FW.border,
                    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
                    color: FW.text, fontSize: 14.5, outlineStyle: 'none',
                  } as any}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="0712345678"
                  placeholderTextColor={FW.muted}
                  keyboardType="phone-pad"
                  editable={!paying}
                />
              </View>
            )}
            <WBtn
              label={payLabel}
              size="lg" full dim={!canPay || paying} onPress={handlePay} style={{ marginTop: 4 }}
            />
            {!!toastMsg && (
              <Text style={{ fontSize: 13, color: FW.primary, textAlign: 'center' }}>{toastMsg}</Text>
            )}
            <Text style={{ fontSize: 12, color: FW.muted, textAlign: 'center', lineHeight: 18 }}>
              {paymentMethod === 'mpesa' ? "You'll get an M-Pesa prompt on your phone to confirm." : 'Visa and Mastercard accepted.'}
            </Text>
          </View>
        </View>
      </WebShell>
    );
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
                onPress={() => { setSelectedPack(idx); setCustomAmount(''); setCustomError(''); resetAfterResolve(); }}
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
              resetAfterResolve();
            }}
            onBlur={() => {
              if (customAmount && !customValid) {
                setCustomError(`Minimum ${MIN_CREDITS} credits`);
              }
            }}
            placeholder="e.g. 200"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
          />
          <Text style={styles.inputSuffix}>credits</Text>
        </View>
        {!!customError && <Text style={styles.errorText}>{customError}</Text>}
        <Text style={styles.equivalenceNote}>1 credit = KES {KES_PER_CREDIT} · minimum {MIN_CREDITS} credits</Text>

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

        {/* M-Pesa number */}
        {paymentMethod === 'mpesa' && (
          <>
            <Text style={styles.sectionLabel}>M-Pesa Number</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="0712345678"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
                editable={!paying}
              />
            </View>
          </>
        )}
      </ScrollView>

      {/* Pay button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.payBtn, (!canPay || paying) && styles.payBtnDisabled]}
          onPress={handlePay}
          activeOpacity={0.85}
          disabled={!canPay || paying}
        >
          <Text style={[styles.payBtnText, (!canPay || paying) && styles.payBtnTextDisabled]}>
            {paying || payState === 'success' ? payLabel
              : canPay ? `Pay KES ${totalKes}  ·  ${totalCredits} Credits` : 'Select an amount'}
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
