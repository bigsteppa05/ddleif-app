import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Root HTML document for the web build (web only — has no effect on native).
 *
 * IMPORTANT: keep this shell limited to TRULY GLOBAL head tags. Per-page tags
 * (title, description, canonical, Open Graph) live in each route's
 * `expo-router/head` <Head>. react-helmet-async cannot dedupe against static
 * tags placed here, so anything page-specific in this file would render twice
 * (two <title>s, etc.). The homepage's own tags are in app/index.tsx.
 */

const SITE_URL = 'https://fitxball.com';
const SITE_NAME = 'fitXball';
const DEFAULT_DESCRIPTION =
  'Discover and book organised football, padel, basketball and volleyball sessions across Nairobi. Choose a game, reserve your place and show up ready to play.';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description: DEFAULT_DESCRIPTION,
  areaServed: { '@type': 'City', name: 'Nairobi', address: { '@type': 'PostalAddress', addressCountry: 'KE' } },
  sameAs: [
    // TODO: replace with the real handles once confirmed
    'https://www.instagram.com/fitxball',
    'https://www.tiktok.com/@fitxball',
  ],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
};

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        <meta name="theme-color" content="#000000" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:locale" content="en_KE" />

        {/* Structured data: who fitXball is (Phase 6) — global, no route sets these */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />

        {/*
          Disable body scrolling on web so ScrollView components work as expected.
          Required by Expo Router — keep this before any custom styles.
        */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
