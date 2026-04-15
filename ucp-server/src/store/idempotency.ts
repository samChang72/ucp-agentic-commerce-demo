interface Entry { body: unknown; status: number; ts: number; }
const TTL_MS = 24 * 60 * 60 * 1000;
/** In-memory Idempotency-Key cache. Opaque key (Idempotency-Key header). TTL 24h, lazy-expire on read. */
class IdemStore {
  private m = new Map<string, Entry>();
  put(key: string, status: number, body: unknown) {
    this.m.set(key, { body, status, ts: Date.now() });
  }
  get(key: string): Entry | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (Date.now() - e.ts > TTL_MS) { this.m.delete(key); return undefined; }
    return e;
  }
  clear() { this.m.clear(); }
}
export const idemStore = new IdemStore();
