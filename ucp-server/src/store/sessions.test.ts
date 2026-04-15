import { describe, it, expect, beforeEach } from 'vitest';
import { sessionStore } from './sessions.js';
import type { CheckoutSession } from '../types/ucp.js';

describe('sessionStore', () => {
  beforeEach(() => sessionStore.clear());

  it('put & get round-trips the session', () => {
    const s: CheckoutSession = {
      ucp: { version: '1.0', capabilities: [], payment_handlers: ['google-pay-mock'] },
      id: 'chk_1', status: 'incomplete', currency: 'TWD',
      line_items: [], totals: [], messages: [], links: {},
      _created_at: new Date().toISOString(),
    };
    sessionStore.put(s);
    expect(sessionStore.get('chk_1')).toEqual(s);
  });

  it('returns undefined for missing id', () => {
    expect(sessionStore.get('nope')).toBeUndefined();
  });
});
