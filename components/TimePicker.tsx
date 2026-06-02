import { View, Text, StyleSheet } from 'react-native';
import { Dropdown } from '@/components/Dropdown';
import { Colors } from '@/constants/colors';

type Props = {
  label?: string;
  value: string; // "HH:MM" 24-hour
  onChange: (time: string) => void;
  flat?: boolean;
};

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = String(i).padStart(2, '0');
  return { label: h, value: h };
});

const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(
  (m) => ({ label: m, value: m })
);

function parseTime(t: string) {
  if (!t) return { hour: '', minute: '' };
  const [hour, minute] = t.split(':');
  return { hour: hour ?? '', minute: minute ?? '' };
}

function buildTime(hour: string, minute: string): string {
  if (!hour && !minute) return '';
  return `${hour}:${minute}`;
}

export function TimePicker({ label, value, onChange, flat }: Props) {
  const { hour, minute } = parseTime(value);

  function handleChange(part: 'hour' | 'minute', val: string) {
    const next = {
      hour: part === 'hour' ? val : hour,
      minute: part === 'minute' ? val : minute,
    };
    onChange(buildTime(next.hour, next.minute));
  }

  return (
    <View style={[styles.container, flat && styles.containerFlat]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <View style={styles.half}>
          <Dropdown
            label=""
            value={hour}
            options={HOURS}
            onChange={(v) => handleChange('hour', v)}
            placeholder="HH"
            flat={flat}
          />
        </View>
        <Text style={styles.colon}>:</Text>
        <View style={styles.half}>
          <Dropdown
            label=""
            value={minute}
            options={MINUTES}
            onChange={(v) => handleChange('minute', v)}
            placeholder="MM"
            flat={flat}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  containerFlat: { paddingVertical: 4 },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  half: { flex: 1 },
  colon: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
    paddingBottom: 2,
  },
});
