export type Event = {
  id: string;
  slug?: string;
  title: string;
  sport: string;
  date: string;
  rawDate?: string;
  time: string;
  duration: string;
  location: string;
  locationFull: string;
  locationDetails?: string;
  mapsUrl?: string;
  cost_in_credits: number;
  is_free: boolean;
  slots_available: number;
  slots_booked: number;
  image_url: string;
  description: string;
  mode: string;
};

export const MOCK_EVENTS: Event[] = [
  {
    id: '1',
    title: '5-a-Side Football',
    sport: 'Football',
    date: 'Sat, 25 May',
    time: '07:00 AM',
    duration: '1h',
    location: 'Karura Forest, Nairobi',
    locationFull: 'Karura Forest Sports Ground, Nairobi',
    cost_in_credits: 20,
    is_free: false,
    slots_available: 10,
    slots_booked: 4,
    image_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80',
    description: 'Join us for an exciting 5-a-side football match at Karura Forest. All skill levels welcome. Bring your own boots and water.',
    mode: 'Match | 5 vs 5',
  },
  {
    id: '2',
    title: 'Morning Padel Session',
    sport: 'Padel',
    date: 'Sun, 26 May',
    time: '08:30 AM',
    duration: '1h 30min',
    location: 'Karen Country Club',
    locationFull: 'Karen Country Club, Karen Road, Nairobi',
    cost_in_credits: 0,
    is_free: true,
    slots_available: 4,
    slots_booked: 2,
    image_url: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80',
    description: 'Beginner-friendly padel session. Rackets provided. Meet at Court 3. This is a great way to get started with padel.',
    mode: 'Match | 2 vs 2',
  },
  {
    id: '3',
    title: 'Basketball Pickup Game',
    sport: 'Basketball',
    date: 'Mon, 27 May',
    time: '06:00 PM',
    duration: '2h',
    location: 'Westlands Sports Centre',
    locationFull: 'Westlands Sports Centre, Westlands, Nairobi',
    cost_in_credits: 15,
    is_free: false,
    slots_available: 8,
    slots_booked: 5,
    image_url: 'https://images.unsplash.com/photo-1546519638405-a9f32d574b39?w=800&q=80',
    description: 'Casual pickup basketball. Full court available. Teams decided on the day. Bring your A-game and good energy.',
    mode: 'Pickup | 5 vs 5',
  },
  {
    id: '4',
    title: 'Rugby Training Session',
    sport: 'Rugby',
    date: 'Tue, 28 May',
    time: '07:30 AM',
    duration: '1h 30min',
    location: 'RFUEA Grounds, Nairobi',
    locationFull: 'RFUEA Grounds, Upper Hill, Nairobi',
    cost_in_credits: 25,
    is_free: false,
    slots_available: 15,
    slots_booked: 8,
    image_url: 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800&q=80',
    description: 'Rugby training for intermediate and advanced players. Drills, scrums and match play. Mouth guards required.',
    mode: 'Training | 15 vs 15',
  },
  {
    id: '5',
    title: 'Padel Doubles Tournament',
    sport: 'Padel',
    date: 'Wed, 29 May',
    time: '09:00 AM',
    duration: '3h',
    location: 'Nairobi Club, Upper Hill',
    locationFull: 'Nairobi Club, Ngong Road, Upper Hill',
    cost_in_credits: 30,
    is_free: false,
    slots_available: 8,
    slots_booked: 6,
    image_url: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80',
    description: 'Competitive padel doubles tournament. Prize for winners. Register as a pair. Minimum 6 pairs needed to run.',
    mode: 'Tournament | 2 vs 2',
  },
  {
    id: '6',
    title: 'Street Football Challenge',
    sport: 'Football',
    date: 'Thu, 30 May',
    time: '05:30 PM',
    duration: '2h',
    location: 'Uhuru Park, Nairobi',
    locationFull: 'Uhuru Park, Central Nairobi',
    cost_in_credits: 0,
    is_free: true,
    slots_available: 20,
    slots_booked: 12,
    image_url: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&q=80',
    description: 'Street football vibes at Uhuru Park. Open to all. Smaller teams, fast play. Come and show your skills.',
    mode: 'Street | 4 vs 4',
  },
];

export const MOCK_PAST_EVENTS: Event[] = [
  {
    id: '7',
    title: 'Evening Run Club',
    sport: 'Running',
    date: 'Mon, 19 May',
    time: '06:00 PM',
    duration: '1h',
    location: 'Nairobi Arboretum',
    locationFull: 'Nairobi Arboretum, State House Road',
    cost_in_credits: 10,
    is_free: false,
    slots_available: 12,
    slots_booked: 12,
    image_url: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800&q=80',
    description: 'A 5km group run through the Arboretum trails.',
    mode: 'Group Run',
  },
  {
    id: '8',
    title: 'Tennis Singles League',
    sport: 'Tennis',
    date: 'Sat, 17 May',
    time: '08:00 AM',
    duration: '2h',
    location: 'Parklands Sports Club',
    locationFull: 'Parklands Sports Club, Ojijo Road',
    cost_in_credits: 20,
    is_free: false,
    slots_available: 8,
    slots_booked: 8,
    image_url: 'https://images.unsplash.com/photo-1530915365347-e35b749a0381?w=800&q=80',
    description: 'Singles tennis league round. Bring your own racket.',
    mode: 'Match | 1 vs 1',
  },
];

export const MOCK_BOOKINGS: Event[] = [MOCK_EVENTS[0], MOCK_EVENTS[1]];

export const MOCK_USER = {
  name: 'Alex Kamau',
  email: 'alex@fieldd.co',
  credits: 120,
};
