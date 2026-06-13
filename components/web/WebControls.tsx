// Native DOM form controls for web. RN Modal-based pickers misbehave on web
// (stuck overlays, unscrollable lists); on web we render real <select> /
// <input type="date|time"> — native scroll, native popups, zero overlay state.
import React from 'react';
import { Colors } from '@/constants/colors';

const domControlStyle: Record<string, string | number> = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: Colors.textPrimary,
  fontSize: 15,
  padding: '6px 0',
  fontFamily: 'inherit',
  colorScheme: 'dark',
  cursor: 'pointer',
};

export function WebSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder: string;
}) {
  return React.createElement(
    'select',
    {
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: { ...domControlStyle, color: value ? Colors.textPrimary : Colors.textMuted },
    },
    React.createElement('option', { value: '', disabled: true, hidden: true }, placeholder),
    ...options.map((o) =>
      React.createElement('option', { key: o.value, value: o.value, style: { color: '#111' } }, o.label),
    ),
  );
}

export function WebDate({ value, onChange, min }: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  return React.createElement('input', {
    type: 'date',
    value,
    min,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    style: { ...domControlStyle, color: value ? Colors.textPrimary : Colors.textMuted },
  });
}

export function WebTime({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) {
  return React.createElement('input', {
    type: 'time',
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    style: { ...domControlStyle, color: value ? Colors.textPrimary : Colors.textMuted },
  });
}
