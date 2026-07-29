import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "Reduce Motion" accessibility setting (iOS: Settings →
 * Accessibility → Motion; Android: Remove animations).
 *
 * When enabled, motion code should drop position/scale changes and parallax —
 * the vestibular-trigger movement — while keeping opacity/colour transitions that
 * aid comprehension (per Apple's reduced-motion guidance). Updates live if the
 * user toggles the setting while the app is open.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
