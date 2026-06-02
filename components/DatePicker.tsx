import { View, Text, StyleSheet } from 'react-native';
import { Dropdown } from '@/components/Dropdown';
import { Colors } from '@/constants/colors';

type Props = {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  flat?: boolean;
  years?: { label: string; value: string }[];
  minDate?: string; // YYYY-MM-DD — only this date or later will be shown
};

const MONTHS = [
  { label: 'January', value: '01' },
  { label: 'February', value: '02' },
  { label: 'March', value: '03' },
  { label: 'April', value: '04' },
  { label: 'May', value: '05' },
  { label: 'June', value: '06' },
  { label: 'July', value: '07' },
  { label: 'August', value: '08' },
  { label: 'September', value: '09' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

const DAYS = Array.from({ length: 31 }, (_, i) => {
  const d = String(i + 1).padStart(2, '0');
  return { label: String(i + 1), value: d };
});

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => {
  const y = currentYear - 13 - i;
  return { label: String(y), value: String(y) };
});

function parseDate(iso: string) {
  if (!iso || iso.length < 4) return { year: '', month: '', day: '' };
  const parts = iso.split('-');
  return {
    year: parts[0] ?? '',
    month: parts[1] ?? '',
    day: parts[2] ?? '',
  };
}

function buildIso(year: string, month: string, day: string): string {
  if (!year) return '';
  if (!month) return year;
  if (!day) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

export function DatePicker({ label, value, onChange, flat, years: yearsProp, minDate }: Props) {
  const yearsBase = yearsProp ?? YEARS;
  const { year, month, day } = parseDate(value);
  const min = minDate ? parseDate(minDate) : null;

  const filteredYears = min
    ? yearsBase.filter((y) => parseInt(y.value) >= parseInt(min.year))
    : yearsBase;

  const filteredMonths = min && year === min.year
    ? MONTHS.filter((m) => parseInt(m.value) >= parseInt(min.month))
    : MONTHS;

  const filteredDays = min && year === min.year && month === min.month
    ? DAYS.filter((d) => parseInt(d.value) >= parseInt(min.day))
    : DAYS;

  function handleChange(part: 'year' | 'month' | 'day', val: string) {
    let nextYear = part === 'year' ? val : year;
    let nextMonth = part === 'month' ? val : month;
    let nextDay = part === 'day' ? val : day;

    if (min) {
      // Changing year to the min year — clear month/day if they're now before the minimum
      if (part === 'year' && val === min.year) {
        if (nextMonth && parseInt(nextMonth) < parseInt(min.month)) {
          nextMonth = '';
          nextDay = '';
        } else if (nextMonth === min.month && nextDay && parseInt(nextDay) < parseInt(min.day)) {
          nextDay = '';
        }
      }
      // Changing month to the min month (while on the min year) — clear day if before minimum
      if (part === 'month' && nextYear === min.year && val === min.month) {
        if (nextDay && parseInt(nextDay) < parseInt(min.day)) {
          nextDay = '';
        }
      }
    }

    onChange(buildIso(nextYear, nextMonth, nextDay));
  }

  return (
    <View style={[styles.container, flat && styles.containerFlat]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <View style={styles.day}>
          <Dropdown
            label=""
            value={day}
            options={filteredDays}
            onChange={(v) => handleChange('day', v)}
            placeholder="Day"
            flat={flat}
          />
        </View>
        <View style={styles.month}>
          <Dropdown
            label=""
            value={month}
            options={filteredMonths}
            onChange={(v) => handleChange('month', v)}
            placeholder="Month"
            flat={flat}
          />
        </View>
        <View style={styles.year}>
          <Dropdown
            label=""
            value={year}
            options={filteredYears}
            onChange={(v) => handleChange('year', v)}
            placeholder="Year"
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
    gap: 8,
  },
  day: { flex: 1 },
  month: { flex: 2 },
  year: { flex: 1.4 },
});
