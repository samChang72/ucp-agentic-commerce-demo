import { describe, it, expect, beforeEach } from 'vitest';
import { mandateStore } from './mandates.js';

describe('mandateStore', () => {
  beforeEach(() => mandateStore.clear());

  it('isUsed returns false for unseen jti', () => {
    expect(mandateStore.isUsed('jti-new')).toBe(false);
  });

  it('markUsed then isUsed returns true (replay detected)', () => {
    mandateStore.markUsed('jti-1');
    expect(mandateStore.isUsed('jti-1')).toBe(true);
  });

  it('markUsed is idempotent (Set semantics)', () => {
    mandateStore.markUsed('jti-x');
    mandateStore.markUsed('jti-x');
    expect(mandateStore.isUsed('jti-x')).toBe(true);
  });
});
