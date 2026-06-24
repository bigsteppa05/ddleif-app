import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { MAPS_APPS, openInMaps, type MapsTarget } from '@/lib/maps';

// Native bottom-sheet that lets the user pick which maps app to open directions in.
// Web never renders this — it opens Google Maps directly (see lib/maps openGoogleMaps).
export function MapsChooser({
  visible,
  onClose,
  target,
}: {
  visible: boolean;
  onClose: () => void;
  target: MapsTarget;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable captures taps so they don't fall through to the backdrop. */}
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Open directions with</Text>
          {MAPS_APPS.map(({ app, label }) => (
            <TouchableOpacity
              key={app}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => {
                openInMaps(app, target);
                onClose();
              }}
            >
              <View style={styles.iconWrap}>
                <Ionicons name="navigate" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.rowLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancel} activeOpacity={0.7} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  cancel: {
    marginTop: 10,
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: Colors.surface,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
});
