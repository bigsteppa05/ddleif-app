# Fieldd - Sports Events & Booking App

## Project Overview
Fieldd is a sports lifestyle brand app for Nairobi, Kenya.
Users discover curated sports events, book participation slots,
and access member perks. Built with Expo (React Native) and Supabase.

## Tech Stack
- Frontend: Expo (React Native) — iOS, Android, Web
- Backend: Supabase (auth, database, real-time)
- Language: TypeScript
- Navigation: Expo Router

## Bash Commands
- npm start: Start the Expo development server
- npm run ios: Open iOS simulator
- npm run android: Open Android emulator
- npm run web: Open web version
- npx expo install: Install Expo-compatible packages

## Project Structure
- app/: All screens using Expo Router
- components/: Reusable UI components
- lib/: Supabase client and helpers
- constants/: Colors, fonts, config
- assets/: Images and fonts

## Database Tables
- users: id, name, email, credits, avatar_url, created_at
- events: id, title, sport, description, date, location,
  cost_in_credits, slots_available, slots_booked, image_url, is_free
- bookings: id, user_id, event_id, created_at, status

## Code Style
- Use TypeScript strictly, no any types
- Use functional components with hooks only
- Use Expo Router for all navigation
- Keep components small and single-purpose
- Always handle loading and error states

## UI Rules
- Clean, minimal design
- Fast and responsive, no unnecessary animations
- Mobile first always
- Consistent spacing and typography throughout

## Admin Panel
- Separate section for team to add/edit/delete events
- Only accessible with admin role in Supabase
- Located in app/admin/ folder

## What NOT to do
- Do not use class components
- Do not use React Navigation directly, use Expo Router
- Do not fetch data without loading states
- Do not skip TypeScript types