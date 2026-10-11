import { useState, useSyncExternalStore } from 'react';

const QUERY = '(pointer: coarse)';
const mobileSnapshot = () => window.matchMedia?.(QUERY).matches ?? false;
const subscribe = (notify: () => void) => {
  const media = window.matchMedia?.(QUERY);
  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
};

export function useMobileMenu() {
  const mobile = useSyncExternalStore(subscribe, mobileSnapshot, () => false);
  const [expanded, setExpanded] = useState(false);
  return { mobile, open: mobile && expanded, setOpen: setExpanded };
}
