import { test, expect } from '@playwright/test';

/**
 * End-to-end: publisher article page → Shadow-DOM ad slot → inline
 * checkout → order completed. The page runs at http://localhost:3002
 * (Vite dev) and talks to ucp-server at http://localhost:3001.
 *
 * Playwright's CSS and text locators pierce open shadow roots, so
 * querying `.card`, `input[name=...]`, `#gpay` etc. from the root
 * `page` works even though they live inside `<ucp-ad-slot>`'s shadow.
 */

test('ad → inline checkout → order completed', async ({ page }) => {
  await page.goto('/');

  const card = page.locator('ucp-ad-slot').locator('.card');
  await expect(card.locator('.title')).toHaveText(/Sony WH-1000XM6/);
  await expect(card.locator('.price')).toContainText('NT$');

  await card.locator('#buy').click();

  // CheckoutForm renders into #checkout inside the shadow root
  const form = card.locator('#checkout');
  await expect(form.locator('input[name=first_name]')).toBeVisible();

  await form.locator('input[name=first_name]').fill('測試');
  await form.locator('input[name=last_name]').fill('用戶');
  await form.locator('input[name=email]').fill('test@example.com');
  await form.locator('input[name=line1]').fill('市民大道 1 號');
  // city + postal_code already populated with defaults 台北市 / 100

  // gpay mock gate activates the confirm button
  await form.locator('#gpay').click();
  await expect(form.locator('#confirm')).toBeEnabled();
  await form.locator('#confirm').click();

  // Success banner replaces the form inside the same #checkout container
  await expect(form.getByText(/訂單完成/)).toBeVisible({ timeout: 10_000 });
  await expect(form.getByText(/ord_[0-9a-f]+/)).toBeVisible();
});

test('api contract: /checkout-sessions returns UCP shape', async ({ request }) => {
  const r = await request.post('http://localhost:3001/checkout-sessions', {
    headers: {
      'UCP-Agent': 'profile="http://localhost:3002/profile"',
      'Request-Id': 'ct-1',
      'Idempotency-Key': 'ct-1',
      'Content-Type': 'application/json',
    },
    data: {
      currency: 'TWD',
      line_items: [
        { item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } },
      ],
    },
  });

  expect(r.status()).toBe(201);
  const body = await r.json();
  expect(body.ucp.version).toBe('1.0');
  expect(body.status).toBe('incomplete');
  expect(body.id).toMatch(/^chk_/);
  expect(body.line_items[0].item.title).toBeTruthy();
  expect(body.totals.some((t: { type: string }) => t.type === 'total')).toBe(true);
});

const UCP_BASE = 'http://localhost:3001';
const AGENT = 'profile="http://localhost:3002/profile"';

test('rejects POST without UCP-Agent header', async ({ request }) => {
  const r = await request.post(`${UCP_BASE}/checkout-sessions`, {
    headers: { 'Content-Type': 'application/json' },
    data: {},
  });
  expect(r.status()).toBe(400);
  const body = await r.json();
  expect(body.messages[0].code).toBe('UCP_MISSING_UCP_AGENT');
});

test('cancel then complete is 409 UCP_INVALID_STATE', async ({ request }) => {
  const create = await request.post(`${UCP_BASE}/checkout-sessions`, {
    headers: {
      'UCP-Agent': AGENT,
      'Request-Id': 'neg-create-1',
      'Idempotency-Key': 'neg-create-' + Date.now(),
      'Content-Type': 'application/json',
    },
    data: {
      currency: 'TWD',
      line_items: [
        { item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } },
      ],
    },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();

  const cancel = await request.post(`${UCP_BASE}/checkout-sessions/${id}/cancel`, {
    headers: {
      'UCP-Agent': AGENT,
      'Request-Id': 'neg-cancel-1',
      'Idempotency-Key': 'neg-cancel-' + Date.now(),
      'Content-Type': 'application/json',
    },
    data: {},
  });
  expect(cancel.status()).toBe(200);

  const complete = await request.post(`${UCP_BASE}/checkout-sessions/${id}/complete`, {
    headers: {
      'UCP-Agent': AGENT,
      'Request-Id': 'neg-complete-1',
      'Idempotency-Key': 'neg-complete-' + Date.now(),
      'Content-Type': 'application/json',
    },
    data: { ap2: { checkout_mandate: 'x' }, payment: { instruments: [] }, expected_total: 0 },
  });
  expect(complete.status()).toBe(409);
  const body = await complete.json();
  expect(body.messages[0].code).toBe('UCP_INVALID_STATE');
});
