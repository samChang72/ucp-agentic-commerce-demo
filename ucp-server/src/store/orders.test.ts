import { describe, it, expect, beforeEach } from 'vitest';
import { orderStore } from './orders.js';
import type { Order } from '../types/ucp.js';

const fixture = (id: string): Order => ({
  ucp: { version: '1.0' },
  id,
  checkout_id: 'chk_x',
  permalink_url: `http://localhost:3000/order/${id}`,
  line_items: [],
  fulfillment: { expectations: [], events: [] },
  adjustments: [],
  currency: 'TWD',
  totals: [],
  messages: [],
});

describe('orderStore', () => {
  beforeEach(() => orderStore.clear());

  it('put & get round-trips the order', () => {
    const o = fixture('ord_1');
    orderStore.put(o);
    expect(orderStore.get('ord_1')).toEqual(o);
  });

  it('get returns undefined for missing id', () => {
    expect(orderStore.get('nope')).toBeUndefined();
  });
});
