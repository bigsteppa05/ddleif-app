import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAppConfig } from '@/components/AppConfigProvider';

// Tone → accent color. Falls back to the brand primary.
const TONE_COLOR: Record<string, string> = {
  info: Colors.primary,
  success: Colors.primary,
  warning: Colors.warning,
};

/**
 * Renders the remote-configured promo/announcement banner (public.app_config.banner)
 * when it's enabled and has text. Fully controlled from config — no app update needed
 * to show, hide, or change it. Renders nothing when disabled.
 */
export function PromoBanner() {
  const { banner } = useAppConfig();
  if (!banner?.enabled || !banner.text) return null;

  const accent = TONE_COLOR[banner.tone ?? 'info'] ?? Colors.primary;
  const hasCta = !!(banner.cta_label && banner.cta_url);

  const openCta = () => {
    if (banner.cta_url) Linking.openURL(banner.cta_url).catch(() => {});
  };

  return (
    <View style={[styles.wrap, { borderColor: accent }]}>
      <Ionicons name="megaphone-outline" size={18} color={accent} style={styles.icon} />
      <Text style={styles.text}>{banner.text}</Text>
      {hasCta && (
        <TouchableOpacity onPress={openCta} style={[styles.cta, { backgroundColor: accent }]} activeOpacity={0.85}>
          <Text style={styles.ctaText}>{banner.cta_label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  icon: { marginTop: 1 },
  text: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 13.5,
    lineHeight: 19,
  },
  cta: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  ctaText: {
    color: Colors.background,
    fontSize: 12.5,
    fontWeight: '800',
  },
});
