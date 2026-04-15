import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireUcpHeaders } from './ucpHeaders.js';

const app = express();
app.get('/x', requireUcpHeaders, (_req, res) => res.json({ ok: true }));

describe('requireUcpHeaders', () => {
  it('rejects missing UCP-Agent', async () => {
    const r = await request(app).get('/x').set('Idempotency-Key', 'a').set('Request-Id', 'b');
    expect(r.status).toBe(400);
    expect(r.body.messages[0].code).toBe('UCP_MISSING_HEADER');
  });

  it('rejects missing Idempotency-Key on non-GET', async () => {
    const app2 = express();
    app2.post('/x', requireUcpHeaders, (_req, res) => res.json({ ok: true }));
    const r = await request(app2).post('/x')
      .set('UCP-Agent', 'profile="http://x/p"')
      .set('Request-Id', 'b');
    expect(r.status).toBe(400);
  });

  it('allows GET without Idempotency-Key', async () => {
    const r = await request(app).get('/x')
      .set('UCP-Agent', 'profile="http://x/p"')
      .set('Request-Id', 'r');
    expect(r.status).toBe(200);
  });
});
