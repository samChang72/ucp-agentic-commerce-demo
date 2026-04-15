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
