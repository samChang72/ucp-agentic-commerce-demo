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
