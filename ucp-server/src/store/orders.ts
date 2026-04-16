import type { Order } from '../types/ucp.js';
/** In-memory Order store. Keys by `order.id`. Cleared on process restart. */
class OrderStore {
  private m = new Map<string, Order>();
  put(o: Order) { this.m.set(o.id, o); }
  get(id: string) { return this.m.get(id); }
  clear() { this.m.clear(); }
}
export const orderStore = new OrderStore();
