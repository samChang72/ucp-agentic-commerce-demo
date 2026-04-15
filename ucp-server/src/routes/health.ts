import { Router } from 'express';
import { getPublicJwk } from '../lib/jwt.js';

export const healthRouter = Router();

healthRouter.get('/healthz', (_req, res) => res.json({ ok: true }));

healthRouter.get('/.well-known/jwks.json', async (_req, res) => {
  const jwk = await getPublicJwk();
  res.json({ keys: [jwk] });
});
