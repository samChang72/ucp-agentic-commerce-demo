import { createHash } from 'node:crypto';
import { signJwt, verifyJwt } from './jwt.js';

export function hashCheckoutState(state: unknown): string {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

export async function signCheckoutMandate(stateHash: string, checkoutId: string) {
  return signJwt({ checkout_hash: stateHash, checkout_id: checkoutId }, { aud: 'merchant', exp: 300 });
}

export async function verifyCheckoutMandate(jws: string, checkoutId: string, expectedHash: string) {
  const { payload } = await verifyJwt(jws, 'merchant');
  if (payload.checkout_id !== checkoutId) throw new Error('checkout_id mismatch');
  if (payload.checkout_hash !== expectedHash) throw new Error('checkout_hash mismatch (tampered)');
  return { ok: true, payload };
}
