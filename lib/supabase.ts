import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL ?? '';

const webStorageAdapter = {
  getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key: string, value: string) => { localStorage.setItem(key, value); return Promise.resolve(); },
  removeItem: (key: string) => { localStorage.removeItem(key); return Promise.resolve(); },
};

const nativeStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? webStorageAdapter : nativeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export type Profile = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  credits: number;
  avatar_url: string | null;
  is_admin: boolean;
  gender: string | null;
  country: string | null;
  date_of_birth: string | null;
  favourite_club: string | null;
  height: string | null;
  weight: string | null;
  phone: string | null;
  sms_marketing_consent: boolean;
  visibility: string | null;
  notifications_enabled: boolean | null;
  deactivated_at: string | null;
  created_at: string;
};

export type Event = {
  id: string;
  title: string;
  sport: string;
  description: string;
  date: string;
  time: string;
  duration: string;
  location: string;
  location_full: string;
  location_details: string | null;
  maps_url: string | null;
  mode: string;
  cost_in_credits: number;
  slots_available: number;
  slots_booked: number;
  image_url: string | null;
  is_free: boolean;
  created_at: string;
};

export type Booking = {
  id: string;
  user_id: string;
  event_id: string;
  booking_ref: string;
  created_at: string;
  status: string;
  checked_in_at: string | null;
};

// ── RPC result types ──────────────────────────────────────────────────────────

export type VerifyBookingResult =
  | { error: 'not_found' | 'invalid_status'; status?: string }
  | { error: 'already_checked_in'; checked_in_at: string }
  | {
      booking_id: string;
      booking_ref: string;
      user_name: string;
      user_username: string;
      event_title: string;
      event_date: string;
      event_time: string;
      cost_in_credits: number;
      status: string;
    };

export type CheckInResult =
  | { error: 'not_found' | 'invalid_status' | 'unauthorized'; status?: string }
  | { error: 'already_checked_in'; checked_in_at: string }
  | { success: true; booking_id: string; booking_ref: string; checked_in_at: string };

export async function verifyBooking(
  bookingRef: string,
  eventId: string
): Promise<VerifyBookingResult> {
  const { data, error } = await supabase.rpc('verify_booking', {
    p_booking_ref: bookingRef,
    p_event_id: eventId,
  });
  if (error) throw error;
  return data as VerifyBookingResult;
}

export async function checkInBooking(
  bookingRef: string,
  eventId: string
): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('check_in_booking', {
    p_booking_ref: bookingRef,
    p_event_id: eventId,
  });
  if (error) throw error;
  return data as CheckInResult;
}

export async function getEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEventById(id: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function getUserProfile(userId?: string): Promise<Profile | null> {
  let uid = userId;
  if (!uid) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;
    uid = user.id;
  }

  // maybeSingle returns null data (no error) when 0 rows — avoids misreading
  // an RLS-blocked SELECT as "row doesn't exist" the way .single() + PGRST116 does.
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();

  if (error) return null;

  if (data) {
    // Silently promote hardcoded admin email if flag not yet set in DB
    if (data.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() && !data.is_admin) {
      await supabase.from('profiles').update({ is_admin: true }).eq('id', uid);
      return { ...data, is_admin: true };
    }
    return data;
  }

  // No row found — create one
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: uid,
      name: user?.user_metadata?.name ?? '',
      email: user?.email ?? '',
      credits: 0,
      is_admin: isAdmin,
    })
    .select('*')
    .maybeSingle();

  if (insertError?.code === '23505') {
    // Row was created between our read and insert (race / RLS timing) — re-read it
    const { data: retry } = await supabase
      .from('profiles').select('*').eq('id', uid).maybeSingle();
    return retry ?? null;
  }
  if (insertError) return null;
  return created;
}


export type BookingWithEvent = {
  id: string;
  user_id: string;
  event_id: string;
  booking_ref: string;
  created_at: string;
  status: string;
  checked_in_at: string | null;
  events: Event | null;
};

export async function getUserBookings(userId: string): Promise<BookingWithEvent[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, events(*)')
    .eq('user_id', userId)
    .in('status', ['confirmed', 'checked_in'])
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as BookingWithEvent[];
}

export async function getUserBookingHistory(userId: string): Promise<BookingWithEvent[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, events(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as BookingWithEvent[];
}

export type Payment = {
  id: string;
  user_id: string;
  phone: string;
  amount_kes: number;
  credits: number;
  status: string;
  mpesa_receipt: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function getUserPayments(userId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, user_id, phone, amount_kes, credits, status, mpesa_receipt, created_at, completed_at')
    .eq('user_id', userId)
    .eq('status', 'success')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as Payment[];
}

// Returns the active booking's id for this user+event, or null if none.
// Callers use the id to deep-link to the entry ticket; a falsy result means "not booked".
export async function checkExistingBooking(userId: string, eventId: string): Promise<string | null> {
  const { data } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .in('status', ['confirmed', 'checked_in'])
    .maybeSingle();
  return data?.id ?? null;
}

// Cancels the user's own confirmed booking. Server enforces ownership + the 12h
// refund policy; returns how many credits were actually refunded (0 within 12h).
export async function cancelBooking(
  bookingId: string,
  userId: string
): Promise<{ refunded_credits: number }> {
  const { data, error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_user_id: userId,
  });
  if (error) throw error;
  return (data ?? { refunded_credits: 0 }) as { refunded_credits: number };
}

export type EventParticipant = {
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_private: boolean;
  is_self: boolean;
};

// Participants of an event. Server honors profiles.visibility — private users come
// back anonymized (null name/avatar, is_private=true) but are still included in the list.
export async function getEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await supabase.rpc('get_event_participants', {
    p_event_id: eventId,
  });
  if (error) return [];
  return (data ?? []) as EventParticipant[];
}

export async function checkIsAdmin(): Promise<boolean> {
  const { data } = await supabase.rpc('check_is_admin');
  return data === true;
}

export async function grantCredits(userId: string, delta: number): Promise<void> {
  const { data } = await supabase.from('profiles').select('credits').eq('id', userId).single();
  const newCredits = (data?.credits ?? 0) + delta;
  const { error } = await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId);
  if (error) throw error;
}

export async function updateProfile(
  userId: string,
  data: Partial<Omit<Profile, 'id' | 'created_at' | 'is_admin'>>
): Promise<void> {
  // The row always exists (created at signup) — UPDATE only needs the update
  // policy, and a real Error surfaces the actual Postgres message to the UI.
  const { error } = await supabase
    .from('profiles')
    .update(data)
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

// Throws on failure so callers can surface the error; files live under
// event-images/{eventId}/ so replaced images can be traced and cleaned up.
export async function uploadEventImage(uri: string, eventId?: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  // Prefer the blob's real MIME type — web blob: URLs carry no file extension
  const MIME_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  let ext = MIME_EXT[blob.type];
  if (!ext) {
    const raw = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
    ext = ['jpg', 'jpeg', 'png', 'webp'].includes(raw) ? raw : 'jpg';
  }
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  // Unique path (timestamp) → no conflict → upsert:false. The storage-api upsert
  // path is rejected by RLS; plain insert to a fresh path is the reliable route.
  const path = `${eventId ?? 'misc'}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('event-images')
    .upload(path, blob, { contentType: mimeType, upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('event-images').getPublicUrl(path);
  return data.publicUrl;
}

// Best-effort removal of a previously uploaded event image by its public URL.
export async function deleteEventImage(publicUrl: string): Promise<void> {
  const marker = '/event-images/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0]);
  try {
    await supabase.storage.from('event-images').remove([path]);
  } catch {
    // orphan cleanup is non-critical — never block the save on it
  }
}

// Throws on failure so callers can surface the error.
export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const MIME_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  let ext = MIME_EXT[blob.type];
  if (!ext) {
    const raw = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
    ext = ['jpg', 'jpeg', 'png', 'webp'].includes(raw) ? raw : 'jpg';
  }
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  // Foldered, unique path → upsert:false works; old avatars are cleaned up after.
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { contentType: mimeType, upsert: false });
  if (error) throw new Error(error.message);
  // Remove the user's older avatar files (best-effort)
  supabase.storage.from('avatars').list(userId).then(({ data: files }) => {
    const stale = (files ?? [])
      .map((f) => `${userId}/${f.name}`)
      .filter((p) => p !== path);
    if (stale.length) supabase.storage.from('avatars').remove(stale);
  });
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
