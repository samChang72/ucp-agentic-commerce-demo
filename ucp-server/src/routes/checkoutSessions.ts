import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireUcpHeaders } from '../middleware/ucpHeaders.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { sessionStore } from '../store/sessions.js';
import { PRODUCTS } from '../data/products.js';
import type { CheckoutSession, LineItem, Total, Order, OrderLineItem } from '../types/ucp.js';
import { assertTransition, IllegalTransitionError } from '../lib/stateMachine.js';
import { hashCheckoutState, verifyCheckoutMandate } from '../lib/checkoutMandate.js';
import { verifyPaymentMandate } from '../lib/paymentMandate.js';
import { orderStore } from '../store/orders.js';

const MERCHANT_BASE = process.env.MERCHANT_URL ?? 'http://localhost:3000';

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
  const candidate: CheckoutSession = {
    ...s,
    ...(buyer !== undefined && { buyer }),
    ...(fulfillment !== undefined && { fulfillment }),
    ...(payment !== undefined && { payment }),
  };
  const ready = !!(
    candidate.buyer &&
    candidate.fulfillment?.destinations?.length &&
    candidate.payment?.instruments?.length
  );
  const nextStatus = ready ? 'ready_for_complete' : 'incomplete';
  try {
    assertTransition(candidate.status, nextStatus);
  } catch (e) {
    if (e instanceof IllegalTransitionError) {
      return res.status(409).json({
        messages: [{ type: 'error', code: 'UCP_INVALID_STATE', content: e.message, severity: 'high' }],
      });
    }
    throw e;
  }
  const next: CheckoutSession = { ...candidate, status: nextStatus };
  sessionStore.put(next);
  res.json(next);
});

checkoutSessionsRouter.post(
  '/checkout-sessions/:id/complete',
  requireUcpHeaders,
  idempotencyMiddleware,
  async (req, res) => {
    const id = String(req.params.id);
    const s = sessionStore.get(id);
    if (!s) {
      return res.status(404).json({
        messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'session not found', severity: 'high' }],
      });
    }
    if (s.status !== 'ready_for_complete') {
      return res.status(409).json({
        messages: [{ type: 'error', code: 'UCP_INVALID_STATE', content: `expected ready_for_complete, got ${s.status}`, severity: 'high' }],
      });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({
        messages: [{ type: 'error', code: 'UCP_BAD_REQUEST', content: 'request body must be a JSON object', severity: 'high' }],
      });
    }
    const { ap2, payment, expected_total } = body as {
      ap2?: { checkout_mandate?: string };
      payment?: { instruments?: Array<{ credential?: { token?: string } }> };
      expected_total?: number;
    };

    const total = s.totals.find((t) => t.type === 'total')!.amount;
    if (expected_total !== total) {
      return res.status(400).json({
        messages: [{ type: 'error', code: 'UCP_BAD_REQUEST', content: 'expected_total mismatch', severity: 'high' }],
      });
    }
    if (!ap2?.checkout_mandate) {
      return res.status(400).json({
        messages: [{ type: 'error', code: 'UCP_BAD_REQUEST', content: 'missing ap2.checkout_mandate', severity: 'high' }],
      });
    }
    const token = payment?.instruments?.[0]?.credential?.token;
    if (!token) {
      return res.status(400).json({
        messages: [{ type: 'error', code: 'UCP_BAD_REQUEST', content: 'missing payment mandate token', severity: 'high' }],
      });
    }

    try {
      const stateHash = hashCheckoutState({ id: s.id, total });
      await verifyCheckoutMandate(ap2.checkout_mandate, s.id, stateHash);
      await verifyPaymentMandate(token, s.id, total);

      const orderId = `ord_${randomUUID().slice(0, 8)}`;
      const order: Order = {
        ucp: { version: '1.0' },
        id: orderId,
        checkout_id: s.id,
        permalink_url: `${MERCHANT_BASE}/ecommerce-frontend/#/order/${orderId}`,
        line_items: s.line_items.map<OrderLineItem>((li) => ({
          id: li.id,
          item: li.item,
          quantity: li.quantity,
          totals: li.totals,
          status: 'processing',
        })),
        fulfillment: {
          expectations: [{
            id: 'exp_1',
            line_items: s.line_items.map((li) => li.id),
            method_type: s.fulfillment?.method_type ?? 'shipping',
            destination: s.fulfillment?.destinations?.[0],
            description: 'Standard shipping',
          }],
          events: [],
        },
        adjustments: [],
        currency: s.currency,
        totals: s.totals,
        messages: [{ type: 'info', code: 'ORDER_CREATED', content: 'Order has been placed', severity: 'low' }],
      };
      orderStore.put(order);

      const completed: CheckoutSession = {
        ...s,
        status: 'completed',
        ap2: { checkout_mandate: ap2.checkout_mandate },
        order: { id: orderId, permalink_url: order.permalink_url },
      };
      sessionStore.put(completed);
      return res.json(completed);
    } catch (e) {
      const err = e as Error;
      return res.status(400).json({
        messages: [{ type: 'error', code: 'UCP_MANDATE_INVALID', content: err.message, severity: 'high' }],
      });
    }
  },
);

