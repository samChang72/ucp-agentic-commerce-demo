import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireUcpHeaders } from '../middleware/ucpHeaders.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { sessionStore } from '../store/sessions.js';
import { PRODUCTS } from '../data/products.js';
import type { CheckoutSession, LineItem, Total } from '../types/ucp.js';

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

function hydrateLineItems(input: InputLineItem[]): LineItem[] {
  return input.map((li, i) => {
    const p = PRODUCTS.find((x) => x.id === li.item.id);
    if (!p) throw new Error(`unknown product ${li.item.id}`);
    if (!p.in_stock) throw new Error(`out_of_stock:${p.id}`);
    return {
      id: `li_${i + 1}`,
      item: { id: p.id, title: p.title, price: p.price, image_url: p.image_url },
      quantity: li.quantity,
      totals: [{ type: 'subtotal', amount: p.price * li.quantity.total, currency: 'TWD' }],
    };
  });
}

checkoutSessionsRouter.post(
  '/checkout-sessions',
  requireUcpHeaders,
  idempotencyMiddleware,
  (req, res) => {
    try {
      const { currency = 'TWD', line_items = [] } = req.body ?? {};
      const items = hydrateLineItems(line_items);
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
      res.status(201).json(session);
    } catch (e) {
      const err = e as Error;
      const code = err.message.startsWith('out_of_stock')
        ? 'UCP_OUT_OF_STOCK'
        : err.message.startsWith('unknown product')
        ? 'UCP_UNKNOWN_PRODUCT'
        : 'UCP_BAD_REQUEST';
      res.status(400).json({ messages: [{ type: 'error', code, content: err.message, severity: 'high' }] });
    }
  },
);
