import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase, checkCanCheckIn } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { DEV_BYPASS_AUTH } from '@/constants/dev';

// Attendance area — open to admins AND checkers (profiles.can_check_in), but not
// plain members. The scanner + entry list live here; /admin stays admin-only.
export default function CheckinLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function gate() {
      if (DEV_BYPASS_AUTH) {
        setChecking(false);
        return;
      }
      // getUser() validates the token server-side — avoids stale sessions
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.replace('/(auth)/login');
        return;
      }
      const ok = await checkCanCheckIn();
      if (!ok) {
        router.replace('/(tabs)');
        return;
      }
      setChecking(false);
    }
    gate();
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
