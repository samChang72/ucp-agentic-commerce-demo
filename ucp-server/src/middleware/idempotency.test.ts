import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { idempotencyMiddleware } from './idempotency.js';
import { idemStore } from '../store/idempotency.js';

const app = express();
app.use(express.json());
let counter = 0;
app.post('/x', idempotencyMiddleware, (_req, res) => {
  counter++;
  res.status(201).json({ n: counter });
});

describe('idempotencyMiddleware', () => {
  beforeEach(() => { idemStore.clear(); counter = 0; });

  it('same Idempotency-Key returns cached response', async () => {
    const k = 'key-1';
    const r1 = await request(app).post('/x').set('Idempotency-Key', k).send({});
    const r2 = await request(app).post('/x').set('Idempotency-Key', k).send({});
    expect(r1.body.n).toBe(1);
    expect(r2.body.n).toBe(1); // cached
    expect(counter).toBe(1);
  });

  it('different keys run independently', async () => {
    await request(app).post('/x').set('Idempotency-Key', 'a').send({});
    await request(app).post('/x').set('Idempotency-Key', 'b').send({});
    expect(counter).toBe(2);
  });
});

describe('idempotencyMiddleware — edge cases', () => {
  beforeEach(() => { idemStore.clear(); });

  it('does not cache 5xx responses (allows retry)', async () => {
    const app = express();
    app.use(express.json());
    let attempts = 0;
    app.post('/fail', idempotencyMiddleware, (_req, res) => {
      attempts++;
      if (attempts < 2) return res.status(503).json({ error: 'transient' });
      res.status(201).json({ ok: true });
    });
    const r1 = await request(app).post('/fail').set('Idempotency-Key', 'k1').send({});
    const r2 = await request(app).post('/fail').set('Idempotency-Key', 'k1').send({});
    expect(r1.status).toBe(503);
    expect(r2.status).toBe(201); // re-executed because 5xx not cached
    expect(r2.body.ok).toBe(true);
    expect(attempts).toBe(2);
  });

  it('does not cache when no Idempotency-Key', async () => {
    const app = express();
    app.use(express.json());
    let n = 0;
    app.post('/nk', idempotencyMiddleware, (_req, res) => { n++; res.status(201).json({ n }); });
    const r1 = await request(app).post('/nk').send({});
    const r2 = await request(app).post('/nk').send({});
    expect(r1.body.n).toBe(1);
    expect(r2.body.n).toBe(2);
  });

  it('bypasses GET regardless of header', async () => {
    const app = express();
    let hits = 0;
    app.get('/g', idempotencyMiddleware, (_req, res) => { hits++; res.json({ hits }); });
    await request(app).get('/g').set('Idempotency-Key', 'kg').send();
    await request(app).get('/g').set('Idempotency-Key', 'kg').send();
    expect(hits).toBe(2);
  });
});
