import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { KES_PER_CREDIT } from '@/constants/payments';

// DRAFT legal copy for MVP/team review — have a lawyer review before public launch.

type Section = { heading: string; body: string };
type LegalDoc = { title: string; updated: string; intro: string; sections: Section[] };

const DOCS: Record<string, LegalDoc> = {
  terms: {
    title: 'Terms of Service',
    updated: 'Last updated: 12 June 2026',
    intro:
      'These Terms govern your use of the fitXball app and services operated by fitXball ("we", "us"). By creating an account or booking an event you agree to these Terms.',
    sections: [
      {
        heading: '1. Your account',
        body:
          'You must provide accurate information when registering, including a valid email address and phone number. You are responsible for activity on your account. You must be at least 18 years old, or have the consent of a parent or guardian, to use fitXball.',
      },
      {
        heading: '2. Credits and payments',
        body:
          `Bookings are paid with credits. 1 credit = KES ${KES_PER_CREDIT}. Credits are purchased via M-Pesa, are tied to your account, are not transferable, and have no cash value except where a refund is required by law or by these Terms. Promotional or discounted credits may carry additional conditions.`,
      },
      {
        heading: '3. Bookings and cancellations',
        body:
          'A confirmed booking reserves your slot at an event. You may cancel free of charge up to 12 hours before the event start time, in which case the credits paid are returned to your balance. Cancellations within 12 hours of the start time are not refunded. If we cancel an event, all credits paid are returned in full.',
      },
      {
        heading: '4. Entry and check-in',
        body:
          'Entry to events is by your ticket QR code or booking reference. A ticket admits one participant and may only be checked in once. We may refuse entry where a ticket cannot be verified.',
      },
      {
        heading: '5. Conduct and safety',
        body:
          'Sport involves physical risk. You participate at your own risk and confirm you are fit to take part. You agree to follow venue rules and staff instructions, and to treat other participants with respect. We may suspend accounts for abusive, fraudulent, or dangerous behaviour.',
      },
      {
        heading: '6. Liability',
        body:
          'To the maximum extent permitted by law, fitXball is not liable for personal injury arising from participation in events, for events run by third-party venues, or for indirect losses. Nothing in these Terms excludes liability that cannot be excluded under Kenyan law.',
      },
      {
        heading: '7. Changes and termination',
        body:
          'We may update these Terms from time to time; continued use after an update constitutes acceptance. You may close your account at any time from Profile → Deactivate account. We may suspend or terminate accounts that breach these Terms.',
      },
      {
        heading: '8. Governing law and contact',
        body:
          'These Terms are governed by the laws of Kenya. Questions or disputes: support@fitxball.com.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: 12 June 2026',
    intro:
      'This policy explains how fitXball collects and uses personal data, in line with the Kenya Data Protection Act, 2019. fitXball is the data controller. Contact: support@fitxball.com.',
    sections: [
      {
        heading: '1. Data we collect',
        body:
          'Account data: name, email address, phone number, username, and password (stored as a secure hash by our authentication provider). Optional profile data: date of birth, gender, country, photo, and sports preferences. Activity data: events you book, check-ins, and credit transactions. Payment data: the M-Pesa phone number and transaction receipt for top-ups — we never see or store your M-Pesa PIN.',
      },
      {
        heading: '2. Why we use it',
        body:
          'To operate your account and bookings, verify event entry, process credit top-ups, send service emails (such as login codes and booking confirmations), keep the service secure, and meet legal obligations. We do not sell personal data.',
      },
      {
        heading: '3. Who we share it with',
        body:
          'Service providers who process data on our behalf: Supabase (hosting, database, authentication), Safaricom (M-Pesa payment processing), and Brevo (transactional email). Each processes data only as needed to provide their service. Data may be processed outside Kenya under appropriate safeguards.',
      },
      {
        heading: '4. How long we keep it',
        body:
          'Account and profile data is kept while your account is active. Payment records are retained as required for tax and audit purposes. When you deactivate your account we remove or anonymise your profile data within a reasonable period, except records we must keep by law.',
      },
      {
        heading: '5. Your rights',
        body:
          'Under the Data Protection Act you may access, correct, or request deletion of your personal data, object to processing, and lodge a complaint with the Office of the Data Protection Commissioner. Most data can be corrected directly in Profile → Edit Profile; for anything else email support@fitxball.com.',
      },
      {
        heading: '6. Security',
        body:
          'Data is encrypted in transit, access is restricted by row-level security policies, and payment confirmation happens server-side. No system is perfectly secure; we will notify affected users of any breach as required by law.',
      },
      {
        heading: '7. Children',
        body:
          'fitXball is not directed at children under 18. We do not knowingly collect their data without guardian consent.',
      },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    updated: 'Last updated: 12 June 2026',
    intro:
      'This policy explains what fitXball stores on your device when you use the web app.',
    sections: [
      {
        heading: '1. Strictly necessary storage',
        body:
          'We use your browser\'s local storage to keep you signed in (your authentication session) and to remember your cookie choice. These are essential — the app cannot work without them — and they are not used for tracking.',
      },
      {
        heading: '2. Analytics',
        body:
          'We do not currently use analytics or advertising cookies. If we introduce analytics in future, they will load only if you have accepted them via the cookie banner, and this policy will be updated first.',
      },
      {
        heading: '3. Managing storage',
        body:
          'You can clear stored data at any time through your browser settings (this signs you out), or change your cookie choice by clearing site data and revisiting the app.',
      },
    ],
  },
};

// Tells the web static exporter which legal pages to prerender as real HTML
// files (dist/legal/privacy.html etc.) — required because [page] is dynamic.
// The content in DOCS is synchronous, so the full text lands in the HTML source
// (what Google's no-JS verification fetcher reads).
export async function generateStaticParams(): Promise<{ page: string }[]> {
  return Object.keys(DOCS).map((page) => ({ page }));
}

export default function LegalScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const slug = page && DOCS[page] ? page : 'terms';
  const doc = DOCS[slug];

  return (
    <>
    <Head>
      <title>{`${doc.title} | fitXball`}</title>
      <meta name="description" content={doc.intro.slice(0, 160)} />
      <link rel="canonical" href={`https://www.fitxball.com/legal/${slug}`} />
    </Head>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48 }]}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.title}>{doc.title}</Text>
      <Text style={styles.updated}>{doc.updated}</Text>
      <Text style={styles.intro}>{doc.intro}</Text>
      {doc.sections.map((s) => (
        <View key={s.heading} style={styles.section}>
          <Text style={styles.heading}>{s.heading}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
      <Text style={styles.footerNote}>
        Questions about this document? Email support@fitxball.com.
      </Text>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title: { color: Colors.textPrimary, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  updated: { color: Colors.textMuted, fontSize: 13, marginTop: 6, marginBottom: 18 },
  intro: { color: Colors.textSecondary, fontSize: 15, lineHeight: 23, marginBottom: 24 },
  section: { marginBottom: 22 },
  heading: { color: Colors.textPrimary, fontSize: 16.5, fontWeight: '700', marginBottom: 8 },
  body: { color: Colors.textSecondary, fontSize: 14.5, lineHeight: 22 },
  footerNote: { color: Colors.textMuted, fontSize: 13, marginTop: 12 },
});
