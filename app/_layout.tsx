import { useEffect, useRef, useState } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { setupNotifications, addNotificationResponseListener } from '@/lib/notifications';
import { Colors } from '@/constants/colors';
import { DEV_BYPASS_AUTH } from '@/constants/dev';
import { CookieConsent } from '@/components/CookieConsent';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  // null = still checking the stored session
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    setupNotifications();

    addNotificationResponseListener((data) => {
      if (data?.type === 'event_reminder' && data?.bookingId) {
        router.push({
          pathname: '/booking/ticket',
          params: { bookingId: data.bookingId as string, eventId: '' },
        });
      }
    }).then((sub) => { responseListener.current = sub; });

    return () => {
      responseListener.current?.remove();
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsLoggedIn(!!session);
      if (event === 'SIGNED_OUT') {
        router.replace('/(auth)/welcome');
      } else if (event === 'SIGNED_IN' && session) {
        // Don't redirect mid-registration — let the register screen handle its own flow
        if (!pathnameRef.current.includes('register')) {
          router.replace('/(tabs)');
        }
      } else if (event === 'PASSWORD_RECOVERY') {
        router.push('/(auth)/reset-password');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Hold rendering until the stored session is known so deep links resolve
  // against the correct guard instead of bouncing through the index route.
  if (isLoggedIn === null) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="legal/[page]" />
      <Stack.Protected guard={isLoggedIn || DEV_BYPASS_AUTH}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="event/[id]"
          options={{ animation: 'slide_from_bottom', headerShown: false }}
        />
        <Stack.Screen name="admin" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="credits/topup" />
        <Stack.Screen name="credits/history" />
        <Stack.Screen
          name="booking/confirmed"
          options={{ animation: 'slide_from_bottom', headerShown: false }}
        />
        <Stack.Screen
          name="booking/ticket"
          options={{ animation: 'slide_from_bottom', headerShown: false }}
        />
      </Stack.Protected>
    </Stack>
    <CookieConsent />
    </>
  );
}
