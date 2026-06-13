// Tiny pub/sub so screens showing the credit balance (sidebar, profile) can
// refresh immediately after a top-up settles, without navigation or polling.
type Listener = () => void;

const listeners = new Set<Listener>();

export function onCreditsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyCreditsChanged(): void {
  listeners.forEach((listener) => listener());
}
