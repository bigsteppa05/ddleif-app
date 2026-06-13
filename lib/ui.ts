// Cross-platform feedback helpers. React Native's Alert is a no-op on web,
// so anything a web user must see has to fall back to the browser's dialogs.
import { Alert, Platform } from 'react-native';

// Fire-and-forget message ("Saved", "Error: …").
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

// Yes/No confirmation. Resolves true if the user confirms.
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Confirm',
  destructive = false,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
