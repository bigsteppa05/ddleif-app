import { getEvents, getEventById, getEventBySlug, type Event as SupabaseEvent } from '@/lib/supabase';
import type { Event as DisplayEvent } from '@/lib/mockData';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatEventDate(iso: string): string {
  if (!iso) return iso;
  // Matches both "2026-05-25" and "2026-05-25T00:00:00+00:00"
  const match = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const d = new Date(year, month - 1, day);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dayNames[d.getDay()]}, ${day} ${monthNames[month - 1]}`;
}

function formatEventTime(time: string): string {
  if (!time) return '';
  const [hourStr, minuteStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  if (isNaN(hour)) return time;
  const minute = minuteStr ?? '00';
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:${minute} ${period}`;
}

export function formatDateTime(date: string, time?: string): string {
  const formattedDate = formatEventDate(date);
  if (!time) return formattedDate;
  const formattedTime = formatEventTime(time);
  if (!formattedTime) return formattedDate;
  return `${formattedDate} · ${formattedTime}`;
}

// A match is "past" once its calendar day is over. Date-only comparison means a
// same-day event stays bookable/upcoming through the whole day it runs. Used by the
// event page, cards, and listings so "passed" means the same thing everywhere.
export function isEventPast(e: { rawDate?: string } | null | undefined): boolean {
  const raw = e?.rawDate;
  if (!raw) return false;
  const today = new Date().toISOString().split('T')[0];
  return raw.split('T')[0] < today;
}

// Orders events for display: upcoming first (soonest → latest), then past events
// as history (most recent → oldest). Keeps past events visible without letting
// them dominate the top of the list.
export function sortEventsForDisplay<T extends { rawDate?: string }>(events: T[]): T[] {
  const dateOf = (e: T) => (e.rawDate ?? '').split('T')[0];
  return [...events].sort((a, b) => {
    const aPast = isEventPast(a);
    const bPast = isEventPast(b);
    if (aPast !== bPast) return aPast ? 1 : -1; // upcoming before past
    const ad = dateOf(a);
    const bd = dateOf(b);
    if (ad === bd) return 0;
    // Upcoming: ascending (soonest first). Past: descending (most recent first).
    return aPast ? (ad < bd ? 1 : -1) : ad < bd ? -1 : 1;
  });
}

export function normalizeEvent(e: SupabaseEvent): DisplayEvent {
  return {
    id: e.id,
    slug: e.slug ?? undefined,
    title: e.title,
    sport: e.sport,
    date: formatEventDate(e.date),
    rawDate: e.date,
    time: e.time ?? '',
    duration: e.duration ?? '',
    location: e.location,
    locationFull: e.location_full ?? e.location,
    // Prefer the explicit columns; fall back to the legacy overloaded location_full
    // (URL → maps link, anything else → details) for rows not yet re-saved.
    locationDetails:
      e.location_details ??
      (e.location_full && !e.location_full.startsWith('http') ? e.location_full : undefined),
    mapsUrl:
      e.maps_url ??
      (e.location_full && e.location_full.startsWith('http') ? e.location_full : undefined),
    cost_in_credits: e.cost_in_credits,
    is_free: e.is_free,
    slots_available: e.slots_available,
    slots_booked: e.slots_booked,
    image_url: e.image_url ?? '',
    description: e.description,
    mode: e.mode ?? '',
  };
}

export async function getDisplayEvents(): Promise<DisplayEvent[]> {
  try {
    const real = await getEvents();
    return real.map(normalizeEvent);
  } catch {
    return [];
  }
}

export async function getDisplayEvent(id: string): Promise<DisplayEvent | null> {
  try {
    const data = await getEventById(id);
    return data ? normalizeEvent(data) : null;
  } catch {
    return null;
  }
}

// Resolves a public event route param that may be a readable slug
// (/event/pilot-football-837f) or a raw UUID (legacy/in-app booking links).
export async function getDisplayEventBySlugOrId(param: string): Promise<DisplayEvent | null> {
  try {
    const data = UUID_RE.test(param) ? await getEventById(param) : await getEventBySlug(param);
    return data ? normalizeEvent(data) : null;
  } catch {
    return null;
  }
}
