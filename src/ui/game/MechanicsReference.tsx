/** Shared rules live here so reward cards can focus on what their choice changes. */
export default function MechanicsReference() {
  return (
    <details className="wb-mechanics-reference">
      <summary tabIndex={0}>Combat &amp; upgrade rules</summary>
      <p>
        Upgrade cards describe changes to a skill. Effects they do not mention stay in place. “Gains
        +5%” adds to a bonus: 20% becomes 25%. “5% more damage” multiplies damage by 1.05.
      </p>
      <p>
        Haste and upgrades share recharge limits. Nonbasic skills cannot recharge in less than 4s;
        lasting effects usually reserve another 2s of recovery. A listed recharge improvement may
        stop helping once a limit is reached. Basics use their own faster limit.
      </p>
      <p>
        Movement distance and area size are capped to fit the arena. Absorption takes damage before
        health, grows with maximum health, and shares a cap of 50% of the recipient’s maximum
        health. Repeated shields do not all add together. Frontal guard charges do not stack; a
        weaker guard does not replace a stronger one. Flight avoids ground hazards; direct attacks
        can still hit flyers.
      </p>
      <p>
        Each class equips four grands: two for starting skills (including the basic attack and
        grafts), one for a chosen subclass skill, and one identity. Only the active class’s grands
        apply. Earned alternatives stay available for free swaps between fights.
      </p>
      <p>
        Surge empowers one eligible spell: +20% total damage, plus half wind-up when the spell has a
        wind-up. Extra Surge projectiles share that damage rather than each dealing a full
        duplicate. Some spells list an additional Surge effect.
      </p>
      <p>
        Shadow Reprise leaves a departure anchor for up to 6s. A later prepared direct hit
        (including a killing hit) unlocks up to 2s to return. Release and press the owning skill
        again; holding or autofire cannot return you. You must stay within the outbound blink's
        range. Roots, silence, stun, casting and forced movement block returning. The original
        cooldown keeps running; returning grants no cast effects or immunity. Forge's portable
        version accepts any later direct hit and can anchor a nonblink skill at its cast position.
        Its card lists the resulting duration and range. An owning cast's own delayed hits cannot
        unlock its return. Changing class or replacing the skill discards the anchor.
      </p>
      <p>
        Whispers spends one learned secret on a fixed apparition. Normal fear retreats for up to
        1.4s/160u; field fear tries for up to 3s/300u. Slows, roots and cover matter. Taunt or an
        immobile target can reject fear without spending the secret. Committed attacks finish first.
        False quarries redirect the next targeted attack, not an attack already winding up; allies
        standing beside the double can still be hit. Words’ conversion affects one add, never a
        boss.
      </p>
      <p>
        Moon claws can also release a prepared close burst, even though they do not trigger other
        direct-hit rewards.
      </p>
      <p>
        A prepared poison with at least as much damage per second and duration, and more of either,
        keeps its original readiness timer when you cast a weaker coating. Equal coatings and
        short/strong versus long/weak tradeoffs can replace it.
      </p>
    </details>
  );
}
