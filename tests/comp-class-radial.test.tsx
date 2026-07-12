// @vitest-environment jsdom
/**
 * Component tests for src/ui/game/ClassRadial.tsx — the hold-to-open multiclass
 * wheel. It is purely presentational and reads the `radialStore` GameView pushes
 * into, so we drive it by setting store state and assert the rendered nodes,
 * highlights and centre readout.
 *
 * `@testing-library/jest-dom` is NOT installed, so assertions use `.textContent`,
 * `.classList`, `querySelector` and `toBeNull()/toBeTruthy()`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ClassRadial from '../src/ui/game/ClassRadial';
import { useRadialStore } from '../src/ui/state/radialStore';

function setRadial(patch: Partial<ReturnType<typeof useRadialStore.getState>>): void {
  useRadialStore.setState(patch);
}

afterEach(() => {
  cleanup();
  useRadialStore.setState({
    open: false,
    options: [],
    activeClassId: null,
    hover: -1,
    ready: true,
  });
});

describe('<ClassRadial>', () => {
  it('renders nothing while closed', () => {
    setRadial({ open: false, options: ['knight', 'mage'] });
    const { container } = render(<ClassRadial />);
    expect(container.querySelector('.wb-radial')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when open but with no owned classes', () => {
    setRadial({ open: true, options: [] });
    const { container } = render(<ClassRadial />);
    expect(container.querySelector('.wb-radial')).toBeNull();
  });

  it('draws one node per owned class and marks the active one', () => {
    setRadial({
      open: true,
      options: ['knight', 'mage', 'cleric'],
      activeClassId: 'mage',
      hover: -1,
    });
    const { container } = render(<ClassRadial />);
    const nodes = container.querySelectorAll('.wb-radial-node');
    expect(nodes).toHaveLength(3);
    expect(nodes[0].textContent).toBe('Knight');
    expect(nodes[1].textContent).toBe('Mage');
    expect(nodes[2].textContent).toBe('Cleric');
    // The active class is flagged; none is hovered yet.
    expect(nodes[1].classList.contains('active')).toBe(true);
    expect(container.querySelector('.wb-radial-node.hover')).toBeNull();
    // A class colour is applied to the node border (Knight = #4a90d9).
    expect((nodes[0] as HTMLElement).style.borderColor).toBeTruthy();
  });

  it('lights the hovered node and shows its class in the centre', () => {
    setRadial({ open: true, options: ['knight', 'mage'], activeClassId: 'knight', hover: 1 });
    const { container } = render(<ClassRadial />);
    const nodes = container.querySelectorAll('.wb-radial-node');
    expect(nodes[1].classList.contains('hover')).toBe(true);
    expect(nodes[1].getAttribute('aria-current')).toBe('true');
    expect(container.querySelector('.wb-radial-center')?.textContent).toBe('Mage');
  });

  it('shows a cancel hint when centred (no hover) and ready', () => {
    setRadial({
      open: true,
      options: ['knight', 'mage'],
      activeClassId: 'knight',
      hover: -1,
      ready: true,
    });
    const { container } = render(<ClassRadial />);
    expect(container.querySelector('.wb-radial-center')?.textContent).toBe('Release to cancel');
    expect(container.querySelector('.wb-radial-wheel.recharging')).toBeNull();
  });

  it('shows a recharging hint + dims the wheel while the swap gate is up', () => {
    setRadial({
      open: true,
      options: ['knight', 'mage'],
      activeClassId: 'knight',
      hover: -1,
      ready: false,
    });
    const { container } = render(<ClassRadial />);
    expect(container.querySelector('.wb-radial-center')?.textContent).toBe('Swap recharging…');
    expect(container.querySelector('.wb-radial-wheel.recharging')).toBeTruthy();
  });

  it('ignores an out-of-range hover index (treats it as no selection)', () => {
    setRadial({
      open: true,
      options: ['knight', 'mage'],
      activeClassId: 'knight',
      hover: 5,
      ready: true,
    });
    const { container } = render(<ClassRadial />);
    expect(container.querySelector('.wb-radial-node.hover')).toBeNull();
    expect(container.querySelector('.wb-radial-center')?.textContent).toBe('Release to cancel');
  });
});
