/** Runs in the page: retain actual rendered evidence even after an effect disappears. */
export function installDefenseCastProbe({ name, label = name, bubble, badge, flags, zone }) {
  window.__defenseCastProbe?.dispose();
  const pattern = badge ? new RegExp(badge, flags) : zone ? /Hastened/ : null;
  const state = { name, cooldown: 0, effect: null, hp: null, titles: [] };
  const sample = () => {
    const tile = [...document.querySelectorAll('.hud-ability')].find((el) =>
      el.getAttribute('aria-label')?.startsWith(`${label} —`),
    );
    const cooldown = Number(tile?.querySelector('.hud-cd-num')?.textContent);
    const self = document.querySelector('.hud-selfhp');
    state.hp = self?.querySelector('.hud-healthbar-num')?.textContent ?? null;
    state.titles = [...(self?.querySelectorAll('[title]') ?? [])].map((el) => el.title);
    if (!(cooldown > 0)) return;
    state.cooldown = cooldown;
    if (bubble) {
      const meter = self?.querySelector('[role="meter"][aria-label="Absorption"]');
      const amount = Number(meter?.getAttribute('aria-valuenow'));
      const max = Number(meter?.getAttribute('aria-valuemax'));
      if (amount > 0 && amount <= max) state.effect ??= { amount, max };
    } else if (pattern) {
      const title = state.titles.find((title) => pattern.test(title));
      if (title) state.effect ??= { title };
    } else state.effect ??= { cast: true };
  };
  const observer = new MutationObserver(sample);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  window.__defenseCastProbe = { state, dispose: () => observer.disconnect() };
}

export async function armDefenseCastProbe(page, test) {
  await page.evaluate(installDefenseCastProbe, {
    name: test.name,
    label: test.label,
    bubble: !!test.bubble,
    badge: test.badge?.source,
    flags: test.badge?.flags,
    zone: !!test.zone,
  });
  return async () => {
    try {
      return await advanceDefenseUntil(page, () => {
        const state = window.__defenseCastProbe.state;
        return state.cooldown > 0 && state.effect ? state : false;
      });
    } catch (error) {
      const state = await page.evaluate(() => window.__defenseCastProbe.state);
      throw new Error(`Defense cast not observed: ${JSON.stringify(state)}`, { cause: error });
    } finally {
      await page.evaluate(() => window.__defenseCastProbe.dispose());
    }
  };
}

/** Advance real RAF/timer-driven gameplay deliberately, keeping setup and reads frozen. */
export async function advanceDefenseUntil(page, predicate, limit = 20000) {
  for (let elapsed = 0; elapsed <= limit; elapsed += 50) {
    const value = await page.evaluate(predicate);
    if (value) return value;
    if (elapsed < limit) await page.clock.runFor(50);
  }
  throw new Error(`Defense condition absent after ${limit}ms of simulation`);
}
