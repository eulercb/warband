/** A short, non-blocking introduction; walking dismisses it in RewardRoom. */
import RoomGuide from './RoomGuide';

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

export default function RewardGuide({
  onClose,
  compact = true,
}: {
  onClose: () => void;
  compact?: boolean;
}) {
  return (
    <RoomGuide
      steps={
        compact
          ? STEPS
          : STEPS.map((step, index) => ({
              ...step,
              title: [
                'Gold · Generic boons',
                'Purple · Class boons',
                'Teal · Optional shop',
                'Blue · Next boss',
              ][index],
            }))
      }
      label="Reward room guide"
      className="wb-reward-guide"
      onClose={onClose}
    />
  );
}
