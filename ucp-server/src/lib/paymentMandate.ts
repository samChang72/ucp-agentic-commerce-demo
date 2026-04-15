import { signJwt, verifyJwt } from './jwt.js';
import { mandateStore } from '../store/mandates.js';

interface PaymentMandateClaims {
  checkout_id: string;
  amount: number;
  currency: string;
}

export async function signPaymentMandate(claims: PaymentMandateClaims) {
  const jwt = await signJwt(claims as unknown as Record<string, unknown>, { aud: 'merchant', exp: 300 });
  // SD-JWT-VC-shaped: append trailing ~ (empty disclosures for demo)
  return `${jwt}~`;
}

export async function verifyPaymentMandate(token: string, expectedCheckoutId: string, expectedAmount: number) {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(~[A-Za-z0-9_-]*)*$/.test(token)) {
    throw new Error('invalid SD-JWT-VC shape');
  }
  const jwt = token.split('~')[0];
  const { payload } = await verifyJwt(jwt, 'merchant');
  if (payload.checkout_id !== expectedCheckoutId) throw new Error('checkout_id mismatch');
  if (payload.amount !== expectedAmount) throw new Error('amount mismatch');
  const jti = payload.jti as string;
  if (mandateStore.isUsed(jti)) throw new Error('payment mandate replay detected');
  mandateStore.markUsed(jti);
  return { ok: true, payload };
}
