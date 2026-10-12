import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

/** First-visit guidance is per browser tab, independent of input device. */
export function useRoomGuide(room: string) {
  const key = `warband:guide:${room}`;
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(key) !== '1';
    } catch {
      return true;
    }
  });
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const close = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      /* Optional storage. */
    }
  }, [key]);
  const activity = useCallback(() => {
    if (openRef.current) close();
  }, [close]);
  const pointer = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.target instanceof Element && event.target.closest('.wb-touch-controls')) activity();
    },
    [activity],
  );
  return { open, close, activity, pointer, replay: () => setOpen(true) };
}
