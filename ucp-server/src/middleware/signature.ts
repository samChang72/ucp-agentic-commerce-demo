import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { signJwt } from '../lib/jwt.js';

export function signatureProducer(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
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
    ).then((jws) => {
      res.setHeader('Signature', `sig1=:${Buffer.from(jws).toString('base64')}:`);
      originalJson(body);
    }).catch(() => originalJson(body));
    return res;
  }) as typeof res.json;
  next();
}
