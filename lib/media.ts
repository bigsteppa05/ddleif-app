import { Alert, Linking, Platform } from 'react-native';
import { notify } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Single entry point for picking an image from the device's photo library
// (camera roll). Used for profile avatars and admin event images.
//
// Permission model — deliberately per-platform:
//  • Web    — a hidden file input; there is no permission concept.
//  • iOS    — launchImageLibraryAsync uses the system PHPicker, which needs NO
//             permission, so we never prompt (the privacy-friendly path Apple
//             recommends). No NSPhotoLibrary prompt is shown.
//  • Android — the system photo picker needs no permission on Android 13+, but
//             older versions require media access. We request it and, if it's
//             permanently denied, send the user to Settings so the button is
//             never a dead end.
// ─────────────────────────────────────────────────────────────────────────────

export type PickImageOptions = {
  /** Crop aspect ratio for the built-in editor. Defaults to a square. */
  aspect?: [number, number];
  /** 0–1 JPEG quality. Defaults to 0.8. */
  quality?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImagePickerModule = any;

export async function pickImageFromLibrary(opts: PickImageOptions = {}): Promise<string | null> {
  if (Platform.OS === 'web') return pickImageWeb();

  try {
    // Lazy require so web bundles never pull in the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker: ImagePickerModule = require('expo-image-picker');

    if (Platform.OS === 'android') {
      const granted = await ensureAndroidLibraryPermission(ImagePicker);
      if (!granted) return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: opts.aspect ?? [1, 1],
      quality: opts.quality ?? 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) return result.assets[0].uri;
    return null;
  } catch {
    notify('Not available', 'Photo picker requires a native build.');
    return null;
  }
}

async function ensureAndroidLibraryPermission(ImagePicker: ImagePickerModule): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;

  if (current.canAskAgain) {
    const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (asked.granted) return true;
    // Declined this time but still askable — don't nag with a Settings prompt.
    if (asked.canAskAgain) return false;
  }

  // Permanently denied → the only way back is the OS settings screen.
  Alert.alert(
    'Photos access needed',
    'To upload an image, allow fitXball to access your photos in Settings.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ],
  );
  return false;
}

function pickImageWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? URL.createObjectURL(file) : null);
    };
    input.click();
  });
}
