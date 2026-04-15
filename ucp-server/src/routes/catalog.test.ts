import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';

const headers = {
  'UCP-Agent': 'profile="http://localhost:3002/profile"',
  'Request-Id': 'req-cat',
};

describe('GET /catalog', () => {
  it('returns Schema.org Product list with X-UCP-Extension header', async () => {
    const app = buildApp();
    const r = await request(app).get('/catalog').set(headers);
    expect(r.status).toBe(200);
    expect(r.headers['x-ucp-extension']).toBe('demo-catalog');
    expect(r.body.note).toMatch(/Non-UCP-standard/);
    expect(Array.isArray(r.body.products)).toBe(true);
    expect(r.body.products.length).toBeGreaterThan(0);
    const p = r.body.products[0];
    expect(p['@context']).toBe('https://schema.org');
    expect(p['@type']).toBe('Product');
    expect(p['@id']).toBeTruthy();
    expect(p.name).toBeTruthy();
    expect(p.offers.priceCurrency).toBe('TWD');
    expect(['https://schema.org/InStock', 'https://schema.org/OutOfStock']).toContain(p.offers.availability);
  });

  it('does not require UCP-Agent header (demo-only SDK convenience)', async () => {
    const app = buildApp();
    const r = await request(app).get('/catalog');
    expect(r.status).toBe(200);
  });
});
