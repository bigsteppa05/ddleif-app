// Desktop form field — label, surface box, focus/error borders per design.
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle, StyleProp, TextInputProps } from 'react-native';
import { FW, WLabel } from './kit';

export function WField({
  label, error, hint, right, style, ...inputProps
}: TextInputProps & {
  label?: string; error?: string; hint?: string;
  right?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 8 }, style]}>
      {label ? <WLabel>{label}</WLabel> : null}
      <View style={[
        styles.box,
        { borderColor: error ? FW.error : focused ? FW.primary : FW.border },
      ]}>
        <TextInput
          {...inputProps}
          onFocus={(e) => { setFocused(true); inputProps.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); inputProps.onBlur?.(e); }}
          placeholderTextColor={FW.muted}
          style={styles.input}
        />
        {right ? <View style={{ marginLeft: 'auto' }}>{right}</View> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: FW.surface, borderRadius: 12, borderWidth: 1,
    paddingVertical: 13, paddingHorizontal: 16,
  },
  input: { flex: 1, color: FW.text, fontSize: 15, padding: 0, outlineStyle: 'none' } as any,
  error: { color: FW.error, fontSize: 12.5 },
  hint: { color: FW.muted, fontSize: 12.5 },
});
