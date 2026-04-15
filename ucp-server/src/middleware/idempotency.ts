import type { Request, Response, NextFunction } from 'express';
import { idemStore } from '../store/idempotency.js';

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const key = req.header('Idempotency-Key');
  if (!key) return next();
  const cached = idemStore.get(key);
  if (cached) return res.status(cached.status).json(cached.body);

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    idemStore.put(key, res.statusCode, body);
    return originalJson(body);
  }) as typeof res.json;

  next();
}
