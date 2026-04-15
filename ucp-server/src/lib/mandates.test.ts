import { describe, it, expect, beforeEach } from 'vitest';
import { signCheckoutMandate, verifyCheckoutMandate, hashCheckoutState } from './checkoutMandate.js';
import { signPaymentMandate, verifyPaymentMandate } from './paymentMandate.js';
import { signJwt } from './jwt.js';
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

describe('PaymentMandate negatives', () => {
  beforeEach(() => mandateStore.clear());

  it('rejects malformed token (no tilde)', async () => {
    await expect(verifyPaymentMandate('not-a-jwt-token', 'chk_x', 100)).rejects.toThrow(/invalid SD-JWT-VC shape/);
  });

  it('rejects token with wrong audience', async () => {
    const wrongAudJwt = await signJwt({ checkout_id: 'chk_1', amount: 100, currency: 'TWD' }, { aud: 'other-party', exp: 60 });
    await expect(verifyPaymentMandate(`${wrongAudJwt}~`, 'chk_1', 100)).rejects.toThrow();
  });

  it('rejects expired token', async () => {
    const jwt = await signJwt({ checkout_id: 'chk_1', amount: 100, currency: 'TWD' }, { aud: 'merchant', exp: -1 });
    await expect(verifyPaymentMandate(`${jwt}~`, 'chk_1', 100)).rejects.toThrow();
  });
});
