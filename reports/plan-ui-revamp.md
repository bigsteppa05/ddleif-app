# fitXball — UI Revamp Plan

## Scope

This plan covers a **pure UI/visual overhaul** of the fitXball app.
The goal is to update how the app looks — colours, typography, spacing, layout, component
appearance — without changing how it works.

---

## Hard Rules

### What is allowed
- Changing `StyleSheet` values (colours, fonts, spacing, radius, shadows)
- Restructuring JSX layout (adding/removing `View` wrappers for layout purposes)
- Replacing UI primitives like `Text`, `View`, `Image`, `TouchableOpacity` with visually
  different equivalents that carry the same props and behaviour
- Adding purely decorative elements (icons, dividers, gradients, illustrations)
- Updating `constants/colors.ts` brand tokens
- Updating `components/` UI components that have no logic (display-only)

### What is NOT allowed
- Touching `supabase.ts`, `socialAuth.ts`, `notifications.ts`, `events.ts` or any file
  in `lib/`
- Changing any `async function` that calls Supabase, an API, or performs auth
- Modifying navigation logic (`router.push`, `router.replace`, `router.back`)
- Altering state management that drives business logic (booking flow, auth flow, OTP flow)
- Changing params passed between screens
- Modifying `_layout.tsx` auth listener logic
- Touching admin screens unless explicitly instructed

---

## If Functionality Must Be Touched

Sometimes a UI change requires restructuring a component that also contains logic
(e.g. extracting a styled sub-component from a screen that owns state).

**Protocol when this happens:**
1. State clearly before making the change: *"This layout change requires moving [X].
   Functionality will be preserved — here is how."*
2. Make the smallest possible structural change
3. Immediately verify the affected user flow still works end-to-end
4. TypeScript must compile with zero errors (`npx tsc --noEmit`) after every file touched
5. If a regression is introduced, fix it in the same response before moving on —
   never leave a broken flow between turns

---

## Risk Areas

These screens contain both UI and tightly coupled logic. Extra care required:

| Screen | Risk |
|--------|------|
| `app/(auth)/register.tsx` | 4-step flow with OTP, profile upsert, session handling |
| `app/(auth)/verify.tsx` | OTP verification tied to auth state |
| `app/(auth)/login.tsx` | Email OTP send → navigate to verify |
| `app/(tabs)/book.tsx` | Booking flow, credit deduction |
| `app/event/[id].tsx` | Book event RPC call |
| `app/booking/ticket.tsx` | QR code, booking ref display |
| `app/admin/scanner.tsx` | Camera + check-in RPC |

For these files: change only `StyleSheet` blocks and visual JSX structure.
Do not touch handler functions, `useEffect` hooks, or state logic.

---

## Process Per Screen

For each screen in scope:
1. Read the current file in full before touching anything
2. Identify which parts are pure UI vs logic
3. Apply visual changes only
4. Run `npx tsc --noEmit` — must be clean
5. Confirm the screen's primary user flow is unaffected

---

## Source Material

Design references and instructions will be provided by the user per screen.
Do not infer design intent beyond what is explicitly specified.
If a reference is ambiguous, ask before implementing.

---

## Definition of Done

A screen is done when:
- [ ] It matches the provided design reference
- [ ] TypeScript compiles clean
- [ ] Its user flow works end-to-end (auth, booking, navigation)
- [ ] No mock data, placeholder text, or dev-only UI remains
- [ ] It is responsive on mobile (375px) and desktop web (1280px+)
