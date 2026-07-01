import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { DEV_BYPASS_AUTH } from '@/constants/dev';

const HOME_TITLE = 'fitXball | Book Casual Sports Games in Nairobi';
const HOME_DESC =
  'Discover and book organised football, padel, basketball and volleyball sessions across Nairobi. Choose a game, reserve your place and show up ready to play.';

// The `/` route is a redirect gate, so the homepage's own SEO tags live here
// (this is the HTML Google serves for https://www.fitxball.com/).
function HomeHead() {
  return (
    <Head>
      <title>{HOME_TITLE}</title>
      <meta name="description" content={HOME_DESC} />
      <link rel="canonical" href="https://www.fitxball.com/" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={HOME_TITLE} />
      <meta property="og:description" content={HOME_DESC} />
      <meta property="og:url" content="https://www.fitxball.com/" />
      <meta property="og:image" content="https://www.fitxball.com/logo.png" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://www.fitxball.com/logo.png" />
    </Head>
  );
}

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <HomeHead />
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <HomeHead />
      <Redirect href={isLoggedIn || DEV_BYPASS_AUTH ? '/(tabs)' : '/(auth)/welcome'} />
    </>
  );
}
