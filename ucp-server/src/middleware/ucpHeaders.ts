import type { Request, Response, NextFunction } from 'express';

const UCP_AGENT_PATTERN =
  /^profile="https?:\/\/[^"\s]+"(\s*;\s*[\w-]+=("[^"]*"|[\w.-]+))*\s*$/;

const CODES = {
  MISSING_UCP_AGENT: 'UCP_MISSING_UCP_AGENT',
  INVALID_UCP_AGENT: 'UCP_INVALID_UCP_AGENT',
  MISSING_REQUEST_ID: 'UCP_MISSING_REQUEST_ID',
  MISSING_IDEMPOTENCY_KEY: 'UCP_MISSING_IDEMPOTENCY_KEY',
} as const;

function reject(res: Response, code: string, content: string) {
  res.status(400).json({ messages: [{ type: 'error', code, content, severity: 'high' }] });
}

export function requireUcpHeaders(req: Request, res: Response, next: NextFunction) {
  const ucpAgent = req.header('UCP-Agent');
  const requestId = req.header('Request-Id');
  if (!ucpAgent) return reject(res, CODES.MISSING_UCP_AGENT, 'UCP-Agent required');
  if (!UCP_AGENT_PATTERN.test(ucpAgent))
    return reject(res, CODES.INVALID_UCP_AGENT, 'UCP-Agent must be profile="<url>"');
  if (!requestId) return reject(res, CODES.MISSING_REQUEST_ID, 'Request-Id required');

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const idem = req.header('Idempotency-Key');
    if (!idem) return reject(res, CODES.MISSING_IDEMPOTENCY_KEY, 'Idempotency-Key required for mutations');
  }
  next();
}
