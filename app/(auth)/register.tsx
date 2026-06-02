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
  FlatList,
  Dimensions,
  Image,
  Alert,
  Animated,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 4;

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const [step, setStep] = useState(0);

  // Form values
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUri, setAvatarUri] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
  const [otpError, setOtpError] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(27);
  const [otpCanResend, setOtpCanResend] = useState(false);

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

  const phoneValid = phone.replace(/\D/g, '').length >= 9;
  const step0Valid = emailValid && phoneValid && pwValid && !emailTaken;
  const step1Valid = otpVerified; // OTP step
  const step2Valid =
    name.trim().length > 0 &&
    username.length >= 3 &&
    /^[a-z0-9_]+$/.test(username) &&
    usernameAvailable === true &&
    !usernameChecking;
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
    listRef.current?.scrollToIndex({ index, animated: true });
    setStep(index);
  }

  function goBack() {
    if (step > 0) { scrollTo(step - 1); return; }
    router.back(); // returns to Welcome screen
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
      // Try to send OTP to phone (requires Twilio in Supabase)
      const fullPhone = `+254${phone.replace(/\D/g, '')}`;
      try {
        await supabase.auth.signInWithOtp({ phone: fullPhone });
      } catch {
        // OTP sending failed silently — user can still proceed after countdown
      }
      // Start OTP countdown
      setOtpCountdown(27);
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
    const trimmedEmail = email.trim().toLowerCase();

    const reg = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data, error: signUpError } = await reg.auth.signUp({
      email: trimmedEmail,
      password,
      options: { data: { name: name.trim() } },
    });

    // Supabase email-enumeration-protection returns user: null with no error
    // when the email is already taken. Treat that as "email taken".
    if (!data.user && !signUpError) {
      setLoading(false);
      setEmailTaken(true);
      setFieldError('email', 'This email is already registered.');
      scrollTo(0);
      shake();
      return;
    }

    if (signUpError || !data.user) {
      setLoading(false);
      const msg = signUpError?.message?.toLowerCase() ?? '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setEmailTaken(true);
        setFieldError('email', 'This email is already registered.');
        scrollTo(0);
        shake();
      } else if (msg.includes('password')) {
        setFieldError('password', "Password doesn't meet requirements.");
        scrollTo(0);
        shake();
      } else {
        // Show the real error so we can diagnose unexpected failures
        setToastMsg(signUpError?.message ?? 'Something went wrong. Please try again.');
      }
      return;
    }

    const userId = data.user.id;

    // If email confirmation is required, sign in to get a session for RLS
    if (!data.session) {
      const { error: signInErr } = await reg.auth.signInWithPassword({ email: trimmedEmail, password });
      if (signInErr) {
        setLoading(false);
        Alert.alert(
          'Confirm your email',
          'Check your inbox and confirm your address, then sign in.',
          [{ text: 'Sign In', onPress: () => router.replace('/(auth)/login') }]
        );
        return;
      }
    }

    // Upload avatar — non-fatal
    let avatarUrl: string | null = null;
    if (avatarUri) {
      try {
        const ext = (avatarUri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg')
          .replace('heic', 'jpg')
          .replace('heif', 'jpg');
        const path = `${userId}.${ext}`;
        const blob = await (await fetch(avatarUri)).blob();
        const { error: upErr } = await reg.storage
          .from('avatars')
          .upload(path, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true });
        if (!upErr) {
          avatarUrl = reg.storage.from('avatars').getPublicUrl(path).data.publicUrl;
        }
      } catch { /* non-fatal */ }
    }

    // Single upsert with all fields + credits: 0
    await reg.from('profiles').upsert(
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

    await reg.auth.signOut();

    // Flag for welcome sheet on home screen
    await SecureStore.setItemAsync('onboarding_needed', 'true');

    // Auto sign-in with main client
    const { error: mainErr } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    setLoading(false);

    if (mainErr) {
      setToastMsg('Account created! Please sign in.');
      setTimeout(() => router.replace('/(auth)/login'), 2000);
    } else {
      router.replace('/(tabs)');
    }
  }

  // ── Photo picker ──────────────────────────────────────────────────────────
  async function pickPhoto() {
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
      Alert.alert('Not available', 'Image picker requires a native build. Run npx expo run:ios to enable it.');
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
      phone={phone}
      password={password}
      errors={errors}
      emailTaken={emailTaken}
      pwReqs={pwReqs}
      pwTouched={pwTouched}
      passwordVisible={passwordVisible}
      emailRef={emailRef}
      phoneRef={phoneRef}
      passwordRef={passwordRef}
      onChangeEmail={(v) => {
        clearError('email');
        setEmailTaken(false);
        setEmail(v.toLowerCase());
      }}
      onChangePhone={(v) => {
        clearError('phone');
        setPhone(v.replace(/\D/g, ''));
      }}
      onChangePassword={(v) => {
        clearError('password');
        setPwTouched(true);
        setPassword(v);
      }}
      onBlurEmail={onBlurEmail}
      onBlurPassword={onBlurPassword}
      onTogglePassword={() => setPasswordVisible((p) => !p)}
      onPasswordSubmit={handleNext}
      onSignIn={() => router.replace('/(auth)/login')}
    />,
    <StepOTP
      key="otp"
      phone={phone}
      digits={otpDigits}
      error={otpError}
      verified={otpVerified}
      countdown={otpCountdown}
      canResend={otpCanResend}
      otpRefs={otpRefs}
      onDigit={(value, index) => {
        const char = value.slice(-1);
        if (char && !/\d/.test(char)) return;
        const next = [...otpDigits];
        next[index] = char;
        setOtpDigits(next);
        setOtpError('');
        if (char && index < 5) {
          otpRefs.current[index + 1]?.focus();
        }
      }}
      onKeyPress={(key, index) => {
        if (key === 'Backspace' && !otpDigits[index] && index > 0) {
          const next = [...otpDigits];
          next[index - 1] = '';
          setOtpDigits(next);
          otpRefs.current[index - 1]?.focus();
        }
      }}
      onVerify={async () => {
        const code = otpDigits.join('');
        if (code.length < 6) return;
        const { error: verifyError } = await supabase.auth.verifyOtp({
          phone: `+254${phone.replace(/\D/g, '')}`,
          token: code,
          type: 'sms',
        });
        if (verifyError) {
          setOtpError("That code isn't right. Check and try again.");
        } else {
          setOtpError('');
          setOtpVerified(true);
        }
      }}
      onResend={async () => {
        if (!otpCanResend) return;
        setOtpCanResend(false);
        setOtpCountdown(27);
        const timer = setInterval(() => {
          setOtpCountdown((c) => {
            if (c <= 1) { clearInterval(timer); setOtpCanResend(true); return 0; }
            return c - 1;
          });
        }, 1000);
        await supabase.auth.signInWithOtp({ phone: `+254${phone.replace(/\D/g, '')}` });
      }}
      onSkip={() => { setOtpVerified(true); scrollTo(2); }}
    />,
    <StepProfile
      key="profile"
      name={name}
      username={username}
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

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={loading}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
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

        {/* ── Sliding steps ── */}
        <FlatList
          ref={listRef}
          data={stepComponents}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
          renderItem={({ item }) => (
            <ScrollView
              style={{ width: SCREEN_WIDTH }}
              contentContainerStyle={styles.stepContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {item}
            </ScrollView>
          )}
        />

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
  email, phone, password, errors, emailTaken, pwReqs, pwTouched, passwordVisible,
  emailRef, phoneRef, passwordRef,
  onChangeEmail, onChangePhone, onChangePassword, onBlurEmail, onBlurPassword,
  onTogglePassword, onPasswordSubmit, onSignIn,
}: {
  email: string;
  phone: string;
  password: string;
  errors: Record<string, string>;
  emailTaken: boolean;
  pwReqs: { length: boolean; upper: boolean; number: boolean };
  pwTouched: boolean;
  passwordVisible: boolean;
  emailRef: React.RefObject<TextInput | null>;
  phoneRef: React.RefObject<TextInput | null>;
  passwordRef: React.RefObject<TextInput | null>;
  onChangeEmail: (v: string) => void;
  onChangePhone: (v: string) => void;
  onChangePassword: (v: string) => void;
  onBlurEmail: () => void;
  onBlurPassword: () => void;
  onTogglePassword: () => void;
  onPasswordSubmit: () => void;
  onSignIn: () => void;
}) {
  return (
    <View style={fieldStyles.group}>
      {/* Email */}
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
          onSubmitEditing={() => phoneRef.current?.focus()}
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

      {/* Phone */}
      <View style={fieldStyles.fieldBlock}>
        <Text style={fieldStyles.label}>Phone Number</Text>
        <View style={[fieldStyles.phoneWrap, !!errors.phone && fieldStyles.inputWrapError]}>
          <View style={fieldStyles.phonePrefixBox}>
            <Text style={fieldStyles.phoneFlag}>🇰🇪</Text>
            <Text style={fieldStyles.phonePrefixText}>+254</Text>
            <Ionicons name="chevron-down" size={12} color={Colors.textMuted} />
          </View>
          <TextInput
            ref={phoneRef}
            style={fieldStyles.phoneInput}
            value={phone}
            onChangeText={onChangePhone}
            placeholder="712 345 678"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </View>
        {!!errors.phone && <Text style={fieldStyles.errorText}>{errors.phone}</Text>}
      </View>

      {/* Password */}
      <View style={fieldStyles.fieldBlock}>
        <Text style={fieldStyles.label}>Password</Text>
        <View style={[fieldStyles.inputWrap, !!errors.password && fieldStyles.inputWrapError]}>
          <TextInput
            ref={passwordRef}
            style={fieldStyles.inputInner}
            value={password}
            onChangeText={onChangePassword}
            onBlur={onBlurPassword}
            placeholder="Min 8 characters"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!passwordVisible}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={onPasswordSubmit}
          />
          <TouchableOpacity onPress={onTogglePassword} style={fieldStyles.eyeBtn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Ionicons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
        </View>
        {!!errors.password && <Text style={fieldStyles.errorText}>{errors.password}</Text>}

        {pwTouched && (
          <View style={fieldStyles.reqList}>
            <ReqRow met={pwReqs.length} label="At least 8 characters" />
            <ReqRow met={pwReqs.upper} label="One uppercase letter" />
            <ReqRow met={pwReqs.number} label="One number" />
          </View>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — OTP Verify
// ─────────────────────────────────────────────────────────────────────────────

function StepOTP({
  phone, digits, error, verified, countdown, canResend, otpRefs,
  onDigit, onKeyPress, onVerify, onResend, onSkip,
}: {
  phone: string;
  digits: string[];
  error: string;
  verified: boolean;
  countdown: number;
  canResend: boolean;
  otpRefs: React.MutableRefObject<(TextInput | null)[]>;
  onDigit: (value: string, index: number) => void;
  onKeyPress: (key: string, index: number) => void;
  onVerify: () => void;
  onResend: () => void;
  onSkip: () => void;
}) {
  const displayPhone = `+254 ${phone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}`;
  const code = digits.join('');

  return (
    <View style={{ gap: 24 }}>
      <Text style={fieldStyles.otpDesc}>
        We sent a 6-digit code to{' '}
        <Text style={{ color: Colors.textPrimary, fontWeight: '600' }}>{displayPhone}</Text>.
        {'\n'}Enter it below to confirm it's you.
      </Text>

      {/* OTP boxes */}
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {digits.map((d, i) => (
          <View
            key={i}
            style={[
              fieldStyles.otpBox,
              error ? fieldStyles.otpBoxError : verified ? fieldStyles.otpBoxVerified : d ? fieldStyles.otpBoxFilled : undefined,
            ]}
          >
            <TextInput
              ref={(r) => { otpRefs.current[i] = r; }}
              style={fieldStyles.otpInput}
              value={d}
              onChangeText={(v) => onDigit(v, i)}
              onKeyPress={({ nativeEvent }) => onKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
              caretHidden
              editable={!verified}
            />
          </View>
        ))}
      </View>

      {/* Error */}
      {!!error && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="alert-circle-outline" size={15} color={Colors.error} />
          <Text style={{ color: Colors.error, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {/* Verified pill */}
      {verified && (
        <View style={fieldStyles.verifiedPill}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
          <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: '700' }}>Number verified</Text>
        </View>
      )}

      {/* Verify button */}
      {!verified && (
        <TouchableOpacity
          style={[fieldStyles.otpVerifyBtn, code.length < 6 && { opacity: 0.4 }]}
          onPress={onVerify}
          disabled={code.length < 6}
          activeOpacity={0.85}
        >
          <Text style={fieldStyles.otpVerifyText}>Verify</Text>
        </TouchableOpacity>
      )}

      {/* Resend */}
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

      {/* Skip (for dev / Twilio not configured) */}
      <TouchableOpacity onPress={onSkip} style={{ alignSelf: 'center' }}>
        <Text style={{ color: Colors.textMuted, fontSize: 13 }}>
          {verified ? '' : 'Skip verification →'}
        </Text>
      </TouchableOpacity>
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
  name, username, errors, usernameChecking, usernameAvailable,
  nameRef, usernameRef,
  onChangeName, onChangeUsername, onBlurName, onBlurUsername, onUsernameSubmit,
}: {
  name: string;
  username: string;
  errors: Record<string, string>;
  usernameChecking: boolean;
  usernameAvailable: boolean | null;
  nameRef: React.RefObject<TextInput | null>;
  usernameRef: React.RefObject<TextInput | null>;
  onChangeName: (v: string) => void;
  onChangeUsername: (v: string) => void;
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
            returnKeyType="done"
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
          <Image source={{ uri: avatarUri }} style={photoStyles.image} />
        ) : (
          <>
            <Ionicons name="camera-outline" size={40} color={Colors.textSecondary} />
            <Text style={photoStyles.addLabel}>Tap to add</Text>
          </>
        )}
      </TouchableOpacity>

      {avatarUri ? (
        <TouchableOpacity onPress={onPick} disabled={loading} style={photoStyles.changeBtn}>
          <Ionicons name="refresh-outline" size={14} color={Colors.primary} />
          <Text style={photoStyles.changeText}>Change photo</Text>
        </TouchableOpacity>
      ) : (
        <Text style={photoStyles.skipNote}>
          Or tap <Text style={{ color: Colors.textPrimary, fontWeight: '600' }}>Skip</Text> below to continue without one.
        </Text>
      )}
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
