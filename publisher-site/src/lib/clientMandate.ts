/**
 * Mandate handling for the publisher-side SDK.
 *
 * ADR (2026-04-15):
 * The original plan (Task 24) proposed client-side signing of checkout and
 * payment mandates using jose + a freshly generated ES256 keypair. In a real
 * UCP deployment the buyer's wallet owns the signing key and the merchant /
 * UCP server trusts an external key resolver (DID / JWKS).
 *
 * In this demo ucp-server verifies mandates against its OWN ES256 key (see
 * ucp-server/src/lib/jwt.ts). A browser-generated key would never verify.
 *
 * Decision: the SDK requests signed mandates from a demo-only endpoint on
 * ucp-server (`POST /internal/demo-sign-mandate/:id`, dev env only). That
 * endpoint signs with the server's key so verification succeeds end-to-end.
 *
 * Task 25 adds the endpoint and fills in `requestMandates` below. This file
 * exists so imports wire up cleanly ahead of that change.
 */

export interface MandateBundle {
  checkout_mandate: string;
  payment_mandate: string;
  total: number;
}

export async function requestMandates(_sessionId: string): Promise<MandateBundle> {
  throw new Error(
    'requestMandates: not implemented — Task 25 wires this to /internal/demo-sign-mandate'
  );
}
