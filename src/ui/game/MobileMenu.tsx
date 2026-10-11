/** Keep the walking space clear on touch devices, with an explicit menu fallback. */
import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function MobileMenu({
  mobile,
  open,
  setOpen,
  label,
  children,
}: {
  mobile: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', escape);
    const toggle = toggleRef.current;
    return () => {
      document.removeEventListener('keydown', escape);
      toggle?.focus();
    };
  }, [open, setOpen]);
  if (!mobile) return children;
  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="wb-btn wb-btn-ghost wb-mobile-menu-toggle"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Close menu' : label}
      </button>
      {open ? (
        <div
          id={dialogId}
          ref={dialogRef}
          className="wb-overlay wb-mobile-menu"
          role="dialog"
          aria-label={label}
        >
          {children}
        </div>
      ) : null}
    </>
  );
}
