// Desktop app frame: sidebar + centered scrollable content column.
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, getUserProfile, type Profile } from '@/lib/supabase';
import { onCreditsChanged } from '@/lib/credits';
import { FW, Sidebar } from './kit';

export function WebShell({ children, admin, maxWidth = 1104, padTop = 44 }: {
  children: React.ReactNode; admin?: boolean; maxWidth?: number; padTop?: number;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      getUserProfile().then((p) => { if (mounted) setProfile(p); });
      return () => { mounted = false; };
    }, [])
  );

  // Refresh the sidebar credits card the moment a top-up settles
  useEffect(() => {
    return onCreditsChanged(() => {
      getUserProfile().then(setProfile);
    });
  }, []);

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: FW.bg }}>
      <Sidebar
        admin={admin}
        profileName={profile?.name || profile?.email?.split('@')[0]}
        profileUsername={profile?.username}
        credits={profile?.credits ?? 0}
        onSignOut={() => supabase.auth.signOut()}
        onTopUp={() => router.push('/credits/topup')}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{
          width: '100%', maxWidth,
          paddingTop: padTop, paddingHorizontal: 48, paddingBottom: 48,
        }}>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}
