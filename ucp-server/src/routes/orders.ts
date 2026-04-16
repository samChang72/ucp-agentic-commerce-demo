import { Router } from 'express';
import { requireUcpHeaders } from '../middleware/ucpHeaders.js';
import { orderStore } from '../store/orders.js';

export const ordersRouter = Router();

ordersRouter.get('/orders/:id', requireUcpHeaders, (req, res) => {
  const o = orderStore.get(String(req.params.id));
  if (!o) {
    return res.status(404).json({
      messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'order not found', severity: 'high' }],
    });
  }
  res.json(o);
});
