import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { sessionStore } from '../store/sessions.js';
import { orderStore } from '../store/orders.js';
import { mandateStore } from '../store/mandates.js';
import { hashCheckoutState, signCheckoutMandate } from '../lib/checkoutMandate.js';
import { signPaymentMandate } from '../lib/paymentMandate.js';

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

describe('GET /checkout-sessions/:id', () => {
  beforeEach(() => sessionStore.clear());

  it('returns existing session', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'g-c' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).get(`/checkout-sessions/${created.body.id}`).set(authHeaders);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(created.body.id);
  });

  it('returns 404 for unknown id', async () => {
    const app = buildApp();
    const r = await request(app).get('/checkout-sessions/chk_nope').set(authHeaders);
    expect(r.status).toBe(404);
  });
});

describe('PUT /checkout-sessions/:id', () => {
  beforeEach(() => sessionStore.clear());

  it('updates buyer + fulfillment + payment -> transitions to ready_for_complete', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'p-c1' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).put(`/checkout-sessions/${created.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'p-put1' })
      .send({
        buyer: { email: 'a@b.c', first_name: 'A', last_name: 'B' },
        fulfillment: { destinations: [{ recipient: 'A B', line1: 'Taipei', city: 'TP', postal_code: '100', country: 'TW' }], method_type: 'shipping' },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet' }] },
      });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ready_for_complete');
  });

  it('stays incomplete when buyer missing', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'p-c2' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).put(`/checkout-sessions/${created.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'p-put2' })
      .send({ fulfillment: { destinations: [{ recipient: 'A', line1: 'x', city: 'TP', postal_code: '100', country: 'TW' }], method_type: 'shipping' } });
    expect(r.body.status).toBe('incomplete');
  });
});

describe('PUT /checkout-sessions/:id — negative paths', () => {
  beforeEach(() => sessionStore.clear());

  it('returns 404 for unknown id', async () => {
    const app = buildApp();
    const r = await request(app).put('/checkout-sessions/chk_nope')
      .set({ ...authHeaders, 'Idempotency-Key': 'p-404' })
      .send({});
    expect(r.status).toBe(404);
    expect(r.body.messages[0].code).toBe('UCP_NOT_FOUND');
  });

  it('returns 409 when session is canceled', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'p-409c' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    // Force terminal state via store directly
    const stored = sessionStore.get(created.body.id)!;
    sessionStore.put({ ...stored, status: 'canceled' });
    const r = await request(app).put(`/checkout-sessions/${created.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'p-409c-put' })
      .send({ buyer: { email: 'x', first_name: 'a', last_name: 'b' } });
    expect(r.status).toBe(409);
    expect(r.body.messages[0].code).toBe('UCP_INVALID_STATE');
  });

  it('returns 400 when body is not a JSON object', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'p-400b' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).put(`/checkout-sessions/${created.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'p-400b-put' })
      .send([1, 2, 3]);
    expect(r.status).toBe(400);
    expect(r.body.messages[0].code).toBe('UCP_BAD_REQUEST');
  });
});

describe('POST /checkout-sessions/:id/complete', () => {
  beforeEach(() => {
    sessionStore.clear();
    orderStore.clear();
    mandateStore.clear();
  });

  it('validates mandates and transitions to completed, creates order', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'cm-c' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });

    await request(app).put(`/checkout-sessions/${created.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cm-p' })
      .send({
        buyer: { email: 'a@b.c', first_name: 'A', last_name: 'B' },
        fulfillment: { destinations: [{ recipient: 'A B', line1: 'Taipei', city: 'TP', postal_code: '100', country: 'TW' }], method_type: 'shipping' },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet' }] },
      });

    const total = created.body.totals.find((t: any) => t.type === 'total').amount;
    const stateHash = hashCheckoutState({ id: created.body.id, total });
    const checkoutMandate = await signCheckoutMandate(stateHash, created.body.id);
    const paymentMandate = await signPaymentMandate({ checkout_id: created.body.id, amount: total, currency: 'TWD' });

    const r = await request(app).post(`/checkout-sessions/${created.body.id}/complete`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cm-cmpl' })
      .send({
        ap2: { checkout_mandate: checkoutMandate },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet', credential: { token: paymentMandate } }] },
        expected_total: total,
        signals: { 'dev.ucp.buyer_ip': '127.0.0.1', 'dev.ucp.user_agent': 'test' },
      });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('completed');
    expect(r.body.order.id).toMatch(/^ord_/);
    expect(r.body.order.permalink_url).toContain(r.body.order.id);
  });

  it('rejects when state not ready_for_complete (409)', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'cm-c2' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).post(`/checkout-sessions/${created.body.id}/complete`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cm-cmpl2' })
      .send({ ap2: { checkout_mandate: 'x' }, payment: { instruments: [] }, expected_total: 0 });
    expect(r.status).toBe(409);
    expect(r.body.messages[0].code).toBe('UCP_INVALID_STATE');
  });

  it('returns UCP_BAD_REQUEST when expected_total mismatches', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'cm-c3' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    await request(app).put(`/checkout-sessions/${created.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cm-p3' })
      .send({
        buyer: { email: 'a@b.c', first_name: 'A', last_name: 'B' },
        fulfillment: { destinations: [{ recipient: 'A', line1: 'x', city: 'TP', postal_code: '100', country: 'TW' }], method_type: 'shipping' },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet' }] },
      });
    const r = await request(app).post(`/checkout-sessions/${created.body.id}/complete`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cm-cmpl3' })
      .send({
        ap2: { checkout_mandate: 'placeholder' },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet', credential: { token: 'x~' } }] },
        expected_total: 999999,
      });
    expect(r.status).toBe(400);
    expect(r.body.messages[0].code).toBe('UCP_BAD_REQUEST');
    expect(r.body.messages[0].content).toMatch(/expected_total/);
  });
});

describe('POST /checkout-sessions/:id/cancel', () => {
  beforeEach(() => sessionStore.clear());

  it('cancels incomplete session', async () => {
    const app = buildApp();
    const c = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-c1' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).post(`/checkout-sessions/${c.body.id}/cancel`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-cancel1' })
      .send({});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('canceled');
  });

  it('refuses to cancel completed (409)', async () => {
    const app = buildApp();
    const c = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-c2' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    // Force completed via store directly
    const stored = sessionStore.get(c.body.id)!;
    sessionStore.put({ ...stored, status: 'completed' });

    const r = await request(app).post(`/checkout-sessions/${c.body.id}/cancel`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-cancel2' })
      .send({});
    expect(r.status).toBe(409);
    expect(r.body.messages[0].code).toBe('UCP_INVALID_STATE');
  });

  it('returns 404 for unknown id', async () => {
    const app = buildApp();
    const r = await request(app).post('/checkout-sessions/chk_nope/cancel')
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-404' })
      .send({});
    expect(r.status).toBe(404);
    expect(r.body.messages[0].code).toBe('UCP_NOT_FOUND');
  });

  it('cancels ready_for_complete session', async () => {
    const app = buildApp();
    const c = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-rfc-c' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    await request(app).put(`/checkout-sessions/${c.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-rfc-p' })
      .send({
        buyer: { email: 'a@b.c', first_name: 'A', last_name: 'B' },
        fulfillment: { destinations: [{ recipient: 'A', line1: 'x', city: 'TP', postal_code: '100', country: 'TW' }], method_type: 'shipping' },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet' }] },
      });
    const r = await request(app).post(`/checkout-sessions/${c.body.id}/cancel`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-rfc-x' })
      .send({});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('canceled');
  });

  it('refuses to cancel an already-canceled session (409)', async () => {
    const app = buildApp();
    const c = await request(app).post('/checkout-sessions')
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-dup-c' })
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    await request(app).post(`/checkout-sessions/${c.body.id}/cancel`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-dup-1' })
      .send({});
    const r = await request(app).post(`/checkout-sessions/${c.body.id}/cancel`)
      .set({ ...authHeaders, 'Idempotency-Key': 'cn-dup-2' })   // different key, fresh request
      .send({});
    expect(r.status).toBe(409);
    expect(r.body.messages[0].code).toBe('UCP_INVALID_STATE');
    expect(r.body.messages[0].content).toMatch(/canceled/);
  });
});
