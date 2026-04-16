import type { Request, Response, NextFunction } from 'express';
import { idemStore } from '../store/idempotency.js';

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const key = req.header('Idempotency-Key');
  if (!key) return next();

  const cached = idemStore.get(key);
  if (cached) return res.status(cached.status).json(cached.body);

  let stored = false;
  const maybeStore = (body: unknown) => {
    if (stored) return;
    stored = true;
    if (res.statusCode < 500) idemStore.put(key, res.statusCode, body);
  };

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    maybeStore(body);
    return originalJson(body);
  }) as typeof res.json;

  const originalSend = res.send.bind(res);
  res.send = ((body: unknown) => {
    // Only cache JSON-serializable bodies; skip string/Buffer
    if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
      maybeStore(body);
    }
    return originalSend(body);
  }) as typeof res.send;

  next();
}
