export const Colors = {
  background: '#000000',
  surface: '#1A1A1A',
  surfaceElevated: '#242424',
  border: '#2A2A2A',

  primary: '#C8FF00',
  primaryDim: '#9BBF00',

  textPrimary: '#FFFFFF',
  textSecondary: '#888888',
  textMuted: '#555555',

  error: '#FF4444',
  warning: '#E8C547',

  tabBar: '#000000',
  tabBarActive: '#C8FF00',
  tabBarInactive: '#555555',
} as const;

export type ColorKey = keyof typeof Colors;
