import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Expo Go on Android (SDK 53+) stripped the native notifications module, so simply
// *importing* expo-notifications there logs a hard error. fitXball uses only local
// notifications, so we lazy-load the module and skip it entirely in Expo Go on
// Android — the import (and its error) never happens. iOS Expo Go and any
// development/standalone build keep full functionality.
const isExpoGoAndroid = Constants.appOwnership === 'expo' && Platform.OS === 'android';

type NotificationsModule = typeof import('expo-notifications');

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (isExpoGoAndroid) return null;
  return import('expo-notifications');
}

export type NotificationData = { type?: string; bookingId?: string; [key: string]: unknown };

export async function setupNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  // Foreground handler — show banner + sound even when app is open
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Android requires a named channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('fitxball', {
      name: 'fitxball',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C8FF00',
    });
  }
}

// Routes the "tap a notification" callback through the lazy module so callers
// (e.g. the root layout) never import expo-notifications directly.
export async function addNotificationResponseListener(
  onTap: (data: NotificationData) => void
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  return Notifications.addNotificationResponseReceivedListener((response) => {
    onTap(response.notification.request.content.data as NotificationData);
  });
}

// Current permission status, or null when notifications are unavailable.
export async function getNotificationPermissionStatus(): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Immediate confirmation notification — fired right after booking succeeds
export async function scheduleBookingConfirmation(eventTitle: string): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Slot booked!',
      body: `You're confirmed for ${eventTitle}. Your entry ticket is ready.`,
      data: { type: 'booking_confirmed' },
    },
    trigger: null, // fires immediately
  });
}

// 24h reminder — scheduled for the day before the event
// Returns the notification identifier so it can be cancelled if needed
export async function scheduleEventReminder(
  bookingId: string,
  eventTitle: string,
  eventLocation: string,
  isoDate: string,
  time: string
): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  const granted = await requestNotificationPermission();
  if (!granted) return null;

  const eventDate = buildEventDate(isoDate, time);
  if (!eventDate) return null;

  const reminderDate = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
  if (reminderDate <= new Date()) return null; // already past

  const timeDisplay = formatTime(time);

  const id = await Notifications.scheduleNotificationAsync({
    identifier: `reminder-${bookingId}`,
    content: {
      title: `Tomorrow: ${eventTitle}`,
      body: `Your session starts at ${timeDisplay} at ${eventLocation}. Tap for your entry ticket.`,
      data: { type: 'event_reminder', bookingId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
    },
  });

  return id;
}

export async function cancelEventReminder(bookingId: string): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(`reminder-${bookingId}`);
}

function buildEventDate(isoDate: string, time: string): Date | null {
  const match = isoDate.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const [hourStr = '0', minuteStr = '0'] = time.split(':');
  return new Date(year, month, day, parseInt(hourStr, 10), parseInt(minuteStr, 10));
}

function formatTime(time: string): string {
  const [hourStr, minuteStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  if (isNaN(hour)) return time;
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:${minuteStr ?? '00'} ${period}`;
}
