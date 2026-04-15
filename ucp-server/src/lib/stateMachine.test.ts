import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition } from './stateMachine.js';

describe('checkout state machine', () => {
  it('allows incomplete → ready_for_complete', () => {
    expect(canTransition('incomplete', 'ready_for_complete')).toBe(true);
  });

  it('allows ready_for_complete → completed', () => {
    expect(canTransition('ready_for_complete', 'completed')).toBe(true);
  });

  it('allows incomplete → canceled and ready_for_complete → canceled', () => {
    expect(canTransition('incomplete', 'canceled')).toBe(true);
    expect(canTransition('ready_for_complete', 'canceled')).toBe(true);
  });

  it('rejects completed → anything', () => {
    expect(canTransition('completed', 'canceled')).toBe(false);
    expect(canTransition('completed', 'ready_for_complete')).toBe(false);
  });

  it('rejects incomplete → completed (must go through ready_for_complete)', () => {
    expect(canTransition('incomplete', 'completed')).toBe(false);
  });

  it('assertTransition throws on illegal', () => {
    expect(() => assertTransition('completed', 'canceled')).toThrow(/illegal/i);
  });
});
