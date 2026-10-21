import { useEffect } from 'react';

export function useClickOutside(ref, onOutside, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && onOutside();
    const onKey = (e) => e.key === 'Escape' && onOutside();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onOutside, enabled]);
}
