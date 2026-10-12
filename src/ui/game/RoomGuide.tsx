import { useEffect, useState } from 'react';
import type { GuideStep } from './roomGuides';

export default function RoomGuide({
  onClose,
  steps,
  label,
  className = '',
}: {
  onClose: () => void;
  steps: readonly GuideStep[];
  label: string;
  className?: string;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step < steps.length - 1) setStep(step + 1);
      else onClose();
    }, 6500);
    return () => clearTimeout(timer);
  }, [step, onClose, steps.length]);
  const info = steps[step];
  return (
    <div className={`wb-room-guide ${className}`} role="region" aria-label={label}>
      <div key={step} className="wb-room-guide-tip" aria-live="polite">
        <strong>{info.title}</strong>
        <p>{info.text}</p>
      </div>
      <div className="wb-reward-guide-actions">
        <span>
          {step + 1}/{steps.length}
        </span>
        <button type="button" className="wb-btn wb-btn-ghost" onClick={onClose}>
          Skip guide
        </button>
        <button
          type="button"
          className="wb-btn wb-btn-ghost"
          onClick={() => {
            if (step < steps.length - 1) setStep(step + 1);
            else onClose();
          }}
        >
          {step < steps.length - 1 ? 'Next tip' : 'Done'}
        </button>
      </div>
    </div>
  );
}
