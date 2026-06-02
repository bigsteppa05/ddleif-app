import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL ?? '';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
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

export async function bookEvent(userId: string, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .insert({ user_id: userId, event_id: eventId, status: 'confirmed' });
  if (error) throw error;
}

export async function updateCredits(userId: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc('update_credits', { user_id: userId, delta: amount });
  if (error) throw error;
}

export type BookingWithEvent = {
  id: string;
  user_id: string;
  event_id: string;
  created_at: string;
  status: string;
  events: Event | null;
};

export async function getUserBookings(userId: string): Promise<BookingWithEvent[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, events(*)')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
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

export async function checkExistingBooking(userId: string, eventId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .maybeSingle();
  return data !== null;
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
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...data }, { onConflict: 'id' });
  if (error) throw error;
}

export async function uploadEventImage(uri: string): Promise<string | null> {
  try {
    const raw = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
    const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(raw) ? raw : 'jpg';
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    const path = `${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from('event-images')
      .upload(path, blob, { contentType: mimeType, upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('event-images').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}

export async function uploadAvatar(userId: string, uri: string): Promise<string | null> {
  try {
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}
