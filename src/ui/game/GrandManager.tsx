import { describeGrandTransition } from './grandPreview';
import type { UpgradeId } from '../../engine/content/upgrades';
import { memo, useState } from 'react';
import { CLASSES } from '../../engine/content/classes';
import { CHAR_UPGRADES, canonicalGrandId } from '../../engine/content/charUpgrades';
import {
  changeGrand,
  grandCategory,
  grandEligible,
  grandEarnable,
  normalizeGrandLoadout,
  type GrandContext,
  type GrandLoadout,
  type GrandRequest,
} from '../../engine/content/grandSelections';
import { useStore } from '../state/store';
import { chooseGrand } from '../state/session';

export function GrandManager({
  context,
  value,
  credit,
  onChange,
  generic = [],
}: {
  context: GrandContext;
  value?: GrandLoadout;
  credit: boolean;
  onChange: (request: GrandRequest) => void;
  generic?: readonly UpgradeId[];
}) {
  const [chosenClass, setClass] = useState(context.classes[0]);
  const [offer, setOffer] = useState('');
  const [offerDetails, setOfferDetails] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const classId = context.classes.includes(chosenClass) ? chosenClass : context.classes[0];
  const state = normalizeGrandLoadout(value, context);
  const selected = state.classes[classId]!;
  const available = Object.values(CHAR_UPGRADES).filter(
    (d) =>
      canonicalGrandId(d.id) === d.id &&
      grandEarnable(d.id, classId, context) &&
      !selected.bank.includes(d.id),
  );
  const pick = available.find((d) => d.id === offer);
  const unlockState = pick
    ? changeGrand(state, context, { classId, id: pick.id, action: 'earn' }, true)
    : null;
  const unlockEquips = pick && unlockState?.classes[classId]?.equipped.includes(pick.id);
  return (
    <section aria-label="Grand selections" className="wb-special-reward wb-grand-manager">
      <label>
        Class{' '}
        <select
          value={classId}
          onChange={(e) => {
            setClass(e.target.value as typeof classId);
            setOffer('');
            setOfferDetails(false);
          }}
        >
          {context.classes.map((id) => (
            <option key={id} value={id}>
              {CLASSES[id].name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="wb-btn wb-btn-ghost"
        disabled={context.classes.length < 2}
        onClick={() =>
          setClass(context.classes[(context.classes.indexOf(classId) + 1) % context.classes.length])
        }
      >
        Next class
      </button>
      <p role="status">
        {selected.equipped.length}/4 equipped · {selected.bank.length} earned. Swaps are free
        between fights.
      </p>
      <details className="wb-grand-help">
        <summary tabIndex={0}>Slot rules &amp; earning grands</summary>
        <p>
          Each class has two starting-skill slots, one subclass-skill slot, and one identity slot.
          Kit and subclass identities share the identity slot. Only the active class applies.
        </p>
        <p>
          One unlock per five-boss clear, alongside subclass progression. Full slots keep new
          options banked until you choose a replacement. Unused unlocks expire at the next fight.
        </p>
      </details>
      {credit ? (
        <div className="wb-grand-unlock">
          <label>
            New grand{' '}
            <select
              value={pick?.id ?? ''}
              onChange={(e) => {
                setOffer(e.target.value);
                setOfferDetails(false);
              }}
            >
              <option value="">Choose a new alternative to unlock…</option>
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} (
                  {grandCategory(d.id) === 'base'
                    ? 'Starting skill'
                    : grandCategory(d.id) === 'skill'
                      ? 'Subclass skill'
                      : 'Identity'}
                  )
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="wb-btn wb-btn-ghost"
            disabled={!available.length}
            onClick={() => {
              setOffer(
                available[(available.findIndex((d) => d.id === offer) + 1) % available.length].id,
              );
              setOfferDetails(false);
            }}
          >
            Next grand option
          </button>
          {pick ? (
            <>
              <p className="wb-grand-hint">
                {unlockEquips
                  ? 'Unlocks and equips in a free slot.'
                  : 'Unlocks to bank. Current selections stay equipped.'}
              </p>
              <details
                key={pick.id}
                onToggle={(event) => setOfferDetails(event.currentTarget.open)}
              >
                <summary tabIndex={0}>Selected grand details &amp; preview</summary>
                {offerDetails ? (
                  <p>
                    {pick.desc} ·{' '}
                    {unlockEquips
                      ? describeGrandTransition(classId, context, state, unlockState!, generic)
                      : 'Unlocking this keeps your current build unchanged; select an outgoing grand before equipping it.'}
                  </p>
                ) : null}
              </details>
            </>
          ) : null}
          <button
            type="button"
            className="wb-btn"
            disabled={!pick}
            onClick={pick ? () => onChange({ classId, id: pick.id, action: 'earn' }) : undefined}
          >
            Unlock grand
          </button>
          {!available.length ? (
            <p>No eligible new grand yet. You can proceed without choosing one.</p>
          ) : null}
        </div>
      ) : null}
      <div className="wb-grand-equipped" aria-label="Equipped grand slots">
        {(['base', 'skill', 'identity'] as const).map((category) => {
          const ids = selected.equipped.filter(
            (id) => (grandCategory(id) === 'legacy' ? 'identity' : grandCategory(id)) === category,
          );
          const capacity = category === 'base' ? 2 : 1;
          return (
            <div className="wb-grand-slot-group" key={category}>
              <strong>
                {category === 'base'
                  ? 'Starting skills'
                  : category === 'skill'
                    ? 'Subclass skill'
                    : 'Identity'}{' '}
                · {ids.length}/{capacity}
              </strong>
              {ids.map((id) => renderGrand(id))}
              {ids.length < capacity ? (
                <span className="wb-grand-empty">{capacity - ids.length} empty</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <details
        className="wb-grand-bank"
        onToggle={(event) => setBankOpen(event.currentTarget.open)}
      >
        <summary tabIndex={0}>
          Earned bank · {selected.bank.length} earned ·{' '}
          {selected.bank.length - selected.equipped.length} banked
        </summary>
        {bankOpen ? (
          <div className="wb-grand-bank-rows">
            {selected.bank
              .filter((id) => !selected.equipped.includes(id))
              .map((id) => renderGrand(id))}
            {selected.bank.length === selected.equipped.length ? (
              <p>No unequipped grands. Earned selections stay available after swapping.</p>
            ) : null}
          </div>
        ) : null}
      </details>
    </section>
  );

  function renderGrand(id: string) {
    const d = CHAR_UPGRADES[id],
      equipped = selected.equipped.includes(id);
    const eligible = grandEligible(id, classId, context);
    const direct = changeGrand(state, context, { classId, id, action: 'equip' });
    const replace = replacements[id];
    const request: GrandRequest = {
      classId,
      id,
      action: 'equip',
      ...(replace ? { replace } : {}),
    };
    const proposed = changeGrand(state, context, request);
    const canEquip = proposed != null;
    const candidates = selected.equipped.filter(
      (out) => changeGrand(state, context, { classId, id, action: 'equip', replace: out }) != null,
    );
    return (
      <details
        key={id}
        className="wb-grand-row"
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setExpanded((current) => (current[id] === open ? current : { ...current, [id]: open }));
        }}
      >
        <summary tabIndex={0}>
          {d.icon} {d.name} · {equipped ? 'Equipped' : 'Banked'}
        </summary>
        {expanded[id] ? (
          <div className="wb-grand-row-detail">
            <p>{d.desc}</p>
            {!eligible ? (
              <p>Requires its matching equipped skill/subclass. Your earned option is retained.</p>
            ) : equipped ? (
              <button
                type="button"
                className="wb-btn wb-btn-ghost"
                onClick={() => onChange({ classId, id, action: 'unequip' })}
              >
                Unequip {d.name}
              </button>
            ) : (
              <>
                {!direct ? (
                  <label>
                    Replace{' '}
                    <select
                      aria-label={`Replace grand for ${d.name}`}
                      value={replace ?? ''}
                      onChange={(e) => setReplacements({ ...replacements, [id]: e.target.value })}
                    >
                      <option value="">Choose outgoing grand…</option>
                      {candidates.map((out) => (
                        <option key={out} value={out}>
                          {CHAR_UPGRADES[out].name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {!direct && candidates.length ? (
                  <button
                    type="button"
                    className="wb-btn wb-btn-ghost"
                    onClick={() =>
                      setReplacements({
                        ...replacements,
                        [id]: candidates[
                          (candidates.indexOf(replace ?? '') + 1) % candidates.length
                        ],
                      })
                    }
                  >
                    Next outgoing grand for {d.name}
                  </button>
                ) : null}
                {replace && proposed ? (
                  <p aria-label={`Replacement preview for ${d.name}`}>
                    After replacing {CHAR_UPGRADES[replace].name}:{' '}
                    {describeGrandTransition(classId, context, state, proposed, generic)}
                  </p>
                ) : null}
                {replace && candidates.includes(replace) ? (
                  <p>
                    Remove {CHAR_UPGRADES[replace].name}; equip {d.name}.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="wb-btn"
                  disabled={!canEquip}
                  onClick={() => onChange(request)}
                >
                  Equip {d.name}
                </button>
              </>
            )}
          </div>
        ) : null}
      </details>
    );
  }
}

function GrandPanel({ open = false }: { open?: boolean } = {}) {
  const primary = useStore((s) => s.activeDraftedClass ?? s.localClass);
  const extra = useStore((s) => s.myExtraClasses);
  const history = useStore((s) => s.myCharUpgrades);
  const generic = useStore((s) => s.myUpgrades);
  const subSkills = useStore((s) => s.mySubSkills);
  const value = useStore((s) => s.myGrandLoadout);
  const credit = useStore((s) => s.grandCredit);
  return (
    <details className="wb-grand-panel" open={open || undefined}>
      <summary tabIndex={0}>{credit ? '★ Grand reward available' : '★ Grand selections'}</summary>
      <GrandManager
        context={{ classes: [primary, ...extra], history, subSkills }}
        value={value}
        credit={credit}
        generic={generic}
        onChange={(request) => chooseGrand(request)}
      />
    </details>
  );
}

export default memo(GrandPanel);
