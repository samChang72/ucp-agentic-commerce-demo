import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { sessionStore } from '../store/sessions.js';

const authHeaders = {
  'UCP-Agent': 'profile="http://localhost:3002/profile"',
  'Request-Id': 'req-1',
  'Idempotency-Key': 'idem-1',
};

describe('POST /checkout-sessions', () => {
  beforeEach(() => sessionStore.clear());

  it('creates an incomplete session', async () => {
    const app = buildApp();
    const r = await request(app)
      .post('/checkout-sessions').set(authHeaders)
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('incomplete');
    expect(r.body.id).toMatch(/^chk_/);
    expect(r.body.line_items[0].item.title).toBe('Sony WH-1000XM6');
    expect(r.body.totals.find((t: any) => t.type === 'total').amount).toBeGreaterThan(0);
  });

  it('rejects missing UCP-Agent', async () => {
    const app = buildApp();
    const r = await request(app).post('/checkout-sessions').send({ currency: 'TWD', line_items: [] });
    expect(r.status).toBe(400);
  });

  it('returns cached response on same Idempotency-Key', async () => {
    const app = buildApp();
    const body = { currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] };
    const r1 = await request(app).post('/checkout-sessions').set(authHeaders).send(body);
    const r2 = await request(app).post('/checkout-sessions').set(authHeaders).send(body);
    expect(r1.body.id).toBe(r2.body.id);
  });
});

describe('POST /checkout-sessions — negative paths', () => {
  beforeEach(() => sessionStore.clear());

  it('rejects unknown product with UCP_UNKNOWN_PRODUCT', async () => {
    const app = buildApp();
    const r = await request(app)
      .post('/checkout-sessions').set({ ...authHeaders, 'Idempotency-Key': 'idem-unk' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'no-such-product' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    expect(r.status).toBe(400);
    expect(r.body.messages[0].code).toBe('UCP_UNKNOWN_PRODUCT');
  });

  it('rejects out-of-stock product with UCP_OUT_OF_STOCK', async () => {
    const app = buildApp();
    const r = await request(app)
      .post('/checkout-sessions').set({ ...authHeaders, 'Idempotency-Key': 'idem-oos' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'apple-airpodsmax2' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    expect(r.status).toBe(400);
    expect(r.body.messages[0].code).toBe('UCP_OUT_OF_STOCK');
  });

  it('rejects body that is a JSON array', async () => {
    const app = buildApp();
    const r = await request(app)
      .post('/checkout-sessions').set({ ...authHeaders, 'Idempotency-Key': 'idem-arr' })
      .send([1, 2, 3]);
    expect(r.status).toBe(400);
    expect(r.body.messages[0].code).toBe('UCP_BAD_REQUEST');
  });

  it('rejects line_items that is not an array', async () => {
    const app = buildApp();
    const r = await request(app)
      .post('/checkout-sessions').set({ ...authHeaders, 'Idempotency-Key': 'idem-bad-li' })
      .send({ currency: 'TWD', line_items: 'oops' });
    expect(r.status).toBe(400);
    expect(r.body.messages[0].code).toBe('UCP_BAD_REQUEST');
  });
});
