import type { Request, Response, NextFunction } from 'express';

function reject(res: Response, code: string, content: string) {
  res.status(400).json({ messages: [{ type: 'error', code, content, severity: 'high' }] });
}

export function requireUcpHeaders(req: Request, res: Response, next: NextFunction) {
  const ucpAgent = req.header('UCP-Agent');
  const requestId = req.header('Request-Id');
  if (!ucpAgent) return reject(res, 'UCP_MISSING_HEADER', 'UCP-Agent required');
  if (!/^profile="https?:\/\/[^"]+"/.test(ucpAgent))
    return reject(res, 'UCP_INVALID_HEADER', 'UCP-Agent must be profile="<url>"');
  if (!requestId) return reject(res, 'UCP_MISSING_HEADER', 'Request-Id required');

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const idem = req.header('Idempotency-Key');
    if (!idem) return reject(res, 'UCP_MISSING_HEADER', 'Idempotency-Key required for mutations');
  }
  next();
}
