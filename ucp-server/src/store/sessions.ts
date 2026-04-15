import type { CheckoutSession } from '../types/ucp.js';

/** In-memory CheckoutSession store. Keys by `session.id`. Cleared on process restart. */
class SessionStore {
  private m = new Map<string, CheckoutSession>();
  put(s: CheckoutSession) { this.m.set(s.id, s); }
  get(id: string) { return this.m.get(id); }
  delete(id: string) { this.m.delete(id); }
  clear() { this.m.clear(); }
  all() { return [...this.m.values()]; }
}

export const sessionStore = new SessionStore();
