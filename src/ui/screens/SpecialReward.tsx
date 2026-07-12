/**
 * Warband — the run-clear SPECIAL reward (items 13, 14, 15, 19, 22).
 *
 * Shown on the victory screen when a full gauntlet is cleared. It grants a one-off
 * progression pick whose KIND follows the correct ordering (item 15), computed by
 * `specialRewardStep` over the hero's owned classes + subclass skills:
 *   - a class missing a subclass  → choose a SUBCLASS for it, then one of its SKILLS;
 *   - a class with one skill      → choose a SECOND skill of that same subclass;
 *   - every owned class complete  → choose a new CLASS (multiclass) OR a GRAND
 *     improvement — and picking a class re-enters the subclass flow for it next
 *     time, while a grand loops the class-or-grand choice.
 * Grands are only ever offered for classes the hero actually fields (item 19).
 * Picks relay to the host (chooseSubSkill / chooseExtraClass / chooseCharUpgrade)
 * and mirror into the local store, exactly like the between-boss boons.
 */
import { useState } from 'react';
import { useStore } from '../state/store';
import { chooseSubSkill, chooseExtraClass, chooseCharUpgrade, playUiSound } from '../state/session';
import {
  subclassesFor,
  getSubclass,
  specialRewardStep,
  type SubclassDef,
} from '../../engine/content/subclasses';
import { CLASSES, CLASS_IDS } from '../../engine/content/classes';
import { GRAND_BY_CLASS, charUpgradeAtMax } from '../../engine/content/charUpgrades';
import type { ClassId } from '../../engine/core/types';

export default function SpecialReward() {
  const localClass = useStore((s) => s.localClass);
  const mySubSkills = useStore((s) => s.mySubSkills);
  const myExtraClasses = useStore((s) => s.myExtraClasses);
  const myCharUpgrades = useStore((s) => s.myCharUpgrades);

  const [pendingSub, setPendingSub] = useState<SubclassDef | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const step = specialRewardStep(localClass, myExtraClasses, mySubSkills);

  const pickSkill = (subclassId: string, skillId: string, label: string): void => {
    playUiSound('uiConfirm');
    chooseSubSkill(subclassId, skillId);
    setPicked(label);
  };
  const pickClass = (classId: ClassId): void => {
    playUiSound('uiConfirm');
    chooseExtraClass(classId);
    setPicked(CLASSES[classId].name);
  };
  const pickGrand = (id: string, label: string): void => {
    playUiSound('uiConfirm');
    chooseCharUpgrade(id);
    setPicked(label);
  };

  if (picked) {
    return (
      <div className="wb-special-reward chosen" role="status">
        <span className="wb-special-title">✦ Special reward claimed: {picked}</span>
      </div>
    );
  }

  // --- Choose a subclass for a class, then its first skill ------------------
  if (step.kind === 'subclass') {
    const forClass = step.classId;
    const suffix = forClass === localClass ? '' : ` (${CLASSES[forClass].name})`;
    if (!pendingSub) {
      const subs = subclassesFor(forClass);
      return (
        <div className="wb-special-reward" role="group" aria-label="Choose a subclass">
          <span className="wb-special-title">✦ Choose a subclass{suffix} (5-boss reward)</span>
          <div className="wb-special-cards">
            {subs.map((sub) => (
              <button
                key={sub.id}
                type="button"
                className="wb-upgrade-card wb-special-card"
                onClick={() => {
                  playUiSound('uiClick');
                  setPendingSub(sub);
                }}
              >
                <span className="wb-upgrade-name">{sub.name}</span>
                <span className="wb-upgrade-desc">{sub.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="wb-special-reward" role="group" aria-label="Choose a subclass skill">
        <span className="wb-special-title">✦ {pendingSub.name}: pick a skill</span>
        <div className="wb-special-cards">
          {pendingSub.skills.map((sk) => (
            <button
              key={sk.id}
              type="button"
              className="wb-upgrade-card wb-upgrade-char wb-special-card"
              onClick={() => pickSkill(pendingSub.id, sk.id, sk.name)}
            >
              <span className="wb-upgrade-name">
                {sk.icon} {sk.name}
              </span>
              <span className="wb-upgrade-desc">{sk.desc}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- A second skill of the same subclass ---------------------------------
  if (step.kind === 'skill2') {
    const sub = getSubclass(step.subclassId);
    const remaining = sub?.skills.filter((s) => !mySubSkills.includes(s.id)) ?? [];
    const suffix = step.classId === localClass ? '' : ` (${CLASSES[step.classId].name})`;
    return (
      <div className="wb-special-reward" role="group" aria-label="Choose a second subclass skill">
        <span className="wb-special-title">
          ✦ {sub?.name}: pick a second skill{suffix}
        </span>
        <div className="wb-special-cards">
          {remaining.map((sk) => (
            <button
              key={sk.id}
              type="button"
              className="wb-upgrade-card wb-upgrade-char wb-special-card"
              onClick={() => pickSkill(step.subclassId, sk.id, sk.name)}
            >
              <span className="wb-upgrade-name">
                {sk.icon} {sk.name}
              </span>
              <span className="wb-upgrade-desc">{sk.desc}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- Every owned class complete: multiclass OR a grand improvement --------
  const ownedClasses = new Set<ClassId>([localClass, ...myExtraClasses]);
  const classOptions = CLASS_IDS.filter((c) => !ownedClasses.has(c)).slice(0, 4);
  // Grands are only ever offered for classes the hero actually fields (item 19).
  const grands = [...ownedClasses]
    .flatMap((c) => GRAND_BY_CLASS[c] ?? [])
    .filter((g) => !charUpgradeAtMax(g.id, myCharUpgrades));
  return (
    <div className="wb-special-reward" role="group" aria-label="Add a class or a grand improvement">
      <span className="wb-special-title">✦ Add a class — or take a Grand improvement instead</span>
      <div className="wb-special-cards">
        {classOptions.map((c) => (
          <button
            key={c}
            type="button"
            className="wb-upgrade-card wb-special-card"
            onClick={() => pickClass(c)}
          >
            <span className="wb-upgrade-name">+ {CLASSES[c].name}</span>
            <span className="wb-upgrade-desc">{CLASSES[c].role} — swap to it in the fight</span>
          </button>
        ))}
        {grands.slice(0, 3).map((g) => (
          <button
            key={g.id}
            type="button"
            className="wb-upgrade-card wb-upgrade-char wb-special-card"
            onClick={() => pickGrand(g.id, g.name)}
          >
            <span className="wb-upgrade-name">
              ★ {g.icon} {g.name}
            </span>
            <span className="wb-upgrade-desc">GRAND — {g.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
