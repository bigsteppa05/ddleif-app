import { Linking, Platform } from 'react-native';

export type MapsApp = 'apple' | 'google' | 'waze';

export type MapsTarget = {
  /** Venue name — used as the search query for Apple Maps & Waze. */
  name: string;
  /** Admin's pasted Google Maps link — opened verbatim for the exact pin. */
  mapsUrl?: string | null;
};

const query = (s: string) => encodeURIComponent(s.trim());

/** Google Maps gets the exact pasted link if we have one, else a name search. */
export function googleMapsUrl(t: MapsTarget): string {
  const link = t.mapsUrl?.trim();
  if (link) return link;
  return `https://www.google.com/maps/search/?api=1&query=${query(t.name)}`;
}

// Apple Maps and Waze can't open a Google link, so they search the venue name
// (the "portable identifier"). Exactness is traded for cross-app reach.
export function appleMapsUrl(t: MapsTarget): string {
  return `http://maps.apple.com/?q=${query(t.name)}`;
}
export function wazeUrl(t: MapsTarget): string {
  return `https://waze.com/ul?q=${query(t.name)}&navigate=yes`;
}

export function urlForApp(app: MapsApp, t: MapsTarget): string {
  switch (app) {
    case 'google':
      return googleMapsUrl(t);
    case 'apple':
      return appleMapsUrl(t);
    case 'waze':
      return wazeUrl(t);
  }
}

export function openInMaps(app: MapsApp, t: MapsTarget): void {
  Linking.openURL(urlForApp(app, t)).catch(() => {});
}

/** Opens Google Maps directly — used on web where there's no app chooser. */
export function openGoogleMaps(t: MapsTarget): void {
  const url = googleMapsUrl(t);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener');
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

/** Apps offered in the chooser, per platform (Apple Maps is iOS-only). */
export const MAPS_APPS: { app: MapsApp; label: string }[] =
  Platform.OS === 'ios'
    ? [
        { app: 'apple', label: 'Apple Maps' },
        { app: 'google', label: 'Google Maps' },
        { app: 'waze', label: 'Waze' },
      ]
    : [
        { app: 'google', label: 'Google Maps' },
        { app: 'waze', label: 'Waze' },
      ];

/** Native shows the app chooser; web just opens Google Maps. */
export const hasMapsChooser = Platform.OS !== 'web';
