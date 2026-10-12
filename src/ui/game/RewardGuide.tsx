/** A short, non-blocking introduction; walking dismisses it in RewardRoom. */
import { useEffect, useState } from 'react';

const STEPS = [
  {
    title: 'Gold G · Generic boons',
    text: 'The gold relics above-left offer general upgrades. Approach to read one; stop on it to claim it.',
  },
  {
    title: 'Purple C · Class boons',
    text: 'The purple relics above-right improve your class. Pick one generic boon and one class boon.',
  },
  {
    title: 'Teal S · Optional shop',
    text: 'The teal stalls below you sell extras and rerolls for coins. Approach to see the price; stop on a stall to buy.',
  },
  {
    title: 'Blue ↓ · Next boss',
    text: 'The blue vortex above the relics takes you onward. Your boons and shop are optional; stop in the vortex to descend. List view is always available.',
  },
];

export default function RewardGuide({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step < STEPS.length - 1) setStep(step + 1);
      else onClose();
    }, 6500);
    return () => clearTimeout(timer);
  }, [step, onClose]);
  const info = STEPS[step];
  return (
    <div className="wb-reward-guide" role="region" aria-label="Reward room guide">
      <div aria-live="polite">
        <strong>{info.title}</strong>
        <p>{info.text}</p>
      </div>
      <div className="wb-reward-guide-actions">
        <span>
          {step + 1}/{STEPS.length}
        </span>
        <button type="button" className="wb-btn wb-btn-ghost" onClick={onClose}>
          Skip guide
        </button>
        <button
          type="button"
          className="wb-btn wb-btn-ghost"
          onClick={() => {
            if (step < STEPS.length - 1) setStep(step + 1);
            else onClose();
          }}
        >
          {step < STEPS.length - 1 ? 'Next tip' : 'Done'}
        </button>
      </div>
    </div>
  );
}
