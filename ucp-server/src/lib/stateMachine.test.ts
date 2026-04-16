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

import { IllegalTransitionError } from './stateMachine.js';

describe('checkout state machine extras', () => {
  it('allows self-transitions for non-terminal states', () => {
    expect(canTransition('incomplete', 'incomplete')).toBe(true);
    expect(canTransition('ready_for_complete', 'ready_for_complete')).toBe(true);
  });

  it('rejects canceled → anything', () => {
    expect(canTransition('canceled', 'incomplete')).toBe(false);
    expect(canTransition('canceled', 'completed')).toBe(false);
    expect(canTransition('canceled', 'ready_for_complete')).toBe(false);
  });

  it('assertTransition throws IllegalTransitionError with from/to fields', () => {
    try {
      assertTransition('completed', 'canceled');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalTransitionError);
      expect((e as IllegalTransitionError).from).toBe('completed');
      expect((e as IllegalTransitionError).to).toBe('canceled');
      expect((e as Error).message).toMatch(/illegal transition/i);
    }
  });
});
