import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { idemStore } from './idempotency.js';

describe('idemStore', () => {
  beforeEach(() => idemStore.clear());
  afterEach(() => vi.useRealTimers());

  it('put then get returns cached entry', () => {
    idemStore.put('k1', 201, { ok: true });
    expect(idemStore.get('k1')).toEqual(expect.objectContaining({ status: 201, body: { ok: true } }));
  });

  it('get returns undefined for missing key', () => {
    expect(idemStore.get('missing')).toBeUndefined();
  });

  it('expires entries older than TTL_MS (24h)', () => {
    vi.useFakeTimers();
    idemStore.put('k2', 200, { v: 1 });
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(idemStore.get('k2')).toBeUndefined();
  });

  it('does not expire entries within TTL', () => {
    vi.useFakeTimers();
    idemStore.put('k3', 200, { v: 1 });
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    expect(idemStore.get('k3')?.body).toEqual({ v: 1 });
  });
});
