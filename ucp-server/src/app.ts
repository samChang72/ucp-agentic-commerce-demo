import express from 'express';
import { randomUUID } from 'node:crypto';
import { corsMiddleware } from './middleware/cors.js';
import { signatureProducer } from './middleware/signature.js';
import { healthRouter } from './routes/health.js';

export function buildApp() {
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const rid = req.header('Request-Id') ?? randomUUID();
    res.setHeader('Request-Id', rid);
    next();
  });
  // signatureProducer BEFORE routes so response headers are signed on every JSON reply
  // (idempotency middleware will mount per-route in Task 12+)
  app.use(signatureProducer);
  app.use(healthRouter);
  return app;
}
