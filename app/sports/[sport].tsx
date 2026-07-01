import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import Head from 'expo-router/head';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

type Faq = { q: string; a: string };
type Section = { heading: string; body: string };
type SportDoc = {
  h1: string;
  metaTitle: string;
  metaDesc: string;
  intro: string;
  sections: Section[];
  faqs: Faq[];
};

// Permanent, editorial landing pages — these rank continuously, unlike event
// pages that expire. Content is synchronous so it prerenders into the HTML.
const SPORTS: Record<string, SportDoc> = {
  football: {
    h1: 'Casual Football Games in Nairobi',
    metaTitle: 'Casual Football Games in Nairobi | 5-a-Side & 7-a-Side | fitXball',
    metaDesc:
      'Find organised casual football games in Nairobi, including 5-a-side and 7-a-side sessions. View dates, venues and available booking slots.',
    intro:
      'fitXball runs organised, casual football sessions across Nairobi for players of every level. Pick a session, book your slot, and turn up ready to play — we sort the pitch, the teams and the ball.',
    sections: [
      { heading: 'Formats', body: 'Most sessions are 5-a-side or 7-a-side on turf. Teams are balanced on the day so games stay competitive and fun whether you play weekly or you are just getting back into it.' },
      { heading: 'How booking works', body: 'Browse upcoming football sessions, reserve your place, and you will get a QR-code ticket. Show it at the venue to check in. If a session fills up you can pick another date.' },
      { heading: 'Who it is for', body: 'Working professionals, students and anyone new to Nairobi looking to play regularly and meet people. No club membership, no long-term commitment — just book the games you want.' },
      { heading: 'What to bring', body: 'Boots or trainers with grip, shin pads if you have them, and a water bottle. Come in colours you do not mind swapping for a bib.' },
    ],
    faqs: [
      { q: 'Do I need my own team?', a: 'No. Book as an individual and we balance the teams on the day. Come solo or with friends.' },
      { q: 'How much does a session cost?', a: 'Each session shows its price in credits when you book. Some sessions are free; others are a small fee that covers the pitch.' },
      { q: 'What if I have never played organised football?', a: 'That is fine — sessions are casual and welcoming. Just pick a beginner-friendly session and turn up.' },
    ],
  },
  padel: {
    h1: 'Padel Games in Nairobi',
    metaTitle: 'Padel Games in Nairobi | Book a Court Session | fitXball',
    metaDesc:
      'Play organised padel in Nairobi with fitXball. Book beginner and social padel sessions, see dates and venues, and reserve your slot online.',
    intro:
      'Padel is the fastest-growing racket sport in the world, and fitXball makes it easy to play in Nairobi. Book a social session, get matched with players at your level, and learn the game on court.',
    sections: [
      { heading: 'Formats', body: 'Padel is played in doubles on an enclosed court. fitXball sessions pair you with other players for rotating, social games — ideal for meeting people and getting court time.' },
      { heading: 'How booking works', body: 'Choose an upcoming padel session, reserve your place, and receive a QR-code ticket for entry. Rackets can usually be hired at the venue if you do not own one.' },
      { heading: 'Who it is for', body: 'Complete beginners and experienced players alike. Padel is easy to pick up, so it is a great first racket sport if you are new to Nairobi or new to the game.' },
      { heading: 'What to bring', body: 'Court shoes with good grip and a water bottle. Bring a padel racket if you have one, or hire one on site.' },
    ],
    faqs: [
      { q: 'I have never played padel — can I still join?', a: 'Yes. Most fitXball padel sessions are social and beginner-friendly, and the rules are quick to learn.' },
      { q: 'Do I need a racket?', a: 'Not necessarily — rackets can usually be hired at the venue. Bring your own if you have one.' },
      { q: 'How many players per session?', a: 'Padel is doubles, so sessions run in fours with players rotating across games.' },
    ],
  },
  basketball: {
    h1: 'Basketball Games in Nairobi',
    metaTitle: 'Basketball Games in Nairobi | Pickup & Social Runs | fitXball',
    metaDesc:
      'Join organised pickup basketball in Nairobi with fitXball. Book social runs, view dates and courts, and reserve your spot online.',
    intro:
      'fitXball organises social basketball runs across Nairobi so you always have a game to join. Book a session, get on a balanced team, and play — no need to round up ten players yourself.',
    sections: [
      { heading: 'Formats', body: 'Sessions are typically full-court 5-on-5 or half-court 3-on-3 depending on numbers, with teams balanced on the day.' },
      { heading: 'How booking works', body: 'Pick an upcoming basketball session, reserve your place, and get a QR-code ticket to check in at the court.' },
      { heading: 'Who it is for', body: 'Regular hoopers and casual players who want a reliable run. Great for professionals and students looking to play midweek or on weekends.' },
      { heading: 'What to bring', body: 'Basketball shoes, a water bottle, and both a light and dark shirt if you can, to make teams easy.' },
    ],
    faqs: [
      { q: 'Can I come alone?', a: 'Yes — most players book solo and teams are sorted on the day.' },
      { q: 'Full court or half court?', a: 'It depends on turnout. Sessions run 5-on-5 when there are enough players, otherwise 3-on-3 half court.' },
      { q: 'What level are the games?', a: 'Casual and social. Sessions welcome a mix of levels; just play your game and have fun.' },
    ],
  },
  volleyball: {
    h1: 'Volleyball Games in Nairobi',
    metaTitle: 'Volleyball Games in Nairobi | Social & Beach Sessions | fitXball',
    metaDesc:
      'Play social volleyball in Nairobi with fitXball. Book indoor and beach-style sessions, see dates and venues, and reserve your slot online.',
    intro:
      'fitXball runs social volleyball sessions around Nairobi for players who want a regular, friendly game. Book your slot, join a balanced side, and play — teams and net are sorted for you.',
    sections: [
      { heading: 'Formats', body: 'Sessions are 6-a-side indoor or smaller-sided sand games, with teams balanced on the day and rotation so everyone gets plenty of touches.' },
      { heading: 'How booking works', body: 'Choose an upcoming volleyball session, reserve your place, and get a QR-code ticket to check in at the venue.' },
      { heading: 'Who it is for', body: 'Social players of all levels — from people who last played at school to regulars. A relaxed way to stay active and meet people in Nairobi.' },
      { heading: 'What to bring', body: 'Comfortable sports shoes (or go barefoot for sand), knee pads if you have them, and water.' },
    ],
    faqs: [
      { q: 'Do I need experience?', a: 'No. Sessions are social and welcoming to beginners — you will pick up the basics quickly.' },
      { q: 'Indoor or beach?', a: 'Both feature depending on the session and venue; each listing tells you which.' },
      { q: 'Can I book with friends?', a: 'Absolutely — book together, and teams are still balanced on the day.' },
    ],
  },
};

const ORDER = ['football', 'padel', 'basketball', 'volleyball'];

export async function generateStaticParams(): Promise<{ sport: string }[]> {
  return ORDER.map((sport) => ({ sport }));
}

export default function SportPage() {
  const { sport } = useLocalSearchParams<{ sport: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const slug = sport && SPORTS[sport] ? sport : 'football';
  const doc = SPORTS[slug];
  const url = `https://www.fitxball.com/sports/${slug}`;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: doc.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      <Head>
        <title>{doc.metaTitle}</title>
        <meta name="description" content={doc.metaDesc} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={doc.metaTitle} />
        <meta property="og:description" content={doc.metaDesc} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content="https://www.fitxball.com/logo.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      </Head>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.kicker}>fitXball · Nairobi</Text>
        <Text style={styles.h1}>{doc.h1}</Text>
        <Text style={styles.intro}>{doc.intro}</Text>

        <TouchableOpacity style={styles.cta} onPress={() => router.push('/(tabs)/book')} activeOpacity={0.85}>
          <Text style={styles.ctaText}>See upcoming sessions</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.background} />
        </TouchableOpacity>

        {doc.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.h2}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}

        <Text style={[styles.h2, { marginTop: 28 }]}>Frequently asked questions</Text>
        {doc.faqs.map((f) => (
          <View key={f.q} style={styles.section}>
            <Text style={styles.faqQ}>{f.q}</Text>
            <Text style={styles.body}>{f.a}</Text>
          </View>
        ))}

        <Text style={[styles.h2, { marginTop: 28 }]}>Other sports in Nairobi</Text>
        <View style={styles.otherRow}>
          {ORDER.filter((s) => s !== slug).map((s) => (
            <Link key={s} href={`/sports/${s}`} asChild>
              <TouchableOpacity style={styles.chip}>
                <Text style={styles.chipText}>{SPORTS[s].h1.replace(' in Nairobi', '')}</Text>
              </TouchableOpacity>
            </Link>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 24, width: '100%', maxWidth: 760, alignSelf: 'center' },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  kicker: { color: Colors.primary, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  h1: { color: Colors.textPrimary, fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginTop: 8 },
  intro: { color: Colors.textSecondary, fontSize: 16, lineHeight: 25, marginTop: 14 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.primary, borderRadius: 28, paddingVertical: 15, marginTop: 24, marginBottom: 8,
  },
  ctaText: { color: Colors.background, fontSize: 15, fontWeight: '800' },
  section: { marginTop: 22 },
  h2: { color: Colors.textPrimary, fontSize: 19, fontWeight: '700', marginBottom: 8 },
  body: { color: Colors.textSecondary, fontSize: 15, lineHeight: 24 },
  faqQ: { color: Colors.textPrimary, fontSize: 15.5, fontWeight: '700', marginBottom: 6 },
  otherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  chip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 999,
    paddingVertical: 10, paddingHorizontal: 16, backgroundColor: Colors.surface,
  },
  chipText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
});
