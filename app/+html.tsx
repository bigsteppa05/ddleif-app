import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Root HTML document for the web build (web only — has no effect on native).
 *
 * Expo Router renders every web route inside this shell. With `web.output: "single"`
 * the head below is shared by all routes, so it is written to be correct for the
 * HOMEPAGE and a sane default elsewhere. Per-page titles/descriptions/canonical/
 * SportsEvent JSON-LD come from `expo-router/head`'s <Head> once we move to
 * `web.output: "static"` (see reports task list). Edit URLs/handles marked TODO.
 */

const SITE_URL = 'https://fitxball.com';
const SITE_NAME = 'fitXball';
const DEFAULT_TITLE = 'fitXball | Book Casual Sports Games in Nairobi';
const DEFAULT_DESCRIPTION =
  'Discover and book organised football, padel, basketball and volleyball sessions across Nairobi. Choose a game, reserve your place and show up ready to play.';
const OG_IMAGE = `${SITE_URL}/logo.png`; // TODO: replace with a 1200x630 social banner

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

        <title>{DEFAULT_TITLE}</title>
        <meta name="description" content={DEFAULT_DESCRIPTION} />
        <meta name="theme-color" content="#000000" />

        {/* Open Graph (link previews on WhatsApp, Facebook, Slack, iMessage, …) */}
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={DEFAULT_TITLE} />
        <meta property="og:description" content={DEFAULT_DESCRIPTION} />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:locale" content="en_KE" />

        {/* X / Twitter card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={DEFAULT_TITLE} />
        <meta name="twitter:description" content={DEFAULT_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />

        {/* Structured data: who fitXball is (Phase 6) */}
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
