/**
 * Mandate handling for the publisher-side SDK.
 *
 * ADR (2026-04-15):
 * In a real UCP deployment the buyer's wallet owns the signing key and the
 * merchant / UCP server trusts an external key resolver (DID / JWKS). In this
 * demo the ucp-server verifies mandates against its own ES256 key
 * (see ucp-server/src/lib/jwt.ts), so a browser-generated key would never
 * verify.
 *
 * Decision: the SDK requests signed mandates from a demo-only endpoint on
 * ucp-server (`POST /internal/demo-sign-mandate/:id`, NODE_ENV !== production).
 * The endpoint signs with the server's key so end-to-end verification works.
 */

declare global {
  interface Window {
    __UCP_API__?: string;
  }
}

const UCP_API = window.__UCP_API__ ?? 'http://localhost:3001';

export interface MandateBundle {
  checkout_mandate: string;
  payment_mandate: string;
  total: number;
}

export async function requestMandates(sessionId: string): Promise<MandateBundle> {
  const r = await fetch(`${UCP_API}/internal/demo-sign-mandate/${sessionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'UCP-Agent': `profile="${location.origin}/profile"`,
      'Request-Id': crypto.randomUUID(),
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: '{}',
  });
  if (!r.ok) {
    let body: unknown;
    try {
      body = await r.json();
    } catch {
      body = await r.text().catch(() => '');
    }
    const err = new Error(`requestMandates ${r.status}`);
    (err as Error & { status?: number; body?: unknown }).status = r.status;
    (err as Error & { status?: number; body?: unknown }).body = body;
    throw err;
  }
  return r.json() as Promise<MandateBundle>;
}
