import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/(auth)/welcome');
      } else if (event === 'SIGNED_IN' && session) {
        router.replace('/(tabs)');
      } else if (event === 'PASSWORD_RECOVERY') {
        router.push('/(auth)/reset-password');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
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
    </Stack>
  );
}
