import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireUcpHeaders } from '../middleware/ucpHeaders.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { sessionStore } from '../store/sessions.js';
import { PRODUCTS } from '../data/products.js';
import type { CheckoutSession, LineItem, Total } from '../types/ucp.js';
import { assertTransition } from '../lib/stateMachine.js';

type HydrationCode = 'UCP_OUT_OF_STOCK' | 'UCP_UNKNOWN_PRODUCT';

class HydrationError extends Error {
  constructor(public code: HydrationCode, public productId: string) {
    super(`${code}:${productId}`);
    this.name = 'HydrationError';
  }
}

export const checkoutSessionsRouter = Router();

const TAX_RATE = 0.05;

function computeTotals(lineItems: LineItem[], currency: string): Total[] {
  const subtotal = lineItems.reduce((s, li) => s + li.item.price * li.quantity.total, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  const shipping = 0;
  const total = subtotal + tax + shipping;
  return [
    { type: 'subtotal', amount: subtotal, currency },
    { type: 'tax', amount: tax, currency },
    { type: 'shipping', amount: shipping, currency },
    { type: 'total', amount: total, currency },
  ];
}

interface InputLineItem {
  item: { id: string };
  quantity: { original: number; total: number; fulfilled: number };
}

function hydrateLineItems(input: InputLineItem[], currency: string): LineItem[] {
  return input.map((li, i) => {
    const p = PRODUCTS.find((x) => x.id === li.item.id);
    if (!p) throw new HydrationError('UCP_UNKNOWN_PRODUCT', li.item.id);
    if (!p.in_stock) throw new HydrationError('UCP_OUT_OF_STOCK', li.item.id);
    return {
      id: `li_${i + 1}`,
      item: { id: p.id, title: p.title, price: p.price, image_url: p.image_url },
      quantity: li.quantity,
      totals: [{ type: 'subtotal', amount: p.price * li.quantity.total, currency }],
    };
  });
}

checkoutSessionsRouter.post(
  '/checkout-sessions',
  requireUcpHeaders,
  idempotencyMiddleware,
  (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({
        messages: [{ type: 'error', code: 'UCP_BAD_REQUEST', content: 'request body must be a JSON object', severity: 'high' }],
      });
    }
    const { currency = 'TWD', line_items = [] } = body as { currency?: string; line_items?: unknown };
    if (!Array.isArray(line_items)) {
      return res.status(400).json({
        messages: [{ type: 'error', code: 'UCP_BAD_REQUEST', content: 'line_items must be an array', severity: 'high' }],
      });
    }
    if (typeof currency !== 'string' || currency.length === 0) {
      return res.status(400).json({
        messages: [{ type: 'error', code: 'UCP_BAD_REQUEST', content: 'currency must be a non-empty string', severity: 'high' }],
      });
    }
    try {
      const items = hydrateLineItems(line_items as InputLineItem[], currency);
      const session: CheckoutSession = {
        ucp: { version: '1.0', capabilities: ['embedded_checkout'], payment_handlers: ['google-pay-mock'] },
        id: `chk_${randomUUID().slice(0, 8)}`,
        status: 'incomplete',
        currency,
        line_items: items,
        totals: computeTotals(items, currency),
        messages: [],
        links: { terms_of_service: 'http://localhost:3000/terms' },
        _created_at: new Date().toISOString(),
      };
      sessionStore.put(session);
      return res.status(201).json(session);
    } catch (e) {
      if (e instanceof HydrationError) {
        return res.status(400).json({
          messages: [{
            type: 'error',
            code: e.code,
            content: e.code === 'UCP_OUT_OF_STOCK' ? 'product is out of stock' : 'unknown product',
            path: `line_items[].item.id=${e.productId}`,
            severity: 'high',
          }],
        });
      }
      const err = e as Error;
      return res.status(400).json({
        messages: [{ type: 'error', code: 'UCP_BAD_REQUEST', content: err.message, severity: 'high' }],
      });
    }
  },
);

checkoutSessionsRouter.get('/checkout-sessions/:id', requireUcpHeaders, (req, res) => {
  const s = sessionStore.get(String(req.params.id));
  if (!s) {
    return res.status(404).json({
      messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'session not found', severity: 'high' }],
    });
  }
  res.json(s);
});

checkoutSessionsRouter.put('/checkout-sessions/:id', requireUcpHeaders, idempotencyMiddleware, (req, res) => {
  const s = sessionStore.get(String(req.params.id));
  if (!s) {
    return res.status(404).json({
      messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'session not found', severity: 'high' }],
    });
  }
  if (s.status === 'completed' || s.status === 'canceled') {
    return res.status(409).json({
      messages: [{ type: 'error', code: 'UCP_INVALID_STATE', content: `cannot update session in ${s.status}`, severity: 'high' }],
    });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      messages: [{ type: 'error', code: 'UCP_BAD_REQUEST', content: 'request body must be a JSON object', severity: 'high' }],
    });
  }
  const { buyer, fulfillment, payment } = body as { buyer?: typeof s.buyer; fulfillment?: typeof s.fulfillment; payment?: typeof s.payment };
  if (buyer) s.buyer = buyer;
  if (fulfillment) s.fulfillment = fulfillment;
  if (payment) s.payment = payment;

  const ready = !!(s.buyer && s.fulfillment?.destinations?.length && s.payment?.instruments?.length);
  const nextStatus = ready ? 'ready_for_complete' : 'incomplete';
  assertTransition(s.status, nextStatus);
  s.status = nextStatus;
  sessionStore.put(s);
  res.json(s);
});
