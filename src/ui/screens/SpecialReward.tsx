/** Subclass/second-skill/class progression at gauntlet clears.
 * Grand unlocks are independent and managed by GrandPanel; keeping the current
 * classes never consumes or blocks that reward.
 */
import { useState } from 'react';
import { useStore } from '../state/store';
import { chooseSubSkill, chooseExtraClass, playUiSound } from '../state/session';
import {
  subclassesFor,
  getSubclass,
  specialRewardStep,
  type SubclassDef,
} from '../../engine/content/subclasses';
import { CLASSES, CLASS_IDS } from '../../engine/content/classes';
import { hashStr } from '../../engine/content/procgen';
import { Rng, mixSeed, shuffled } from '../../engine/core/math';
import type { ClassId } from '../../engine/core/types';

export default function SpecialReward() {
  // Effective class: the Chaos-Draft class in a randomized run (item 10), else the
  // pick — so the subclass/multiclass/grand flow resolves against the drafted kit.
  const localClass = useStore((s) => s.activeDraftedClass ?? s.localClass);
  const mySubSkills = useStore((s) => s.mySubSkills);
  const myExtraClasses = useStore((s) => s.myExtraClasses);
  const cycle = useStore((s) => s.cycle);
  const runSeed = useStore((s) => s.activeRunSeed);

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
                {sub.passive && (
                  <span className="wb-upgrade-desc">
                    {sub.passive.icon} Passive · {sub.passive.name}: {sub.passive.desc}
                  </span>
                )}
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

  // Once owned subclasses are complete, offer another class or a non-blocking skip.
  const ownedClasses = new Set<ClassId>([localClass, ...myExtraClasses]);
  const drawSeed = runSeed ?? 0;
  const progress = myExtraClasses.length + mySubSkills.length + cycle;
  const classPool = CLASS_IDS.filter((c) => !ownedClasses.has(c));
  const classOptions = shuffled(
    new Rng(mixSeed(drawSeed, hashStr(localClass), progress, 0x0c1a)),
    classPool,
  ).slice(0, 4);
  return (
    <div className="wb-special-reward" role="group" aria-label="Add another class">
      <span className="wb-special-title">✦ Add a class — grand rewards are separate</span>
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
        <button
          type="button"
          className="wb-btn wb-btn-ghost"
          onClick={() => setPicked('Class expansion skipped')}
        >
          Keep current classes
        </button>
      </div>
    </div>
  );
}
