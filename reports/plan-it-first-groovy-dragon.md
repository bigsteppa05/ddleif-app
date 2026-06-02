# Plan: Server-Side QR & Reference Code Verification

## Context

The current booking/check-in flow has all verification done client-side:
- Booking references (`FLD-XXXXXX`) are derived at render time from the first 6 chars of the booking UUID — not stored in the database
- The admin scanner uses a loose `ilike('%...%')` query against raw UUIDs, which can match wrong rows
- Check-in is a direct client-side `.update({ status: 'checked_in' })` with no event ownership validation
- A checked-in ticket can be re-scanned indefinitely (no idempotency block)
- The `checked_in_at` timestamp shown in the ref list is actually `created_at` (booking creation time, not check-in time)

The goal: all verification happens in Supabase RPCs. The frontend only calls RPCs and renders results.

---

## Step 1 — Database Schema (SQL, run in Supabase SQL Editor)

```sql
-- Add stored booking_ref and check-in timestamp
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_ref TEXT UNIQUE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- Back-fill existing rows with the same FLD-XXXXXX pattern already shown on-screen
UPDATE public.bookings
SET booking_ref = 'FLD-' || UPPER(SUBSTRING(id::text, 1, 6))
WHERE booking_ref IS NULL;

-- Make NOT NULL now that back-fill is done
ALTER TABLE public.bookings ALTER COLUMN booking_ref SET NOT NULL;

-- Indexes for scanner exact-match and event list queries
CREATE INDEX IF NOT EXISTS idx_bookings_booking_ref   ON public.bookings (booking_ref);
CREATE INDEX IF NOT EXISTS idx_bookings_event_status  ON public.bookings (event_id, status);
```

---

## Step 2 — Updated `book_event` RPC (SQL)

Drop and recreate to return `{ booking_id, booking_ref }` instead of void.
Generates `booking_ref` server-side with a collision-retry loop.

Key changes from current version:
- Returns `JSONB` (was `void`)
- Generates `booking_ref = 'FLD-' || UPPER(SUBSTRING(gen_random_uuid()::text filtered, 1, 6))` in a retry loop with UNIQUE check
- Stores `booking_ref` in the INSERT
- Returns `{ booking_id, booking_ref }` so `event/[id].tsx` needs no follow-up SELECT

---

## Step 3 — New `verify_booking` RPC (SQL)

Read-only. Called by scanner after QR parse to preview booking details before check-in.

Signature: `verify_booking(p_booking_ref TEXT, p_event_id UUID) RETURNS JSONB`

Logic:
- `WHERE booking_ref = p_booking_ref AND event_id = p_event_id` (exact match + event ownership)
- Returns `{ error: 'not_found' }`, `{ error: 'already_checked_in', checked_in_at }`, or full booking details
- No state changes

---

## Step 4 — New `check_in_booking` RPC (SQL)

Atomically validates and marks checked in. Only path that can change status to `checked_in`.

Signature: `check_in_booking(p_booking_ref TEXT, p_event_id UUID) RETURNS JSONB`

Logic:
- `SELECT ... FOR UPDATE WHERE booking_ref = p_booking_ref AND event_id = p_event_id`
- Returns `{ error: 'not_found' }` if no row
- Returns `{ error: 'already_checked_in', checked_in_at }` if already done (idempotency)
- Returns `{ error: 'invalid_status' }` for cancelled rows
- On success: `UPDATE SET status = 'checked_in', checked_in_at = NOW()`
- Returns `{ success: true, booking_id, booking_ref, checked_in_at }`
- `FOR UPDATE` prevents race between two admins scanning simultaneously

Add execute grants:
```sql
GRANT EXECUTE ON FUNCTION public.verify_booking(TEXT, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_booking(TEXT, UUID) TO authenticated;
```

---

## Step 5 — App Changes

### `lib/supabase.ts`
- Add `booking_ref: string` and `checked_in_at: string | null` to `Booking` type
- Add `verifyBooking(bookingRef, eventId)` helper calling the RPC
- Add `checkInBooking(bookingRef, eventId)` helper calling the RPC
- Export typed result unions for both

### `app/event/[id].tsx`
- `book_event` RPC now returns `{ booking_id, booking_ref }` — remove the follow-up SELECT (lines 92–100)
- Read `data.booking_id` directly from RPC response for navigation params

### `app/booking/ticket.tsx`
- Change SELECT to include `booking_ref` column: `.select('booking_ref, events(*)')`
- Use `data.booking_ref` directly — no more `FLD-${id.slice(0,6)}` derivation
- QR value becomes `https://fieldd.app/t/${ticket.bookingRef}` (drop eventId from QR — scanner supplies its own eventId from params)

### `app/admin/scanner.tsx`
- `handleBarCodeScanned`: parse `FLD-([A-Z0-9]{6})` from QR, call `verifyBooking(ref, eventId)` — remove the `ilike` query entirely
- `handleCheckIn`: call `checkInBooking(booking.bookingRef, eventId)` — remove the direct `.update()` call
- Handle `already_checked_in` error with a distinct UI message (not the generic "not recognised" sheet)

### `app/admin/ref-list.tsx`
- `loadList`: add `booking_ref, checked_in_at` to SELECT — remove client-side ref derivation
- `handleCheckIn`: replace `.update()` with `checkInBooking(attendee.bookingRef, eventId)`
- Display `checked_in_at` (accurate timestamp) instead of `created_at`

---

## Verification

1. **Book an event** → confirm `bookings` table shows a `booking_ref` value (not null)
2. **Open ticket screen** → QR displays the stored ref, not a derived one
3. **Admin scanner** → scan the QR → see booking details sheet (verify_booking RPC called)
4. **Check In** → status flips to `checked_in`, `checked_in_at` set to now
5. **Scan same QR again** → "Already checked in" message, not "not recognised"
6. **Ref list** → shows accurate check-in time from `checked_in_at`; manual Check In button calls same RPC and fails gracefully if already done
7. **Wrong event** → scan a ticket from a different event → "not found" (event_id mismatch enforced in RPC)
