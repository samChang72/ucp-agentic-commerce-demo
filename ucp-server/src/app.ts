import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { corsMiddleware } from './middleware/cors.js';
import { signatureProducer } from './middleware/signature.js';
import { healthRouter } from './routes/health.js';
import { checkoutSessionsRouter } from './routes/checkoutSessions.js';
import { ordersRouter } from './routes/orders.js';
import { catalogRouter } from './routes/catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '../public');

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const rid = req.header('Request-Id') ?? randomUUID();
    res.setHeader('Request-Id', rid);
    next();
  });
  app.get('/sdk.js', (_req, res) => {
    res.type('application/javascript; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    res.sendFile(resolve(PUBLIC_DIR, 'sdk.js'));
  });
  app.use(signatureProducer);
  app.use(healthRouter);
  app.use(checkoutSessionsRouter);
  app.use(ordersRouter);
  app.use(catalogRouter);

  // JSON 404
  app.use((_req, res) => {
    res.status(404).json({
      messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'route not found', severity: 'medium' }],
    });
  });

  // Central error handler (4-arg signature required by Express)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[error]', err);
    if (res.headersSent) return;
    res.status(500).json({
      messages: [{ type: 'error', code: 'UCP_INTERNAL', content: 'internal server error', severity: 'high' }],
    });
  });

  return app;
}
