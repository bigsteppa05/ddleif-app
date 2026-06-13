import { useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  value: string;
  length: number;
  onChange: (val: string) => void;
  onComplete?: (val: string) => void;
  hasError?: boolean;
  verified?: boolean;
  autoFocus?: boolean;
}

export function OtpInput({ value, length, onChange, onComplete, hasError, verified, autoFocus }: Props) {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  function handleChange(text: string) {
    const clean = text.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  }

  const digits = value.split('').concat(Array(length - value.length).fill(''));

  return (
    <View style={styles.container}>
      {/* Hidden input captures all keypresses */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={length}
        caretHidden={Platform.OS !== 'web'}
        autoComplete="one-time-code"
        style={styles.hiddenInput}
        editable={!verified}
      />

      {/* Visual boxes — tapping them focuses the hidden input */}
      <View style={styles.boxes} pointerEvents="none">
        {digits.map((d, i) => {
          const isActive = !verified && value.length === i;
          const isFilled = !!d;
          return (
            <View
              key={i}
              style={[
                styles.box,
                isActive && styles.boxActive,
                hasError && styles.boxError,
                verified && styles.boxVerified,
                isFilled && !hasError && !verified && styles.boxFilled,
              ]}
            >
              <Text style={styles.digit}>{d}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    height: 64,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: Platform.OS === 'web' ? 0.01 : 0,
    zIndex: 1,
    fontSize: 1,
    color: 'transparent',
  },
  boxes: {
    flexDirection: 'row',
    gap: 9,
    height: 64,
  },
  box: {
    flex: 1,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: Colors.primary },
  boxFilled: { borderColor: `${Colors.primary}80` },
  boxError: { borderColor: Colors.error },
  boxVerified: { backgroundColor: `${Colors.primary}1A`, borderColor: Colors.primary },
  digit: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
  },
});
