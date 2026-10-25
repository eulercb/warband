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
    <section aria-label="Grand selections" className="wb-special-reward">
      <p>
        Four slots per class: two starting skills (including basic attack or grafts), one subclass
        skill, one subclass identity. Only the active class's selection applies.
      </p>
      <label>
        Class{' '}
        <select
          value={classId}
          onChange={(e) => {
            setClass(e.target.value as typeof classId);
            setOffer('');
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
      <p>
        Kit and subclass identities share one slot.
        {classId !== 'rogue' &&
          classId !== 'warlock' &&
          ' Individual subclass-skill grands are not available for this class yet.'}
      </p>
      {credit ? (
        <div>
          <label>
            New grand{' '}
            <select value={pick?.id ?? ''} onChange={(e) => setOffer(e.target.value)}>
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
            onClick={() =>
              setOffer(
                available[(available.findIndex((d) => d.id === offer) + 1) % available.length].id,
              )
            }
          >
            Next grand option
          </button>
          {pick ? (
            <p>
              {unlockEquips
                ? `${pick.desc} · ${describeGrandTransition(classId, context, state, unlockState!, generic)}`
                : `${pick.desc}. Unlocking this keeps your current build unchanged; select an outgoing grand before equipping it.`}
            </p>
          ) : null}
          <button
            type="button"
            className="wb-btn"
            disabled={!pick}
            onClick={() => {
              if (pick) onChange({ classId, id: pick.id, action: 'earn' });
            }}
          >
            Unlock grand
          </button>
          <p>
            One unlock per five-boss clear, alongside subclass progression. If its slots are
            occupied, the new option stays banked until you choose a replacement. Unused unlocks
            expire when the next fight begins.
          </p>
          {!available.length ? (
            <p>No eligible new grand yet. You can proceed without choosing one.</p>
          ) : null}
        </div>
      ) : null}
      <div className="wb-special-cards">
        {selected.bank.map((id) => {
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
            (out) =>
              changeGrand(state, context, { classId, id, action: 'equip', replace: out }) != null,
          );
          return (
            <div key={id} className="wb-upgrade-card">
              <strong>
                {d.icon} {d.name} · {equipped ? 'Equipped' : 'Banked'}
              </strong>
              <p>{d.desc}</p>
              {!eligible ? (
                <p>
                  {grandCategory(id) === 'legacy'
                    ? 'Legacy whole-class option: retained for the content migration; currently inactive.'
                    : 'Requires its matching equipped skill/subclass. Your earned option is retained.'}
                </p>
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
          );
        })}
      </div>
    </section>
  );
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
