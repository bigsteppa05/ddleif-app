import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase, checkIsAdmin } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { DEV_BYPASS_AUTH } from '@/constants/dev';

export default function AdminLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      if (DEV_BYPASS_AUTH) {
        setChecking(false);
        return;
      }
      // getUser() validates the token server-side — avoids stale SecureStore sessions
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.replace('/(auth)/login');
        return;
      }
      const admin = await checkIsAdmin();
      if (!admin) {
        router.replace('/(tabs)');
        return;
      }
      setChecking(false);
    }
    checkAdmin();
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
