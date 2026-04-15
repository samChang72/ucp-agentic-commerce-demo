import { describe, it, expect, beforeAll } from 'vitest';
import { decodeProtectedHeader } from 'jose';
import { getKeyPair, getPublicJwk, signJwt, verifyJwt } from './jwt.js';

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

describe('jwt ES256 extras', () => {
  it('protected header contains kid', async () => {
    const token = await signJwt({}, { aud: 'merchant', exp: 60 });
    const hdr = decodeProtectedHeader(token);
    expect(hdr.alg).toBe('ES256');
    expect(hdr.kid).toBe('ucp-server-key-1');
    expect(hdr.typ).toBe('JWT');
  });

  it('getPublicJwk returns public-only JWK (no d component)', async () => {
    const jwk = await getPublicJwk();
    expect(jwk.kty).toBe('EC');
    expect(jwk.crv).toBe('P-256');
    expect(jwk.alg).toBe('ES256');
    expect(jwk.kid).toBe('ucp-server-key-1');
    expect((jwk as any).d).toBeUndefined();
  });
});
