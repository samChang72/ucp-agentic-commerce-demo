import { describe, it, expect, beforeEach } from 'vitest';
import { signCheckoutMandate, verifyCheckoutMandate, hashCheckoutState } from './checkoutMandate.js';
import { signPaymentMandate, verifyPaymentMandate } from './paymentMandate.js';
import { mandateStore } from '../store/mandates.js';

describe('CheckoutMandate', () => {
  it('signs state hash and verifies', async () => {
    const hash = hashCheckoutState({ id: 'chk_1', total: 8390 });
    const jws = await signCheckoutMandate(hash, 'chk_1');
    const r = await verifyCheckoutMandate(jws, 'chk_1', hash);
    expect(r.ok).toBe(true);
  });

  it('rejects tampered hash', async () => {
    const jws = await signCheckoutMandate('abc', 'chk_1');
    await expect(verifyCheckoutMandate(jws, 'chk_1', 'xyz')).rejects.toThrow();
  });
});

describe('PaymentMandate', () => {
  beforeEach(() => mandateStore.clear());

  it('signs and produces SD-JWT-like token with trailing ~', async () => {
    const token = await signPaymentMandate({ checkout_id: 'chk_1', amount: 8390, currency: 'TWD' });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+~$/);
  });

  it('verifies fresh and rejects replayed', async () => {
    const token = await signPaymentMandate({ checkout_id: 'chk_1', amount: 8390, currency: 'TWD' });
    const r = await verifyPaymentMandate(token, 'chk_1', 8390);
    expect(r.ok).toBe(true);
    await expect(verifyPaymentMandate(token, 'chk_1', 8390)).rejects.toThrow(/replay/i);
  });
});
