import { useEffect } from 'react';

/**
 * Calls handler when the user clicks outside of the element attached to ref.
 * Only active while `enabled` is true (typically when a dropdown is open).
 */
export function useClickOutside(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const onPointerDown = (event) => {
      const element = ref.current;
      if (!element || element.contains(event.target)) return;
      handler(event);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [ref, handler, enabled]);
}
