import cors from 'cors';

const allowlist = (process.env.UCP_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:3002')
  .split(',').map(s => s.trim());

export const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/postman
    if (allowlist.includes(origin)) return cb(null, true);
    cb(new Error(`origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'UCP-Agent', 'Idempotency-Key', 'Request-Id', 'Content-Digest', 'Signature-Input', 'Signature', 'Authorization'],
  exposedHeaders: ['Request-Id', 'Content-Digest', 'Signature-Input', 'Signature'],
  credentials: false,
});
