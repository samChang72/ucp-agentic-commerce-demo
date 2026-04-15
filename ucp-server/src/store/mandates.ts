// Tracks used payment mandate jti to prevent replay
class MandateStore {
  private used = new Set<string>();
  markUsed(jti: string) { this.used.add(jti); }
  isUsed(jti: string) { return this.used.has(jti); }
  clear() { this.used.clear(); }
}
export const mandateStore = new MandateStore();
