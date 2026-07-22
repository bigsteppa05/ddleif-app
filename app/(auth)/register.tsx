import { useRef, useState, useEffect, type ReactElement } from 'react';
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
  Image,
  Animated,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { supabase, uploadAvatar } from '@/lib/supabase';
import { OtpInput } from '@/components/OtpInput';
import { Colors } from '@/constants/colors';
import { pickImageFromLibrary } from '@/lib/media';
import { Wordmark, SPORT_IMAGES, useRise, BANNER_GRADIENT } from '@/components/onboarding';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { track } from '@/lib/analytics';
import { AuthShell, AuthHeading, LimeLink, WBtn, FW, useIsDesktopWeb } from '@/components/web/kit';

const TOTAL_STEPS = 4;

// Step indices shared by both layouts. On mobile these read as
// Create → Verify → Profile → Done (success); on desktop the same indices map to
// credentials / OTP / profile / photo. The distinction only affects navigation
// (see handleNext / handleFinish), not the shared form state.
const STEP = { CREATE: 0, VERIFY: 1, PROFILE: 2, DONE: 3 } as const;

// react-native-web focus guard: on web, a tap on a child input bubbles up to the
// TouchableWithoutFeedback, whose Keyboard.dismiss() then blurs the just-focused
// field — making inputs (e.g. the password) impossible to type into. Tap-to-dismiss
// is a native-only affordance, so on web we render the form without the wrapper.
function TapToDismiss({ children }: { children: ReactElement }) {
  if (Platform.OS === 'web') return children;
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {children}
    </TouchableWithoutFeedback>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [step, setStep] = useState(0);
  const rise = useRise(step); // re-triggers the enter animation on each mobile step

  // Sign out any existing session when entering registration
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) supabase.auth.signOut();
    });
  }, []);

  // Form values
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUri, setAvatarUri] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(27);
  const [otpCanResend, setOtpCanResend] = useState(false);
  const OTP_LENGTH = 8;

  // Field errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Password
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pwTouched, setPwTouched] = useState(false);
  // Whether the chosen password has been attached to the account (see savePassword).
  const [pwSaved, setPwSaved] = useState(false);

  // Username availability
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Submission
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Animations
  const reduced = useReducedMotion();
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const toastSlide = useRef(new Animated.Value(80)).current;
  const successScale = useRef(new Animated.Value(0.9)).current;

  // "You're in." success circle: a subtle spring pop when the Done step arrives
  // (respects Reduce Motion — snaps to full size with no overshoot).
  useEffect(() => {
    if (step !== STEP.DONE) return;
    if (reduced) { successScale.setValue(1); return; }
    successScale.setValue(0.9);
    Animated.spring(successScale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [step, reduced, successScale]);

  // Input refs for chaining
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const pwReqs = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const pwValid = pwReqs.length && pwReqs.upper && pwReqs.number;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Kenyan mobile: 9 digits starting 7 or 1, tolerating a typed leading 0
  const phoneDigits = phone.replace(/\D/g, '').replace(/^0/, '');
  const phoneValid = /^[17]\d{8}$/.test(phoneDigits);
  const step0Valid = emailValid && !emailTaken && pwValid;
  const step1Valid = otpVerified;
  const step2Valid =
    name.trim().length > 0 &&
    username.length >= 3 &&
    /^[a-z0-9_]+$/.test(username) &&
    usernameAvailable === true &&
    !usernameChecking &&
    phoneValid;
  const currentStepValid =
    step === 0 ? step0Valid :
    step === 1 ? step1Valid :
    step === 2 ? step2Valid : true;

  // ── Username debounce ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!username || username.length < 3 || !/^[a-z0-9_]+$/.test(username)) {
      setUsernameAvailable(null);
      setUsernameChecking(false);
      return;
    }
    setUsernameChecking(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle();
        setUsernameAvailable(data === null);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  // ── Toast auto-hide ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!toastMsg) return;
    toastSlide.setValue(80);
    Animated.spring(toastSlide, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(toastSlide, { toValue: 80, duration: 220, useNativeDriver: true }).start(() =>
        setToastMsg('')
      );
    }, 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // ── Error helpers ─────────────────────────────────────────────────────────
  function clearError(key: string) {
    setErrors((p) => ({ ...p, [key]: '' }));
  }

  function setFieldError(key: string, msg: string) {
    setErrors((p) => ({ ...p, [key]: msg }));
  }

  // ── Blur validation ───────────────────────────────────────────────────────
  function onBlurEmail() {
    const v = email.trim();
    if (!v) { setFieldError('email', 'Email is required.'); return; }
    if (!emailValid) { setFieldError('email', 'Enter a valid email address.'); return; }
    clearError('email');
  }

  function onBlurPassword() {
    if (!password) { setFieldError('password', 'Password is required.'); return; }
    if (!pwValid) { setFieldError('password', "Password doesn't meet all requirements."); return; }
    clearError('password');
  }

  function onBlurName() {
    if (!name.trim()) { setFieldError('name', 'Full name is required.'); return; }
    clearError('name');
  }

  function onBlurUsername() {
    if (!username) { setFieldError('username', 'Username is required.'); return; }
    if (username.length < 3) { setFieldError('username', 'At least 3 characters.'); return; }
    if (!/^[a-z0-9_]+$/.test(username)) {
      setFieldError('username', 'Lowercase letters, numbers, and underscores only.');
      return;
    }
    clearError('username');
  }

  // ── Shake + haptics ───────────────────────────────────────────────────────
  function shake() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (reduced) return; // keep the haptic, drop the position shake
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 9, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -9, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function scrollTo(index: number) {
    setStep(index);
  }

  function goBack() {
    if (step > 0) { scrollTo(step - 1); return; }
    router.replace('/(auth)/welcome');
  }

  function goToApp() {
    router.replace('/(tabs)');
  }

  // Start (or restart) the resend countdown. Shared by the initial OTP send and
  // the Resend action.
  function startOtpCountdown() {
    setOtpCountdown(60);
    setOtpCanResend(false);
    const timer = setInterval(() => {
      setOtpCountdown((c) => {
        if (c <= 1) { clearInterval(timer); setOtpCanResend(true); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function handleOtpChange(val: string, isComplete: boolean) {
    setOtpCode(val);
    setOtpError('');
    if (!isComplete) return;
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: val,
      type: 'email',
    });
    if (verifyError) {
      setOtpError("That code isn't right. Check and try again.");
      shake();
    } else {
      setOtpError('');
      setOtpVerified(true);
      track('signup_verified');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Auto-advance to the profile step once verified. The password is attached
      // once, awaited, in handleFinish — setting it here caused a same_password race.
      setTimeout(() => setStep((s) => (s === STEP.VERIFY ? STEP.PROFILE : s)), 700);
    }
  }

  async function handleResend() {
    if (!otpCanResend) return;
    startOtpCountdown();
    const { error: resendError } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });
    if (resendError) setOtpError(resendError.message);
  }

  async function handleNext() {
    if (!currentStepValid) {
      shake();
      if (step === STEP.CREATE) {
        if (!emailValid || emailTaken)
          setFieldError('email', emailTaken ? 'This email is already registered.' : 'Enter a valid email address.');
        if (!pwValid)
          setFieldError('password', "Password doesn't meet all requirements.");
      } else if (step === STEP.PROFILE) {
        if (!name.trim()) setFieldError('name', 'Full name is required.');
        if (!username || username.length < 3) setFieldError('username', 'At least 3 characters.');
        else if (usernameAvailable === false) setFieldError('username', 'Username is already taken.');
        if (!phoneValid) setFieldError('phone', 'Enter a valid Kenyan phone number.');
      }
      return;
    }
    if (step === STEP.CREATE) {
      setLoading(true);
      const { error: otpSendError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
      });
      setLoading(false);
      if (otpSendError) {
        setToastMsg(otpSendError.message);
        return;
      }
      track('signup_started');
      startOtpCountdown();
    }
    if (isDesktop) {
      if (step < TOTAL_STEPS - 1) scrollTo(step + 1);
      else handleFinish();
      return;
    }
    // Mobile: Create → Verify → Profile, then Profile submits into the Done screen.
    if (step === STEP.PROFILE) handleFinish();
    else scrollTo(step + 1);
  }

  // Attach the password chosen in step 1 to the account. The user already has a
  // session from the OTP verify, so this just sets a password — enabling password
  // login later. Returns false (instead of throwing) so callers can surface the
  // failure rather than letting the account slip onto the OTP-only path.
  async function savePassword(): Promise<{ ok: boolean; message?: string }> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const code = (error as { code?: string }).code;
      // The password was already set on a prior attempt — Supabase rejects an
      // identical password with `same_password`. That means we're done, not failed.
      if (code === 'same_password' || /different from the old/i.test(error.message)) {
        setPwSaved(true);
        return { ok: true };
      }
      console.warn('Could not set password:', error.message);
      return { ok: false, message: error.message };
    }
    setPwSaved(true);
    return { ok: true };
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleFinish() {
    setLoading(true);

    // User is already signed in via email OTP at step 1
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setToastMsg('Session expired. Please start again.');
      setTimeout(() => router.replace('/(auth)/register'), 2000);
      return;
    }

    // Guarantee the password is attached before completing. If the post-verify
    // attempt failed (e.g. a network blip), retry here and block completion on
    // failure — the account must never land in a passwordless state.
    if (!pwSaved) {
      const res = await savePassword();
      if (!res.ok) {
        setLoading(false);
        // Surface the real reason (e.g. a weak or breached password) instead of a
        // generic connection message, so the user knows how to fix it.
        setToastMsg(res.message || "We couldn't set your password. Please try again.");
        return;
      }
    }

    const userId = user.id;
    const trimmedEmail = user.email ?? email.trim().toLowerCase();

    // Upload avatar — non-fatal
    let avatarUrl: string | null = null;
    if (avatarUri) {
      try {
        avatarUrl = await uploadAvatar(userId, avatarUri);
      } catch { /* non-fatal */ }
    }

    await supabase.from('profiles').upsert(
      {
        id: userId,
        email: trimmedEmail,
        name: name.trim(),
        credits: 0,
        username: username.trim() || null,
        avatar_url: avatarUrl,
        phone: phone ? `+254${phone.replace(/\D/g, '')}` : null,
      },
      { onConflict: 'id' }
    );

    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync('onboarding_needed', 'true');
    }

    setLoading(false);
    track('signup_completed');
    // Desktop drops straight into the app; mobile shows the "You're in" success
    // screen (STEP.DONE) whose CTA then enters the app via goToApp().
    if (isDesktop) {
      router.replace('/(tabs)');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(STEP.DONE);
    }
  }

  // ── Photo picker ──────────────────────────────────────────────────────────
  // Permission handling (web/iOS/Android + Settings fallback) lives in lib/media.
  async function pickPhoto() {
    const uri = await pickImageFromLibrary({ aspect: [1, 1], quality: 0.8 });
    if (uri) setAvatarUri(uri);
  }

  // ── Step label ────────────────────────────────────────────────────────────
  const stepTitle =
    step === 0 ? 'Create account' :
    step === 1 ? 'Verify your number' :
    step === 2 ? 'Your profile' : 'Profile photo';
  const ctaLabel = step < 3 ? 'Continue' : 'Create Account';

  const stepComponents = [
    <StepCredentials
      key="creds"
      email={email}
      password={password}
      pwReqs={pwReqs}
      errors={errors}
      emailTaken={emailTaken}
      emailRef={emailRef}
      onChangeEmail={(v) => {
        clearError('email');
        setEmailTaken(false);
        setEmail(v);
      }}
      onBlurEmail={onBlurEmail}
      onChangePassword={(v) => { clearError('password'); setPassword(v); }}
      onBlurPassword={onBlurPassword}
      onSignIn={() => router.replace('/(auth)/login')}
    />,
    <StepOTP
      key="otp"
      code={otpCode}
      otpLength={OTP_LENGTH}
      error={otpError}
      verified={otpVerified}
      countdown={otpCountdown}
      canResend={otpCanResend}
      onCode={handleOtpChange}
      onResend={handleResend}
      onSkip={undefined}
    />,
    <StepProfile
      key="profile"
      name={name}
      username={username}
      phone={phone}
      errors={errors}
      usernameChecking={usernameChecking}
      usernameAvailable={usernameAvailable}
      nameRef={nameRef}
      usernameRef={usernameRef}
      onChangeName={(v) => { clearError('name'); setName(v); }}
      onChangeUsername={(v) => {
        const clean = v.replace(/\s/g, '').toLowerCase();
        clearError('username');
        setUsername(clean);
      }}
      onChangePhone={(v) => setPhone(v.replace(/\D/g, ''))}
      onBlurName={onBlurName}
      onBlurUsername={onBlurUsername}
      onUsernameSubmit={handleNext}
    />,
    <StepPhoto
      key="photo"
      avatarUri={avatarUri}
      onPick={pickPhoto}
      loading={loading}
    />,
  ];

  if (isDesktop) {
    return (
      <AuthShell
        formWidth={440}
        footer={
          <Text style={{ fontSize: 13.5, color: FW.sec }}>
            Already have an account? <LimeLink onPress={() => router.replace('/(auth)/login')}>Sign in</LimeLink>
          </Text>
        }
      >
        <AuthHeading
          kicker={`Step ${step + 1} of ${TOTAL_STEPS}`}
          title={stepTitle}
          sub={step === 0 ? "You'll verify your email next, then set up your player profile." : undefined}
        />
        <View style={{ gap: 4 }}>
          {stepComponents[step]}
          {step !== 1 && (
            loading ? (
              <View style={{ alignItems: 'center', paddingVertical: 18, marginTop: 20 }}>
                <ActivityIndicator color={FW.primary} />
              </View>
            ) : (
              <WBtn
                label={ctaLabel}
                size="lg"
                full
                dim={!currentStepValid}
                onPress={handleNext}
                style={{ marginTop: 24 }}
              />
            )
          )}
        </View>
        {!!toastMsg && (
          <Text style={{ color: FW.error, fontSize: 13.5, marginTop: 18, textAlign: 'center' }}>{toastMsg}</Text>
        )}
      </AuthShell>
    );
  }

  const enterStyle = {
    opacity: rise.opacity,
    transform: [rise.transform[0], { translateX: shakeAnim }],
  };

  return (
    <TapToDismiss>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View style={[styles.flex, enterStyle]}>

          {/* ── CREATE ── */}
          {step === STEP.CREATE && (
            <View style={styles.flex}>
              <View style={[styles.banner, { height: insets.top + 150 }]}>
                <Image source={SPORT_IMAGES.football} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient
                  colors={BANNER_GRADIENT.colors}
                  locations={BANNER_GRADIENT.locations}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.bannerNav, { top: insets.top + 8 }]}>
                  <TouchableOpacity style={styles.chev} onPress={goBack} activeOpacity={0.8}>
                    <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
                  </TouchableOpacity>
                  <View style={styles.pbar}><View style={[styles.pbarFill, { width: '33%' }]} /></View>
                </View>
                <Text style={styles.bannerTitle}>Create your account</Text>
              </View>

              <ScrollView style={styles.flex} contentContainerStyle={styles.createBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.lbl}>Email</Text>
                <TextInput
                  style={[styles.fld, { marginBottom: 18 }, !!errors.email && styles.fldError]}
                  value={email}
                  onChangeText={(v) => { clearError('email'); setEmailTaken(false); setEmail(v); }}
                  onBlur={onBlurEmail}
                  placeholder="you@example.com" placeholderTextColor="#565656"
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="next"
                />
                {!!errors.email && (
                  <View style={styles.errRow}>
                    <Text style={styles.errText}>{errors.email}</Text>
                    {emailTaken && (
                      <TouchableOpacity onPress={() => router.replace('/(auth)/login')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                        <Text style={styles.errLink}>Sign in instead</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <Text style={styles.lbl}>Password</Text>
                <TextInput
                  style={[styles.fld, !!errors.password && styles.fldError]}
                  value={password}
                  onChangeText={(v) => { clearError('password'); setPassword(v); }}
                  onBlur={onBlurPassword}
                  placeholder="Create a password" placeholderTextColor="#565656"
                  secureTextEntry autoCapitalize="none" autoCorrect={false} returnKeyType="done"
                />
                <View style={styles.chipsRow}>
                  <ReqChip ok={pwReqs.length} label="8+ characters" />
                  <ReqChip ok={pwReqs.upper} label="Uppercase" />
                  <ReqChip ok={pwReqs.number} label="Number" />
                </View>
                {!!errors.password && <Text style={[styles.errText, { marginTop: 10 }]}>{errors.password}</Text>}
              </ScrollView>

              <View style={[styles.stepFooter, { paddingBottom: (insets.bottom || 0) + 12 }]}>
                <TouchableOpacity style={[styles.pbtn, (!step0Valid || loading) && styles.pbtnDim]} onPress={handleNext} disabled={loading} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.pbtnText}>Continue</Text>}
                </TouchableOpacity>
                <View style={styles.signinRow}>
                  <Text style={styles.signinText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
                    <Text style={styles.signinLink}>Sign In</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ── VERIFY ── */}
          {step === STEP.VERIFY && (
            <View style={[styles.step, { paddingTop: insets.top + 16, paddingBottom: (insets.bottom || 0) + 18 }]}>
              <MobileTopNav onBack={goBack} width="66%" />
              <Text style={styles.stitle}>Check your email</Text>
              <Text style={styles.ssub}>
                We sent a {OTP_LENGTH}-digit code to <Text style={{ color: Colors.textPrimary }}>{email || 'your email'}</Text>. Pop it in to confirm it&apos;s you.
              </Text>
              <OtpInput
                value={otpCode}
                length={OTP_LENGTH}
                onChange={(v) => handleOtpChange(v, false)}
                onComplete={(v) => handleOtpChange(v, true)}
                hasError={!!otpError}
                verified={otpVerified}
                autoFocus
              />
              {!!otpError && (
                <View style={styles.otpErrorRow}>
                  <Ionicons name="alert-circle-outline" size={15} color={Colors.error} />
                  <Text style={styles.otpErrorText}>{otpError}</Text>
                </View>
              )}
              {otpVerified ? (
                <View style={styles.verifiedPill}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                  <Text style={styles.verifiedText}>Email verified</Text>
                </View>
              ) : (
                <Text style={styles.resendText}>
                  Didn&apos;t get it?{' '}
                  {otpCanResend
                    ? <Text style={styles.resendLink} onPress={handleResend}>Resend code</Text>
                    : <Text style={styles.resendMuted}>Resend in 0:{otpCountdown.toString().padStart(2, '0')}</Text>}
                </Text>
              )}
              <View style={styles.grow} />
              <TouchableOpacity style={[styles.pbtn, !otpVerified && styles.pbtnDim]} onPress={handleNext} disabled={!otpVerified} activeOpacity={0.85}>
                <Text style={styles.pbtnText}>Verify &amp; continue</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── PROFILE ── */}
          {step === STEP.PROFILE && (
            <View style={[styles.step, { paddingTop: insets.top + 16 }]}>
              <MobileTopNav onBack={goBack} width="100%" />
              <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.stitle}>Set up your profile</Text>
                <Text style={[styles.ssub, { marginBottom: 18 }]}>So teammates know who&apos;s turning up.</Text>

                <View style={styles.avatarWrap}>
                  <TouchableOpacity style={styles.avatar} onPress={pickPhoto} activeOpacity={0.85} disabled={loading}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={22} color={Colors.textSecondary} />
                        <Text style={styles.avatarLabel}>Add photo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={styles.lbl}>Full name</Text>
                <TextInput
                  style={[styles.fld, { marginBottom: 16 }, !!errors.name && styles.fldError]}
                  value={name}
                  onChangeText={(v) => { clearError('name'); setName(v); }}
                  onBlur={onBlurName}
                  placeholder="Alex Kamau" placeholderTextColor="#565656"
                  autoCapitalize="words" autoCorrect={false} returnKeyType="next"
                />

                <Text style={styles.lbl}>Username</Text>
                <View style={[styles.unWrap, { marginBottom: 16 }, !!errors.username && styles.fldError]}>
                  <Text style={styles.prefixAt}>@</Text>
                  <TextInput
                    style={styles.unInput}
                    value={username}
                    onChangeText={(v) => { clearError('username'); setUsername(v.replace(/\s/g, '').toLowerCase()); }}
                    onBlur={onBlurUsername}
                    placeholder="alexkamau" placeholderTextColor="#565656"
                    autoCapitalize="none" autoCorrect={false} returnKeyType="next"
                  />
                  {usernameChecking && <ActivityIndicator size="small" color={Colors.textMuted} />}
                  {!usernameChecking && username.length >= 3 && usernameAvailable === true && (
                    <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                  )}
                  {!usernameChecking && usernameAvailable === false && (
                    <Ionicons name="close-circle" size={18} color={Colors.error} />
                  )}
                </View>
                {!!errors.username && <Text style={[styles.errText, { marginTop: -8, marginBottom: 16 }]}>{errors.username}</Text>}

                <Text style={styles.lbl}>Phone number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.phonePrefixBox}>
                    <Text style={styles.phoneFlag}>🇰🇪</Text>
                    <Text style={styles.phonePrefix}>+254</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={(v) => setPhone(v.replace(/\D/g, ''))}
                    placeholder="712 345 678" placeholderTextColor="#565656"
                    keyboardType="phone-pad" returnKeyType="done"
                  />
                </View>
              </ScrollView>

              <View style={[styles.stepFooter, { paddingBottom: (insets.bottom || 0) + 18 }]}>
                <TouchableOpacity style={[styles.pbtn, (!step2Valid || loading) && styles.pbtnDim]} onPress={handleNext} disabled={loading} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.pbtnText}>Create account</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── DONE ── */}
          {step === STEP.DONE && (
            <View style={[styles.doneRoot, { paddingBottom: (insets.bottom || 0) + 24 }]}>
              <View style={styles.glow} pointerEvents="none" />
              <Animated.View style={[styles.successCircle, { transform: [{ scale: successScale }] }]}>
                <Ionicons name="checkmark" size={46} color={Colors.background} />
              </Animated.View>
              <Text style={styles.doneTitle}>You&apos;re in.</Text>
              <Text style={styles.doneSub}>Your profile&apos;s set. Find a game that fits, grab your spot and just turn up to play.</Text>
              <TouchableOpacity style={[styles.pbtn, styles.doneBtn]} onPress={goToApp} activeOpacity={0.85}>
                <Text style={styles.pbtnText}>Explore games</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* ── Network toast ── */}
        {!!toastMsg && (
          <Animated.View style={[styles.toast, { bottom: (insets.bottom || 0) + 96, transform: [{ translateY: toastSlide }] }]}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
            <Text style={styles.toastText}>{toastMsg}</Text>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </TapToDismiss>
  );
}

// ── Mobile helpers ────────────────────────────────────────────────────────────
function MobileTopNav({ onBack, width }: { onBack: () => void; width: '33%' | '66%' | '100%' }) {
  return (
    <View style={styles.topnav}>
      <TouchableOpacity style={styles.chev} onPress={onBack} activeOpacity={0.8}>
        <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.pbar}><View style={[styles.pbarFill, { width }]} /></View>
    </View>
  );
}

function ReqChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={ok ? 'checkmark' : 'ellipse-outline'} size={12} color={ok ? Colors.primary : Colors.textMuted} />
      <Text style={[styles.chipText, { color: ok ? Colors.primary : Colors.textMuted }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Credentials
// ─────────────────────────────────────────────────────────────────────────────

function StepCredentials({
  email, password, pwReqs, errors, emailTaken, emailRef,
  onChangeEmail, onBlurEmail, onChangePassword, onBlurPassword, onSignIn,
}: {
  email: string;
  password: string;
  pwReqs: { length: boolean; upper: boolean; number: boolean };
  errors: Record<string, string>;
  emailTaken: boolean;
  emailRef: React.RefObject<TextInput | null>;
  onChangeEmail: (v: string) => void;
  onBlurEmail: () => void;
  onChangePassword: (v: string) => void;
  onBlurPassword: () => void;
  onSignIn: () => void;
}) {
  return (
    <View style={fieldStyles.group}>
      <Text style={fieldStyles.otpDesc}>
        Create your account with an email and password. We'll send a code to verify your email next.
      </Text>
      <View style={fieldStyles.fieldBlock}>
        <Text style={fieldStyles.label}>Email</Text>
        <TextInput
          ref={emailRef}
          style={[fieldStyles.input, !!errors.email && fieldStyles.inputError]}
          value={email}
          onChangeText={onChangeEmail}
          onBlur={onBlurEmail}
          placeholder="you@example.com"
          placeholderTextColor={Colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          autoFocus
        />
        {!!errors.email && (
          <View style={fieldStyles.errorRow}>
            <Text style={fieldStyles.errorText}>{errors.email}</Text>
            {emailTaken && (
              <TouchableOpacity onPress={onSignIn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Text style={fieldStyles.errorLink}>Sign in instead</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      <View style={fieldStyles.fieldBlock}>
        <Text style={fieldStyles.label}>Password</Text>
        <TextInput
          style={[fieldStyles.input, !!errors.password && fieldStyles.inputError]}
          value={password}
          onChangeText={onChangePassword}
          onBlur={onBlurPassword}
          placeholder="Create a password"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        <View style={fieldStyles.reqRow}>
          <PwReq ok={pwReqs.length} label="8+ characters" />
          <PwReq ok={pwReqs.upper} label="Uppercase" />
          <PwReq ok={pwReqs.number} label="Number" />
        </View>
        {!!errors.password && <Text style={fieldStyles.errorText}>{errors.password}</Text>}
      </View>
    </View>
  );
}

function PwReq({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'ellipse-outline'}
        size={14}
        color={ok ? Colors.primary : Colors.textMuted}
      />
      <Text style={{ fontSize: 12, color: ok ? Colors.primary : Colors.textMuted }}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — OTP Verify
// ─────────────────────────────────────────────────────────────────────────────

function StepOTP({
  code, otpLength, error, verified, countdown, canResend,
  onCode, onResend,
}: {
  code: string;
  otpLength: number;
  error: string;
  verified: boolean;
  countdown: number;
  canResend: boolean;
  onCode: (val: string, isComplete: boolean) => void;
  onResend: () => void;
  onSkip?: undefined;
}) {
  return (
    <View style={{ gap: 24 }}>
      <Text style={fieldStyles.otpDesc}>
        We sent a {otpLength}-digit code to your email.{'\n'}
        Enter it below to confirm it's you.
      </Text>

      <OtpInput
        value={code}
        length={otpLength}
        onChange={(val) => onCode(val, false)}
        onComplete={(val) => onCode(val, true)}
        hasError={!!error}
        verified={verified}
        autoFocus
      />

      {!!error && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="alert-circle-outline" size={15} color={Colors.error} />
          <Text style={{ color: Colors.error, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {verified && (
        <View style={fieldStyles.verifiedPill}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
          <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: '700' }}>Email verified</Text>
        </View>
      )}

      {!verified && (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>Didn't get a code? </Text>
          {canResend ? (
            <TouchableOpacity onPress={onResend}>
              <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '700' }}>Resend code</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ color: Colors.textMuted, fontSize: 14 }}>
              Resend in 0:{countdown.toString().padStart(2, '0')}
            </Text>
          )}
        </View>
      )}

    </View>
  );
}

function ReqRow({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={fieldStyles.reqRow}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={14}
        color={met ? Colors.primary : Colors.textMuted}
      />
      <Text style={[fieldStyles.reqText, met && fieldStyles.reqMet]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Profile
// ─────────────────────────────────────────────────────────────────────────────

function StepProfile({
  name, username, phone, errors, usernameChecking, usernameAvailable,
  nameRef, usernameRef,
  onChangeName, onChangeUsername, onChangePhone, onBlurName, onBlurUsername, onUsernameSubmit,
}: {
  name: string;
  username: string;
  phone: string;
  errors: Record<string, string>;
  usernameChecking: boolean;
  usernameAvailable: boolean | null;
  nameRef: React.RefObject<TextInput | null>;
  usernameRef: React.RefObject<TextInput | null>;
  onChangeName: (v: string) => void;
  onChangeUsername: (v: string) => void;
  onChangePhone: (v: string) => void;
  onBlurName: () => void;
  onBlurUsername: () => void;
  onUsernameSubmit: () => void;
}) {
  return (
    <View style={fieldStyles.group}>
      {/* Full Name */}
      <View style={fieldStyles.fieldBlock}>
        <Text style={fieldStyles.label}>Full Name</Text>
        <TextInput
          ref={nameRef}
          style={[fieldStyles.input, !!errors.name && fieldStyles.inputError]}
          value={name}
          onChangeText={onChangeName}
          onBlur={onBlurName}
          placeholder="Alex Kamau"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => usernameRef.current?.focus()}
        />
        {!!errors.name && <Text style={fieldStyles.errorText}>{errors.name}</Text>}
      </View>

      {/* Username */}
      <View style={fieldStyles.fieldBlock}>
        <Text style={fieldStyles.label}>Username</Text>
        <View style={[fieldStyles.inputWrap, !!errors.username && fieldStyles.inputWrapError]}>
          <Text style={fieldStyles.prefix}>@</Text>
          <TextInput
            ref={usernameRef}
            style={fieldStyles.inputInner}
            value={username}
            onChangeText={onChangeUsername}
            onBlur={onBlurUsername}
            placeholder="alexkamau"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={onUsernameSubmit}
          />
          {usernameChecking && (
            <ActivityIndicator size="small" color={Colors.textMuted} style={fieldStyles.inputSuffix} />
          )}
          {!usernameChecking && username.length >= 3 && usernameAvailable === true && (
            <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={fieldStyles.inputSuffix} />
          )}
          {!usernameChecking && usernameAvailable === false && (
            <Ionicons name="close-circle" size={18} color={Colors.error} style={fieldStyles.inputSuffix} />
          )}
        </View>
        {!!errors.username && <Text style={fieldStyles.errorText}>{errors.username}</Text>}
        {!errors.username && usernameAvailable === false && (
          <Text style={fieldStyles.errorText}>Username is already taken.</Text>
        )}
      </View>

      {/* Phone — required */}
      <View style={fieldStyles.fieldBlock}>
        <Text style={fieldStyles.label}>Phone Number</Text>
        <View style={fieldStyles.phoneWrap}>
          <View style={fieldStyles.phonePrefixBox}>
            <Text style={fieldStyles.phoneFlag}>🇰🇪</Text>
            <Text style={fieldStyles.phonePrefixText}>+254</Text>
          </View>
          <TextInput
            style={fieldStyles.phoneInput}
            value={phone}
            onChangeText={onChangePhone}
            placeholder="712 345 678"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
            returnKeyType="done"
          />
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Photo
// ─────────────────────────────────────────────────────────────────────────────

function StepPhoto({
  avatarUri, onPick, loading,
}: {
  avatarUri: string;
  onPick: () => void;
  loading: boolean;
}) {
  return (
    <View style={photoStyles.container}>
      <Text style={photoStyles.subtitle}>
        Add a photo so teammates can recognise you at events.{'\n'}You can always change it later.
      </Text>

      <TouchableOpacity
        style={photoStyles.circle}
        onPress={onPick}
        activeOpacity={0.8}
        disabled={loading}
      >
        {avatarUri ? (
          <>
            <Image source={{ uri: avatarUri }} style={photoStyles.image} />
            <View style={photoStyles.editBadge}>
              <Ionicons name="camera" size={14} color={Colors.background} />
            </View>
          </>
        ) : (
          <>
            <Ionicons name="camera-outline" size={40} color={Colors.textSecondary} />
            <Text style={photoStyles.addLabel}>Tap to add</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={photoStyles.skipNote}>
        {avatarUri ? 'Tap the photo to change it.' : 'Optional — you can add this later.'}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

// ── Mobile (iOS/Android) styles — recreate the onboarding revamp handoff ──────
const FIELD_BG = '#141414';
const FIELD_BORDER = '#262626';

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },

  // Shared step frame (Verify / Profile). Padding mirrors the prototype's
  // `.step { padding: 60 24 34 }`, with the top value coming from the safe area.
  step: { flex: 1, paddingHorizontal: 24 },

  // Top nav: back chevron + progress bar
  topnav: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  chev: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#161616',
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  pbar: { flex: 1, height: 4, backgroundColor: '#1e1e1e', borderRadius: 3, overflow: 'hidden' },
  pbarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },

  // Create-step banner
  banner: { position: 'relative', overflow: 'hidden' },
  bannerNav: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerTitle: {
    position: 'absolute', left: 24, bottom: 14,
    color: Colors.textPrimary, fontSize: 26, fontWeight: '900', letterSpacing: -1.1,
  },
  createBody: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 12 },

  // Titles / subs
  stitle: { color: Colors.textPrimary, fontSize: 30, fontWeight: '900', letterSpacing: -1.1, lineHeight: 31, marginBottom: 8 },
  ssub: { color: '#9a9a9a', fontSize: 14, lineHeight: 21, marginBottom: 24 },

  // Labels + fields
  lbl: {
    color: '#8a8a8a', fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 8,
  },
  fld: {
    backgroundColor: FIELD_BG, borderWidth: 1, borderColor: FIELD_BORDER, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 15, color: Colors.textPrimary, fontSize: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  fldError: { borderColor: Colors.error },

  // Password requirement chips
  chipsRow: { flexDirection: 'row', gap: 14, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontSize: 11.5, fontWeight: '600' },

  // Errors
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 4 },
  errText: { color: Colors.error, fontSize: 12 },
  errLink: { color: Colors.primary, fontSize: 12, fontWeight: '700' },

  // OTP extras
  otpErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  otpErrorText: { color: Colors.error, fontSize: 13 },
  resendText: { color: '#8a8a8a', fontSize: 13.5, marginTop: 20 },
  resendLink: { color: Colors.primary, fontSize: 13.5, fontWeight: '700' },
  resendMuted: { color: '#565656', fontSize: 13.5 },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start',
    backgroundColor: `${Colors.primary}14`, borderWidth: 1, borderColor: `${Colors.primary}55`,
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginTop: 20,
  },
  verifiedText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },

  // Profile: avatar + username + phone
  avatarWrap: { alignItems: 'center', marginBottom: 22 },
  avatar: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: FIELD_BG,
    borderWidth: 1, borderColor: '#333', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 3, overflow: 'hidden',
  },
  avatarImg: { width: 92, height: 92, borderRadius: 46 },
  avatarLabel: { color: '#666', fontSize: 10 },
  unWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: FIELD_BG, borderWidth: 1, borderColor: FIELD_BORDER, borderRadius: 14,
    paddingHorizontal: 16,
  },
  prefixAt: { color: '#666', fontSize: 16 },
  unInput: {
    flex: 1, color: Colors.textPrimary, fontSize: 16, paddingVertical: 15,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  phoneRow: { flexDirection: 'row', gap: 10 },
  phonePrefixBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: FIELD_BG, borderWidth: 1, borderColor: FIELD_BORDER, borderRadius: 14,
    paddingHorizontal: 14,
  },
  phoneFlag: { fontSize: 16 },
  phonePrefix: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  phoneInput: {
    flex: 1, backgroundColor: FIELD_BG, borderWidth: 1, borderColor: FIELD_BORDER, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 15, color: Colors.textPrimary, fontSize: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },

  // Primary pill button
  pbtn: {
    borderRadius: 30, paddingVertical: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  pbtnDim: { opacity: 0.4 },
  pbtnText: { color: Colors.background, fontSize: 16.5, fontWeight: '800', letterSpacing: -0.2 },

  // Footers
  stepFooter: { paddingHorizontal: 24, paddingTop: 12 },
  grow: { flex: 1, minHeight: 14 },
  signinRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  signinText: { color: '#8a8a8a', fontSize: 13 },
  signinLink: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

  // Done / success
  doneRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  glow: {
    position: 'absolute', top: '22%', width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(200,255,0,0.12)',
  },
  successCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 26,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 20, shadowOpacity: 0.5,
    elevation: 12,
  },
  doneTitle: { color: Colors.textPrimary, fontSize: 38, fontWeight: '900', letterSpacing: -1.4, marginBottom: 12 },
  doneSub: { color: '#a5a5a5', fontSize: 15, lineHeight: 22.5, textAlign: 'center', maxWidth: 270, marginBottom: 32 },
  doneBtn: { alignSelf: 'stretch', maxWidth: 280 },

  // Network toast
  toast: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surfaceElevated, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  toastText: { color: Colors.textPrimary, fontSize: 14, flex: 1 },
});

const fieldStyles = StyleSheet.create({
  group: { gap: 24 },
  fieldBlock: { gap: 8 },
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
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputError: { borderColor: Colors.error },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: 16,
  },
  inputWrapError: { borderColor: Colors.error },
  inputInner: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    paddingVertical: 14,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  prefix: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginRight: 4,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  inputSuffix: {
    marginRight: 14,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    flex: 1,
  },
  errorLink: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  reqList: { gap: 6, marginTop: 4 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reqText: { color: Colors.textMuted, fontSize: 12 },
  reqMet: { color: Colors.primary },
  phoneWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  phonePrefixBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  phoneFlag: { fontSize: 18 },
  phonePrefixText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    letterSpacing: 0.3,
  },
  otpDesc: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  otpBox: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: { borderColor: Colors.border },
  otpBoxError: { borderColor: Colors.error },
  otpBoxVerified: { backgroundColor: `${Colors.primary}1A`, borderColor: Colors.primary },
  otpInput: {
    width: '100%',
    height: '100%',
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  otpVerifyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
  },
  otpVerifyText: { color: Colors.background, fontSize: 16, fontWeight: '800' },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    backgroundColor: `${Colors.primary}14`,
    borderWidth: 1,
    borderColor: `${Colors.primary}55`,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});

const photoStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 32,
    gap: 16,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 16,
  },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: 120, height: 120, borderRadius: 60 },
  editBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.background,
  },
  addLabel: { color: Colors.textMuted, fontSize: 12, marginTop: 6 },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  skipNote: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
});
