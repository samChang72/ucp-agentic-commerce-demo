/**
 * Response signature producer.
 *
 * Emits RFC 9530 Content-Digest + RFC 9421 Signature-Input/Signature headers.
 * Digest is SHA-256 of `JSON.stringify(body)`. Express's default `res.json()` also
 * serializes via `JSON.stringify(body)`, so bytes match as long as the Express app
 * does NOT set `json replacer` or `json spaces` (we don't).
 *
 * The Signature is an ES256 JWS over {method, path, digest} — a demo-grade
 * simplification of RFC 9421's canonical signature base string.
 */
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { signJwt } from '../lib/jwt.js';

export function signatureProducer(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  let signed = false;
  res.json = ((body: unknown) => {
    if (signed) return originalJson(body);
    signed = true;

    const bodyStr = JSON.stringify(body);
    const digest = createHash('sha256').update(bodyStr).digest('base64');
    res.setHeader('Content-Digest', `sha-256=:${digest}:`);

    const created = Math.floor(Date.now() / 1000);
    res.setHeader(
      'Signature-Input',
      `sig1=("@method" "@path" "content-digest");created=${created};keyid="ucp-server-key-1";alg="ecdsa-p256-sha256"`,
    );

    signJwt(
      { method: req.method, path: req.path, digest },
      { aud: 'client', exp: 60 },
    )
      .then((jws) => {
        res.setHeader('Signature', `sig1=:${Buffer.from(jws).toString('base64')}:`);
        originalJson(body);
      })
      .catch((err) => {
        console.error('[signature] sign failed, sending response without Signature header', err);
        originalJson(body);
      });
    return res;
  }) as typeof res.json;
  next();
}
