/**
 * Warband — the EPHEMERAL coin shop (item 21).
 *
 * A between-boss stall shown on every interstitial (the reward room and the
 * run-clear screen). You spend coins banked by your performance in the boss you
 * just felled on one-off perks that last only the NEXT fight: passive combat
 * bursts (speed / damage / defence), a healing vial spent with the Item button,
 * a Phoenix charm that auto-revives you once, and — in a hardcore run — a banked
 * Second Chance that lets a wipe restart the boss instead of ending the run.
 *
 * Purely presentational + optimistic: the store deducts coins and mirrors the
 * bought stock immediately, and relays the buy to the host, which validates it
 * against its own coin ledger. Coins reproduce on both sides from the ranked
 * result, so the two never diverge.
 */
import { useStore } from '../state/store';
import { playUiSound } from '../state/session';
import {
  getEphemeral,
  EPHEMERAL_IDS,
  REROLL_CAP,
  type EphemeralId,
} from '../../engine/content/ephemeral';

/** How many of this perk the hero has already banked for the next fight. */
function owned(
  id: EphemeralId,
  stock: ReturnType<typeof useStore.getState>['myEphemeral'],
): number {
  switch (id) {
    case 'speed':
      return stock.speed ? 1 : 0;
    case 'damage':
      return stock.damage ? 1 : 0;
    case 'defense':
      return stock.defense ? 1 : 0;
    case 'potion':
      return stock.potions ?? 0;
    case 'revive':
      return stock.revives ?? 0;
    default:
      return 0; // 'retry' banks host-side; no local stock mirror
  }
}

export default function EphemeralShop() {
  const coins = useStore((s) => s.myCoins);
  const stock = useStore((s) => s.myEphemeral);
  const hardcore = useStore((s) => s.activeHardcore);
  const buy = useStore((s) => s.buyEphemeral);
  // item: reroll — the reroll stall is an ACTION (re-draw the offers), capped per stop.
  const rerollOffers = useStore((s) => s.rerollOffers);
  const rerollCount = useStore((s) => s.rerollCount);

  // Passive perks (speed/damage/defence) are one-and-done for a fight; potions and
  // revives stack. Hardcore-only perks stay hidden outside a hardcore run.
  const ids = EPHEMERAL_IDS.filter((id) => !getEphemeral(id).hardcoreOnly || hardcore);
  const onBuy = (id: EphemeralId): void => {
    const ok = id === 'reroll' ? rerollOffers() : buy(id);
    if (ok) playUiSound('uiConfirm');
    else playUiSound('uiClick');
  };

  return (
    <div className="wb-shop">
      <div className="wb-shop-head">
        <h3 className="wb-upgrades-title wb-shop-title">Ephemeral Stall</h3>
        <span className="wb-shop-coins" title="Coins banked from your boss performance">
          💰 {coins}
        </span>
      </div>
      <p className="wb-shop-sub">
        One-off perks for the next fight only — earn more by ranking high.
      </p>
      <div className="wb-shop-cards">
        {ids.map((id) => {
          const def = getEphemeral(id);
          // item: reroll — its "have" is the rerolls spent this stop, and it's maxed once
          // the per-stop cap is reached (not a next-fight stock, so `owned` returns 0).
          const have = id === 'reroll' ? rerollCount : owned(id, stock);
          // A single-shot passive can't be double-bought; the reroll caps at REROLL_CAP;
          // stackables always can.
          const single = def.kind === 'passive';
          const maxed = id === 'reroll' ? rerollCount >= REROLL_CAP : single && have > 0;
          const afford = coins >= def.cost;
          const disabled = maxed || !afford;
          return (
            <button
              type="button"
              key={id}
              className={`wb-shop-card${maxed ? ' owned' : ''}${!afford && !maxed ? ' unaffordable' : ''}`}
              onClick={() => onBuy(id)}
              disabled={disabled}
              aria-label={`${def.name} — ${def.cost} coins`}
            >
              <span className="wb-shop-icon" aria-hidden="true">
                {def.icon}
              </span>
              <span className="wb-shop-name">
                {def.name}
                {have > 0 ? <span className="wb-shop-have"> ×{have}</span> : null}
              </span>
              <span className="wb-shop-desc">{def.desc}</span>
              <span className="wb-shop-cost">{maxed ? 'Ready' : `💰 ${def.cost}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
