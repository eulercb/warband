/**
 * Warband — legend of the current fight's map hazards, shown in the pause menu.
 * Reads the distinct terrain kinds + obstacle presence from the HUD store (set
 * once per fight) and renders a color-swatch + effect description for each, so
 * players can learn what every patch of ground actually does.
 */
import { useHudStore } from '../state/hudStore';
import type { TerrainKind } from '../../engine/core/types';

interface LegendEntry {
  label: string;
  color: string; // CSS hex (mirrors render/entityView TERRAIN_COLORS)
  effect: string;
}

const TERRAIN_LEGEND: Record<TerrainKind, LegendEntry> = {
  magma: {
    label: 'Magma',
    color: '#ff521f',
    effect: 'Burns you and briefly slows — get out fast.',
  },
  ember: {
    label: 'Embers',
    color: '#c9591f',
    effect: 'Radiant heat that slows movement (no damage).',
  },
  swamp: { label: 'Swamp', color: '#6f9a34', effect: 'Heavy slow plus a light poison over time.' },
  bog: { label: 'Bog', color: '#5a7248', effect: 'Thick mud — heavy slow, no damage.' },
  ice: { label: 'Ice', color: '#74b3dc', effect: 'Slippery — strong slow, no damage.' },
  deathfog: { label: 'Death Fog', color: '#a084d6', effect: 'Creeping damage and a mild slow.' },
  tide: {
    label: 'Tide',
    color: '#1f5f9e',
    effect: 'Surging ocean — very heavy slow and slow drowning damage.',
  },
  abyss: {
    label: 'Abyss',
    color: '#7b5cff',
    effect: 'A black chasm — heavy damage; the void drags at your steps.',
  },
};

const OBSTACLE_ENTRY: LegendEntry = {
  label: 'Cover',
  color: '#8a8f9c',
  effect: 'Solid rubble that blocks ranged attacks — hide behind it.',
};

export default function TerrainLegend() {
  const terrainKinds = useHudStore((s) => s.terrainKinds);
  const hasObstacles = useHudStore((s) => s.hasObstacles);

  const entries: LegendEntry[] = terrainKinds
    .map((k) => TERRAIN_LEGEND[k])
    .filter((e): e is LegendEntry => !!e);
  if (hasObstacles) entries.push(OBSTACLE_ENTRY);

  if (entries.length === 0) return null;

  return (
    <div className="wb-legend">
      <h3 className="wb-legend-title">Map legend</h3>
      <ul className="wb-legend-list">
        {entries.map((e) => (
          <li key={e.label} className="wb-legend-row">
            <span className="wb-legend-swatch" style={{ background: e.color }} aria-hidden="true" />
            <span className="wb-legend-name">{e.label}</span>
            <span className="wb-legend-effect">{e.effect}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
