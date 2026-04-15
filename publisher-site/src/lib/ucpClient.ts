declare global {
  interface Window {
    __UCP_API__?: string;
  }
}

const UCP_API = window.__UCP_API__ ?? 'http://localhost:3001';
const AGENT_PROFILE = `profile="${location.origin}/profile"`;

function authHeaders(idem?: string): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'UCP-Agent': AGENT_PROFILE,
    'Request-Id': crypto.randomUUID(),
  };
  if (idem) h['Idempotency-Key'] = idem;
  return h;
}

async function parseError(r: Response, op: string): Promise<never> {
  let body: unknown;
  try {
    body = await r.json();
  } catch {
    body = await r.text().catch(() => '');
  }
  const err = new Error(`${op} ${r.status}`);
  (err as Error & { status?: number; body?: unknown }).status = r.status;
  (err as Error & { status?: number; body?: unknown }).body = body;
  throw err;
}

export interface LineItemInput {
  item: { id: string };
  quantity: { original: number; total: number; fulfilled: number };
}

export interface CheckoutSession {
  id: string;
  currency: string;
  line_items: LineItemInput[];
  totals: Array<{ type: string; amount: number }>;
  state: string;
  [k: string]: unknown;
}

export async function createSession(productId: string): Promise<CheckoutSession> {
  const r = await fetch(`${UCP_API}/checkout-sessions`, {
    method: 'POST',
    headers: authHeaders(crypto.randomUUID()),
    body: JSON.stringify({
      currency: 'TWD',
      line_items: [
        {
          item: { id: productId },
          quantity: { original: 1, total: 1, fulfilled: 0 },
        },
      ],
    }),
  });
  if (!r.ok) return parseError(r, 'createSession');
  return r.json();
}

export async function updateSession(
  id: string,
  data: Record<string, unknown>
): Promise<CheckoutSession> {
  const r = await fetch(`${UCP_API}/checkout-sessions/${id}`, {
    method: 'PUT',
    headers: authHeaders(crypto.randomUUID()),
    body: JSON.stringify(data),
  });
  if (!r.ok) return parseError(r, 'updateSession');
  return r.json();
}

export async function completeSession(
  id: string,
  body: Record<string, unknown>
): Promise<CheckoutSession & { order_id?: string }> {
  const r = await fetch(`${UCP_API}/checkout-sessions/${id}/complete`, {
    method: 'POST',
    headers: authHeaders(crypto.randomUUID()),
    body: JSON.stringify(body),
  });
  if (!r.ok) return parseError(r, 'completeSession');
  return r.json();
}

export interface CatalogProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  image?: string;
  [k: string]: unknown;
}

export async function getCatalog(): Promise<CatalogProduct[]> {
  const r = await fetch(`${UCP_API}/catalog`, { headers: authHeaders() });
  if (!r.ok) return parseError(r, 'getCatalog');
  const body = (await r.json()) as { products: CatalogProduct[] };
  return body.products;
}

export const __ucpApi = UCP_API;
