import { getEvents, getEventById, type Event as SupabaseEvent } from '@/lib/supabase';
import type { Event as DisplayEvent } from '@/lib/mockData';

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

export function normalizeEvent(e: SupabaseEvent): DisplayEvent {
  return {
    id: e.id,
    title: e.title,
    sport: e.sport,
    date: formatEventDate(e.date),
    rawDate: e.date,
    time: e.time ?? '',
    duration: e.duration ?? '',
    location: e.location,
    locationFull: e.location_full ?? e.location,
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
