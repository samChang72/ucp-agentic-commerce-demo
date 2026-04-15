import { SignJWT, jwtVerify, generateKeyPair, exportJWK, importJWK, type JWK } from 'jose';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const KEY_DIR = './keys';
const PRIV_PATH = `${KEY_DIR}/ucp-server-ec-priv.json`;
const PUB_PATH = `${KEY_DIR}/ucp-server-ec-pub.json`;
const ISS = process.env.UCP_ISSUER ?? 'http://localhost:3001';

let cachedPriv: CryptoKey | undefined;
let cachedPub: CryptoKey | undefined;
let cachedPubJwk: JWK | undefined;

export async function getKeyPair() {
  if (cachedPriv && cachedPub) return { priv: cachedPriv, pub: cachedPub };
  if (!existsSync(KEY_DIR)) await mkdir(KEY_DIR, { recursive: true });
  if (existsSync(PRIV_PATH) && existsSync(PUB_PATH)) {
    const priv = JSON.parse(await readFile(PRIV_PATH, 'utf8')) as JWK;
    const pub = JSON.parse(await readFile(PUB_PATH, 'utf8')) as JWK;
    cachedPriv = (await importJWK(priv, 'ES256')) as CryptoKey;
    cachedPub = (await importJWK(pub, 'ES256')) as CryptoKey;
    cachedPubJwk = pub;
  } else {
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    const privJwk = await exportJWK(privateKey);
    const pubJwk = await exportJWK(publicKey);
    privJwk.alg = pubJwk.alg = 'ES256';
    privJwk.kid = pubJwk.kid = 'ucp-server-key-1';
    await writeFile(PRIV_PATH, JSON.stringify(privJwk, null, 2));
    await writeFile(PUB_PATH, JSON.stringify(pubJwk, null, 2));
    cachedPriv = privateKey;
    cachedPub = publicKey;
    cachedPubJwk = pubJwk;
  }
  return { priv: cachedPriv!, pub: cachedPub! };
}

export async function getPublicJwk() {
  await getKeyPair();
  return cachedPubJwk!;
}

export async function signJwt(
  payload: Record<string, unknown>,
  opts: { aud: string; exp: number; sub?: string }
) {
  const { priv } = await getKeyPair();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'ucp-server-key-1', typ: 'JWT' })
    .setIssuer(ISS)
    .setAudience(opts.aud)
    .setIssuedAt()
    .setExpirationTime(`${opts.exp}s`)
    .setJti(randomUUID())
    .sign(priv);
}

export async function verifyJwt(token: string, expectedAud: string) {
  const { pub } = await getKeyPair();
  return jwtVerify(token, pub, { issuer: ISS, audience: expectedAud });
}
