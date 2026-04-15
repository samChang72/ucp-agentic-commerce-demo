import { describe, it, expect, beforeAll } from 'vitest';
import { getKeyPair, signJwt, verifyJwt } from './jwt.js';

describe('jwt ES256', () => {
  beforeAll(async () => { await getKeyPair(); });

  it('signs and verifies a payload', async () => {
    const token = await signJwt({ sub: 'chk_1' }, { aud: 'merchant', exp: 60 });
    const { payload } = await verifyJwt(token, 'merchant');
    expect(payload.sub).toBe('chk_1');
    expect(payload.aud).toBe('merchant');
  });

  it('rejects wrong audience', async () => {
    const token = await signJwt({ sub: 'chk_1' }, { aud: 'merchant', exp: 60 });
    await expect(verifyJwt(token, 'other')).rejects.toThrow();
  });

  it('rejects expired token', async () => {
    const token = await signJwt({ sub: 'chk_1' }, { aud: 'merchant', exp: -1 });
    await expect(verifyJwt(token, 'merchant')).rejects.toThrow();
  });
});
