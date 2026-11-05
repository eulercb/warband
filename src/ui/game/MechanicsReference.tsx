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
        Whispered Doom spends a prepared Surge when its special starts. Its first successful direct
        boss interruption cancels that wind-up or channel into ordinary recovery and starts the
        interrupted ability's normal cooldown. The boss then resists Thought Break for 8s across the
        whole party. Damage must connect before the attack resolves; misses spend the prepared cast.
        Idle bosses, adds, immunity and already-created projectiles or hazards are unaffected.
        Native basics preserve Surge. A copied/Forge Thought Break needs no Surge and gains no Surge
        damage or cast-speed bonus; its description identifies the direct carrier, including a basic
        fallback when the random starting special cannot hit directly.
      </p>
      <p>
        Unbroken Champion projects Taunt and Shield Wall's existing blocks into a 120u-wide shield
        60u ahead, turning with aim. Hostile shots crossing it spend one block and ready your melee
        counter, protecting bodies behind it and preventing that shot's contact effects. Bodies or
        cover reached first still intercept first. Body blocks share the same pool; projected blocks
        still cost a charge during i-frames. Beams, ground hazards and enemy movement bypass the
        projection. Downing, class changes and expiry remove it. The visible line and pips show the
        active guard and remaining blocks; stronger-guard precedence applies.
      </p>
      <p>
        Elder Mind opens two consecutive boss reveals from a positive direct hit, without a curse.
        Move 1/2 is followed automatically by 2/2 after the first ends or is interrupted; the second
        uses the boss's actual next decision. Each pending read lasts up to 8s. Hits cannot refresh
        or refill the window. After move two ends, Mind closed blocks all readers of that boss for
        8s. Invalid or expired pending reads also close the window. Loss of the original reader
        prevents an unstarted second reveal. Violet footprints reserve early aim; boss-centered
        rings follow the boss, beams track their victim and hazards form at release. Revealed cues
        last through the actual wind-up/channel. Copied/Forge reads share this contract, with a
        basic fallback for a utility starting special.
      </p>
      <p>
        Infernal Aperture fixes an entrance and exit along your setup aim. Only your shots crossing
        the entrance forward with enough clearance route; the exit keeps setup aim plus authored
        spread. Conduit travel costs the original shot's range and takes distance ÷ speed in time.
        Cover and enemies before entry and after exit still intercept; the intervening space is
        bypassed. Mouths adjust up to 108u to find clear space. A temporary 96u-wide midpoint
        barricade blocks physical shots and hostile approach; allies can walk through it. Enemies
        detour, and blocked routes dissolve the barricade. Area attacks, cones and beams can still
        hit you. If no safe barricade fits, the mouths still open; if no nearby lane fits, the
        follow-up ember remains usable. One fresh press of the owning skill fires an ember from your
        current position toward current aim, without refreshing buffs or cooldown. Holding/autofire
        cannot fire it. An earned Shadow Reprise return takes priority on a shared Forge slot. Gate
        expiry stops new entry; admitted shots finish transit. Downing, death, changing class or
        replacing the owning skill cancels pending transit.
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
