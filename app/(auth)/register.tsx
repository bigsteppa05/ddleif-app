import { useRef, useState, useEffect } from 'react';
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
  Alert,
  Animated,
  TouchableWithoutFeedback,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, uploadAvatar } from '@/lib/supabase';
import { OtpInput } from '@/components/OtpInput';
import { Colors } from '@/constants/colors';
import { notify } from '@/lib/ui';
import { AuthShell, AuthHeading, LimeLink, WBtn, FW, useIsDesktopWeb } from '@/components/web/kit';

const TOTAL_STEPS = 4;

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [step, setStep] = useState(0);

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

  // Username availability
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Submission
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Animations
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const toastSlide = useRef(new Animated.Value(80)).current;

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

  async function handleNext() {
    if (!currentStepValid) {
      shake();
      if (step === 0) {
        if (!emailValid || emailTaken)
          setFieldError('email', emailTaken ? 'This email is already registered.' : 'Enter a valid email address.');
        if (!phoneValid)
          setFieldError('phone', 'Enter a valid Kenyan phone number.');
        if (!pwValid)
          setFieldError('password', "Password doesn't meet all requirements.");
      } else if (step === 2) {
        if (!name.trim()) setFieldError('name', 'Full name is required.');
        if (!username || username.length < 3) setFieldError('username', 'At least 3 characters.');
        else if (usernameAvailable === false) setFieldError('username', 'Username is already taken.');
      }
      return;
    }
    if (step === 0) {
      const { error: otpSendError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
      });
      if (otpSendError) {
        setLoading(false);
        setToastMsg(otpSendError.message);
        return;
      }
      setOtpCountdown(60);
      setOtpCanResend(false);
      const timer = setInterval(() => {
        setOtpCountdown((c) => {
          if (c <= 1) { clearInterval(timer); setOtpCanResend(true); return 0; }
          return c - 1;
        });
      }, 1000);
    }
    if (step < TOTAL_STEPS - 1) {
      scrollTo(step + 1);
    } else {
      handleFinish();
    }
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
    router.replace('/(tabs)');
  }

  // ── Photo picker ──────────────────────────────────────────────────────────
  async function pickPhoto() {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) setAvatarUri(URL.createObjectURL(file));
      };
      input.click();
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ImagePicker = require('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
    } catch {
      notify('Not available', 'Image picker requires a native build.');
    }
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
      onCode={async (val, isComplete) => {
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
        } else {
          setOtpError('');
          setOtpVerified(true);
          // Persist the password collected in step 1 — enables password login
          supabase.auth.updateUser({ password }).then(({ error: pwError }) => {
            if (pwError) console.warn('Could not set password:', pwError.message);
          });
          // Auto-advance to the profile step once verified
          setTimeout(() => setStep((s) => (s === 1 ? 2 : s)), 700);
        }
      }}
      onResend={async () => {
        if (!otpCanResend) return;
        setOtpCanResend(false);
        setOtpCountdown(60);
        const timer = setInterval(() => {
          setOtpCountdown((c) => {
            if (c <= 1) { clearInterval(timer); setOtpCanResend(true); return 0; }
            return c - 1;
          });
        }, 1000);
        const { error: resendError } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });
        if (resendError) setOtpError(resendError.message);
      }}
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

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.backBtn} />
          <View style={styles.dotsRow}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step && styles.dotActive,
                  i < step && styles.dotDone,
                ]}
              />
            ))}
          </View>
          <Text style={styles.stepCount}>Step {step + 1} of {TOTAL_STEPS}</Text>
        </View>

        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <Text style={styles.stepTitle}>{stepTitle}</Text>
        </Animated.View>

        {/* ── Step content ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.stepContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {stepComponents[step]}
        </ScrollView>

        {/* ── Footer ── */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {step === TOTAL_STEPS - 1 && (
            <TouchableOpacity onPress={() => !loading && handleFinish()} disabled={loading}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
          {/* OTP step: hide default Continue; StepOTP handles its own verify button */}
          {step !== 1 && (
            <TouchableOpacity
              style={[
                styles.cta,
                step === TOTAL_STEPS - 1 && styles.ctaFull,
                !currentStepValid && styles.ctaDim,
              ]}
              onPress={handleNext}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.ctaText}>{ctaLabel}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Sign in link ── */}
        <View style={[styles.signinRow, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.signinText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} disabled={loading}>
            <Text style={styles.signinLink}>Sign In</Text>
          </TouchableOpacity>
        </View>

        {/* ── Network toast ── */}
        {!!toastMsg && (
          <Animated.View
            style={[
              styles.toast,
              { bottom: insets.bottom + 104, transform: [{ translateY: toastSlide }] },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
            <Text style={styles.toastText}>{toastMsg}</Text>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 20,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  dotDone: {
    backgroundColor: Colors.primaryDim,
    opacity: 0.6,
  },
  stepCount: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  stepTitle: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  stepContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  skipText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 14,
    minWidth: 130,
    gap: 6,
  },
  ctaFull: { flex: 1 },
  ctaDim: { opacity: 0.4 },
  ctaText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '800',
  },
  signinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 8,
  },
  signinText: { color: Colors.textSecondary, fontSize: 14 },
  signinLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
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
