# UCP Agentic Commerce Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立符合 UCP 官方規格（90% 擬真）的三服務端到端示範系統：ecommerce-frontend（Merchant）+ ucp-server（UCP API）+ publisher-site（第三方媒體站），驗證 Agentic Commerce 在開放網路上的技術可行性。

**Architecture:** 三個獨立服務以不同 port 模擬跨域。ucp-server 提供官方 `/checkout-sessions` REST 端點（TypeScript + Express + in-memory store + ES256 JWT）；publisher-site 嵌入 Shadow DOM 廣告 SDK，跨域呼叫 ucp-server 完成 inline checkout；ecommerce-frontend（既有 Vue 3）加訂單查詢頁與 Schema.org JSON-LD。三服務皆可部署至 Cloud Run。

**Tech Stack:** Node 20, TypeScript, Express 5, jose (ES256 JWT), Vite, Vue 3 (既有), Playwright, Vitest, Docker (nginx + distroless Node), Cloud Run

**Design doc:** `./2026-04-15-ucp-agentic-commerce-demo-design.md`
**Jira ticket:** [FRON-5348](https://guoshi.atlassian.net/browse/FRON-5348)

---

## ⚠️ 路徑覆寫（2026-04-15 新增）

本計畫原寫作時假設三服務平鋪於 `/Users/sam/project/`。實際執行時**新增 umbrella 資料夾**以隔離 demo 工作：

| 計畫文字 | 實際路徑 |
|---|---|
| `/Users/sam/project/ucp-server/` | `/Users/sam/project/ucp-agentic-commerce-demo/ucp-server/` |
| `/Users/sam/project/publisher-site/` | `/Users/sam/project/ucp-agentic-commerce-demo/publisher-site/` |
| `/Users/sam/project/docker-compose.yml` | `/Users/sam/project/ucp-agentic-commerce-demo/docker-compose.yml` |
| `/Users/sam/project/ecommerce-frontend/` | **不變**（維持既有位置與 GitHub Pages 部署） |

umbrella 已 `git init`（2026-04-15），三服務中的 `ucp-server` 與 `publisher-site` 共用這個 umbrella repo；ecommerce-frontend 仍用自己的 repo。docker-compose 以相對路徑 `../ecommerce-frontend/` 參照既有專案。

所有 task 內 `git init`（task 1、task 21）**略過**，改為 `git add` 至 umbrella repo。第一次 commit 前先在 umbrella 建立 `.gitignore`（包含 `*/node_modules/`、`*/dist/`、`*/keys/`）。

---

## 里程碑總覽

| M | 範圍 | 任務數 | 估時 |
|---|---|---:|---:|
| M1 | ucp-server 骨架 + middleware + state machine + store | 10 | 24h |
| M2 | ucp-server 6 端點 + CheckoutMandate + PaymentMandate | 10 | 30h |
| M3 | publisher-site 文章頁 + SDK + Shadow DOM + inline checkout | 9 | 24h |
| M4 | ecommerce-frontend OrderLookupPage + JSON-LD + Dockerfile | 5 | 12h |
| M5 | 三服務聯調 + Playwright E2E + Contract tests | 5 | 18h |
| M6 | README、OpenAPI、Cloud Run 部署說明 | 3 | 12h |

---

# M1：ucp-server 骨架

## Task 1：初始化 ucp-server 專案

**Files:**
- Create: `ucp-server/package.json`
- Create: `ucp-server/tsconfig.json`
- Create: `ucp-server/.gitignore`
- Create: `ucp-server/vitest.config.ts`

**Step 1：建立目錄並初始化**

```bash
mkdir -p /Users/sam/project/ucp-server && cd /Users/sam/project/ucp-server
git init
npm init -y
```

**Step 2：安裝依賴**

```bash
npm install express@^5 cors jose uuid
npm install -D typescript @types/node @types/express @types/cors @types/uuid tsx vitest supertest @types/supertest
```

**Step 3：寫入 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**Step 4：更新 package.json scripts**

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 5：.gitignore**

```
node_modules/
dist/
keys/
.env
*.log
```

**Step 6：Commit**

```bash
git add . && git commit -m "chore: init ucp-server with TypeScript + Express 5"
```

---

## Task 2：UCP 型別定義

**Files:**
- Create: `ucp-server/src/types/ucp.ts`

**Step 1：定義 Checkout Session、Order、Mandate 型別**

```typescript
// src/types/ucp.ts
export type CheckoutStatus = 'incomplete' | 'ready_for_complete' | 'completed' | 'canceled';

export interface Quantity {
  original: number;
  total: number;
  fulfilled: number;
}

export interface Total {
  type: 'subtotal' | 'tax' | 'shipping' | 'total';
  amount: number;      // minor units (NT$ uses whole integers)
  currency: string;
}

export interface LineItem {
  id: string;
  item: { id: string; title: string; price: number; image_url?: string };
  quantity: Quantity;
  totals: Total[];
}

export interface Buyer {
  email: string;
  first_name: string;
  last_name: string;
}

export interface PostalAddress {
  recipient: string;
  line1: string;
  city: string;
  postal_code: string;
  country: string;
}

export interface PaymentInstrument {
  handler_id: string;
  type: 'card' | 'wallet';
  display?: { brand?: string; last4?: string };
  credential?: { token: string };
  billing_address?: PostalAddress;
}

export interface Message {
  type: 'info' | 'warning' | 'error';
  code: string;
  content: string;
  path?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface CheckoutSession {
  ucp: { version: '1.0'; capabilities: string[]; payment_handlers: string[] };
  id: string;
  status: CheckoutStatus;
  currency: string;
  line_items: LineItem[];
  buyer?: Buyer;
  totals: Total[];
  fulfillment?: { destinations?: PostalAddress[]; method_type?: string };
  payment?: { instruments: PaymentInstrument[] };
  messages: Message[];
  links: { terms_of_service?: string };
  order?: { id: string; permalink_url: string };
  // mandate storage
  ap2?: { checkout_mandate?: string };
  // internal
  _idempotency_key?: string;
  _created_at: string;
}

export interface OrderLineItem {
  id: string;
  item: LineItem['item'];
  quantity: Quantity;
  totals: Total[];
  status: 'processing' | 'partial' | 'fulfilled' | 'removed';
  parent_id?: string;
}

export interface FulfillmentEvent {
  id: string;
  occurred_at: string;
  type: 'shipped' | 'delivered' | 'return' | 'cancel';
  line_items: { id: string; quantity: number }[];
  tracking_number?: string;
  tracking_url?: string;
  carrier?: string;
  description?: string;
}

export interface Order {
  ucp: { version: '1.0' };
  id: string;
  label?: string;
  checkout_id: string;
  permalink_url: string;
  line_items: OrderLineItem[];
  fulfillment: {
    expectations: Array<{
      id: string;
      line_items: string[];
      method_type: string;
      destination?: PostalAddress;
      description?: string;
      fulfillable_on?: string;
    }>;
    events: FulfillmentEvent[];
  };
  adjustments: unknown[];
  currency: string;
  totals: Total[];
  messages: Message[];
}
```

**Step 2：Commit**

```bash
git add src/types/ucp.ts && git commit -m "feat(types): add UCP core types (CheckoutSession, Order, Mandate)"
```

---

## Task 3：in-memory store

**Files:**
- Create: `ucp-server/src/store/sessions.ts`
- Create: `ucp-server/src/store/orders.ts`
- Create: `ucp-server/src/store/idempotency.ts`
- Create: `ucp-server/src/store/mandates.ts`
- Test: `ucp-server/src/store/sessions.test.ts`

**Step 1：寫 sessions store 測試**

```typescript
// src/store/sessions.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { sessionStore } from './sessions.js';
import type { CheckoutSession } from '../types/ucp.js';

describe('sessionStore', () => {
  beforeEach(() => sessionStore.clear());

  it('put & get round-trips the session', () => {
    const s: CheckoutSession = {
      ucp: { version: '1.0', capabilities: [], payment_handlers: ['google-pay-mock'] },
      id: 'chk_1', status: 'incomplete', currency: 'TWD',
      line_items: [], totals: [], messages: [], links: {},
      _created_at: new Date().toISOString(),
    };
    sessionStore.put(s);
    expect(sessionStore.get('chk_1')).toEqual(s);
  });

  it('returns undefined for missing id', () => {
    expect(sessionStore.get('nope')).toBeUndefined();
  });
});
```

**Step 2：Run test — 應失敗**

```bash
cd /Users/sam/project/ucp-server && npm test -- sessions
```

Expected: FAIL（module not found）

**Step 3：實作 sessions.ts**

```typescript
// src/store/sessions.ts
import type { CheckoutSession } from '../types/ucp.js';

class SessionStore {
  private m = new Map<string, CheckoutSession>();
  put(s: CheckoutSession) { this.m.set(s.id, s); }
  get(id: string) { return this.m.get(id); }
  delete(id: string) { this.m.delete(id); }
  clear() { this.m.clear(); }
  all() { return [...this.m.values()]; }
}

export const sessionStore = new SessionStore();
```

**Step 4：同樣方式實作 orders / idempotency / mandates**

```typescript
// src/store/orders.ts
import type { Order } from '../types/ucp.js';
class OrderStore {
  private m = new Map<string, Order>();
  put(o: Order) { this.m.set(o.id, o); }
  get(id: string) { return this.m.get(id); }
  clear() { this.m.clear(); }
}
export const orderStore = new OrderStore();
```

```typescript
// src/store/idempotency.ts
interface Entry { body: unknown; status: number; ts: number; }
const TTL_MS = 24 * 60 * 60 * 1000;
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
```

```typescript
// src/store/mandates.ts
// Tracks used payment mandate jti to prevent replay
class MandateStore {
  private used = new Set<string>();
  markUsed(jti: string) { this.used.add(jti); }
  isUsed(jti: string) { return this.used.has(jti); }
  clear() { this.used.clear(); }
}
export const mandateStore = new MandateStore();
```

**Step 5：Run tests — 應通過**

```bash
npm test
```

**Step 6：Commit**

```bash
git add src/store/ && git commit -m "feat(store): add in-memory sessions/orders/idempotency/mandates stores"
```

---

## Task 4：JWT lib（ES256）

**Files:**
- Create: `ucp-server/src/lib/jwt.ts`
- Test: `ucp-server/src/lib/jwt.test.ts`

**Step 1：寫測試**

```typescript
// src/lib/jwt.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { getKeyPair, signJwt, verifyJwt } from './jwt.js';

describe('jwt ES256', () => {
  beforeAll(async () => { await getKeyPair(); });

  it('signs and verifies a payload', async () => {
    const token = await signJwt({ sub: 'chk_1' }, { aud: 'merchant', exp: 60 });
    const { payload } = await verifyJwt(token, 'merchant');
    expect(payload.sub).toBe('chk_1');
    expect(payload.aud).toBe('merchant');
  });

  it('rejects wrong audience', async () => {
    const token = await signJwt({ sub: 'chk_1' }, { aud: 'merchant', exp: 60 });
    await expect(verifyJwt(token, 'other')).rejects.toThrow();
  });

  it('rejects expired token', async () => {
    const token = await signJwt({ sub: 'chk_1' }, { aud: 'merchant', exp: -1 });
    await expect(verifyJwt(token, 'merchant')).rejects.toThrow();
  });
});
```

**Step 2：實作 jwt.ts**

```typescript
// src/lib/jwt.ts
import { SignJWT, jwtVerify, generateKeyPair, exportJWK, importJWK, type JWK } from 'jose';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const KEY_DIR = './keys';
const PRIV_PATH = `${KEY_DIR}/ucp-server-ec-priv.json`;
const PUB_PATH = `${KEY_DIR}/ucp-server-ec-pub.json`;
const ISS = process.env.UCP_ISSUER ?? 'http://localhost:3001';

let cachedPriv: CryptoKey | undefined;
let cachedPub: CryptoKey | undefined;
let cachedPubJwk: JWK | undefined;

export async function getKeyPair() {
  if (cachedPriv && cachedPub) return { priv: cachedPriv, pub: cachedPub };
  if (!existsSync(KEY_DIR)) await mkdir(KEY_DIR, { recursive: true });
  if (existsSync(PRIV_PATH) && existsSync(PUB_PATH)) {
    const priv = JSON.parse(await readFile(PRIV_PATH, 'utf8')) as JWK;
    const pub = JSON.parse(await readFile(PUB_PATH, 'utf8')) as JWK;
    cachedPriv = (await importJWK(priv, 'ES256')) as CryptoKey;
    cachedPub = (await importJWK(pub, 'ES256')) as CryptoKey;
    cachedPubJwk = pub;
  } else {
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    const privJwk = await exportJWK(privateKey);
    const pubJwk = await exportJWK(publicKey);
    privJwk.alg = pubJwk.alg = 'ES256';
    privJwk.kid = pubJwk.kid = 'ucp-server-key-1';
    await writeFile(PRIV_PATH, JSON.stringify(privJwk, null, 2));
    await writeFile(PUB_PATH, JSON.stringify(pubJwk, null, 2));
    cachedPriv = privateKey;
    cachedPub = publicKey;
    cachedPubJwk = pubJwk;
  }
  return { priv: cachedPriv!, pub: cachedPub! };
}

export async function getPublicJwk() {
  await getKeyPair();
  return cachedPubJwk!;
}

export async function signJwt(payload: Record<string, unknown>, opts: { aud: string; exp: number; sub?: string }) {
  const { priv } = await getKeyPair();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'ucp-server-key-1', typ: 'JWT' })
    .setIssuer(ISS)
    .setAudience(opts.aud)
    .setIssuedAt()
    .setExpirationTime(`${opts.exp}s`)
    .setJti(randomUUID())
    .sign(priv);
}

export async function verifyJwt(token: string, expectedAud: string) {
  const { pub } = await getKeyPair();
  return jwtVerify(token, pub, { issuer: ISS, audience: expectedAud });
}
```

**Step 3：Run tests**

```bash
npm test -- jwt
```

Expected: 3 tests pass

**Step 4：Commit**

```bash
git add src/lib/jwt.ts src/lib/jwt.test.ts && git commit -m "feat(lib): add ES256 JWT sign/verify with persisted JWK"
```

---

## Task 5：State machine

**Files:**
- Create: `ucp-server/src/lib/stateMachine.ts`
- Test: `ucp-server/src/lib/stateMachine.test.ts`

**Step 1：寫測試**

```typescript
// src/lib/stateMachine.test.ts
import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition } from './stateMachine.js';

describe('checkout state machine', () => {
  it('allows incomplete → ready_for_complete', () => {
    expect(canTransition('incomplete', 'ready_for_complete')).toBe(true);
  });

  it('allows ready_for_complete → completed', () => {
    expect(canTransition('ready_for_complete', 'completed')).toBe(true);
  });

  it('allows incomplete → canceled and ready_for_complete → canceled', () => {
    expect(canTransition('incomplete', 'canceled')).toBe(true);
    expect(canTransition('ready_for_complete', 'canceled')).toBe(true);
  });

  it('rejects completed → anything', () => {
    expect(canTransition('completed', 'canceled')).toBe(false);
    expect(canTransition('completed', 'ready_for_complete')).toBe(false);
  });

  it('rejects incomplete → completed (must go through ready_for_complete)', () => {
    expect(canTransition('incomplete', 'completed')).toBe(false);
  });

  it('assertTransition throws on illegal', () => {
    expect(() => assertTransition('completed', 'canceled')).toThrow(/illegal/i);
  });
});
```

**Step 2：實作**

```typescript
// src/lib/stateMachine.ts
import type { CheckoutStatus } from '../types/ucp.js';

const ALLOWED: Record<CheckoutStatus, CheckoutStatus[]> = {
  incomplete: ['incomplete', 'ready_for_complete', 'canceled'],
  ready_for_complete: ['ready_for_complete', 'incomplete', 'completed', 'canceled'],
  completed: [],
  canceled: [],
};

export function canTransition(from: CheckoutStatus, to: CheckoutStatus) {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: CheckoutStatus, to: CheckoutStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`illegal transition ${from} → ${to}`);
  }
}
```

**Step 3：Run tests & commit**

```bash
npm test -- stateMachine
git add src/lib/stateMachine.ts src/lib/stateMachine.test.ts
git commit -m "feat(lib): add checkout state machine"
```

---

## Task 6：UCP headers middleware

**Files:**
- Create: `ucp-server/src/middleware/ucpHeaders.ts`
- Test: `ucp-server/src/middleware/ucpHeaders.test.ts`

**Step 1：寫測試**

```typescript
// src/middleware/ucpHeaders.test.ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireUcpHeaders } from './ucpHeaders.js';

const app = express();
app.get('/x', requireUcpHeaders, (_req, res) => res.json({ ok: true }));

describe('requireUcpHeaders', () => {
  it('rejects missing UCP-Agent', async () => {
    const r = await request(app).get('/x').set('Idempotency-Key', 'a').set('Request-Id', 'b');
    expect(r.status).toBe(400);
    expect(r.body.messages[0].code).toBe('UCP_MISSING_HEADER');
  });

  it('rejects missing Idempotency-Key on non-GET', async () => {
    const app2 = express();
    app2.post('/x', requireUcpHeaders, (_req, res) => res.json({ ok: true }));
    const r = await request(app2).post('/x')
      .set('UCP-Agent', 'profile="http://x/p"')
      .set('Request-Id', 'b');
    expect(r.status).toBe(400);
  });

  it('allows GET without Idempotency-Key', async () => {
    const r = await request(app).get('/x')
      .set('UCP-Agent', 'profile="http://x/p"')
      .set('Request-Id', 'r');
    expect(r.status).toBe(200);
  });
});
```

**Step 2：實作**

```typescript
// src/middleware/ucpHeaders.ts
import type { Request, Response, NextFunction } from 'express';

function reject(res: Response, code: string, content: string) {
  res.status(400).json({ messages: [{ type: 'error', code, content, severity: 'high' }] });
}

export function requireUcpHeaders(req: Request, res: Response, next: NextFunction) {
  const ucpAgent = req.header('UCP-Agent');
  const requestId = req.header('Request-Id');
  if (!ucpAgent) return reject(res, 'UCP_MISSING_HEADER', 'UCP-Agent required');
  if (!/^profile="https?:\/\/[^"]+"/.test(ucpAgent))
    return reject(res, 'UCP_INVALID_HEADER', 'UCP-Agent must be profile="<url>"');
  if (!requestId) return reject(res, 'UCP_MISSING_HEADER', 'Request-Id required');

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const idem = req.header('Idempotency-Key');
    if (!idem) return reject(res, 'UCP_MISSING_HEADER', 'Idempotency-Key required for mutations');
  }
  next();
}
```

**Step 3：Run tests & commit**

```bash
npm test -- ucpHeaders
git add src/middleware/ucpHeaders.ts src/middleware/ucpHeaders.test.ts
git commit -m "feat(mw): require UCP-Agent, Idempotency-Key, Request-Id headers"
```

---

## Task 7：CORS middleware

**Files:**
- Create: `ucp-server/src/middleware/cors.ts`

**Step 1：實作**

```typescript
// src/middleware/cors.ts
import cors from 'cors';

const allowlist = (process.env.UCP_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:3002')
  .split(',').map(s => s.trim());

export const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/postman
    if (allowlist.includes(origin)) return cb(null, true);
    cb(new Error(`origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'UCP-Agent', 'Idempotency-Key', 'Request-Id', 'Content-Digest', 'Signature-Input', 'Signature', 'Authorization'],
  exposedHeaders: ['Request-Id', 'Content-Digest', 'Signature-Input', 'Signature'],
  credentials: false,
});
```

**Step 2：Commit**

```bash
git add src/middleware/cors.ts && git commit -m "feat(mw): add CORS with env-based allowlist"
```

---

## Task 8：idempotency middleware

**Files:**
- Create: `ucp-server/src/middleware/idempotency.ts`
- Test: `ucp-server/src/middleware/idempotency.test.ts`

**Step 1：寫測試**

```typescript
// src/middleware/idempotency.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { idempotencyMiddleware } from './idempotency.js';
import { idemStore } from '../store/idempotency.js';

const app = express();
app.use(express.json());
let counter = 0;
app.post('/x', idempotencyMiddleware, (_req, res) => {
  counter++;
  res.status(201).json({ n: counter });
});

describe('idempotencyMiddleware', () => {
  beforeEach(() => { idemStore.clear(); counter = 0; });

  it('same Idempotency-Key returns cached response', async () => {
    const k = 'key-1';
    const r1 = await request(app).post('/x').set('Idempotency-Key', k).send({});
    const r2 = await request(app).post('/x').set('Idempotency-Key', k).send({});
    expect(r1.body.n).toBe(1);
    expect(r2.body.n).toBe(1); // cached
    expect(counter).toBe(1);
  });

  it('different keys run independently', async () => {
    await request(app).post('/x').set('Idempotency-Key', 'a').send({});
    await request(app).post('/x').set('Idempotency-Key', 'b').send({});
    expect(counter).toBe(2);
  });
});
```

**Step 2：實作**

```typescript
// src/middleware/idempotency.ts
import type { Request, Response, NextFunction } from 'express';
import { idemStore } from '../store/idempotency.js';

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const key = req.header('Idempotency-Key');
  if (!key) return next();
  const cached = idemStore.get(key);
  if (cached) return res.status(cached.status).json(cached.body);

  // Intercept response
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    idemStore.put(key, res.statusCode, body);
    return originalJson(body);
  }) as typeof res.json;

  next();
}
```

**Step 3：Run tests & commit**

```bash
npm test -- idempotency
git add src/middleware/idempotency.ts src/middleware/idempotency.test.ts
git commit -m "feat(mw): cache responses by Idempotency-Key"
```

---

## Task 9：Content-Digest 與 signature producer middleware

**Files:**
- Create: `ucp-server/src/middleware/signature.ts`

**Step 1：實作（只產出 header，不驗證 request）**

```typescript
// src/middleware/signature.ts
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { signJwt } from '../lib/jwt.js';

export function signatureProducer(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const bodyStr = JSON.stringify(body);
    const digest = createHash('sha256').update(bodyStr).digest('base64');
    res.setHeader('Content-Digest', `sha-256=:${digest}:`);

    // Minimal RFC 9421-style Signature-Input (demo, not full impl)
    const created = Math.floor(Date.now() / 1000);
    res.setHeader('Signature-Input', `sig1=("@method" "@path" "content-digest");created=${created};keyid="ucp-server-key-1";alg="ecdsa-p256-sha256"`);
    // For demo: produce a detached JWS over @method + @path + content-digest
    signJwt(
      { method: req.method, path: req.path, digest },
      { aud: 'client', exp: 60 }
    ).then(jws => {
      res.setHeader('Signature', `sig1=:${Buffer.from(jws).toString('base64')}:`);
      originalJson(body);
    }).catch(() => originalJson(body));
    return res;
  }) as typeof res.json;
  next();
}
```

**Step 2：Commit**

```bash
git add src/middleware/signature.ts
git commit -m "feat(mw): produce Content-Digest + Signature-Input + Signature response headers"
```

---

## Task 10：Express app bootstrap

**Files:**
- Create: `ucp-server/src/index.ts`
- Create: `ucp-server/src/data/products.ts`
- Create: `ucp-server/src/routes/health.ts`

**Step 1：seed products**

```typescript
// src/data/products.ts
export const PRODUCTS = [
  { id: 'sony-wh1000xm6', title: 'Sony WH-1000XM6', price: 7990, image_url: '/image/sony.jpg', in_stock: true, rating: 4.7, review_count: 2340 },
  { id: 'bose-qc-ultra', title: 'Bose QC Ultra', price: 11900, image_url: '/image/bose.jpg', in_stock: true, rating: 4.6, review_count: 1520 },
  { id: 'apple-airpodsmax2', title: 'Apple AirPods Max 2', price: 18900, image_url: '/image/airpods.jpg', in_stock: false, rating: 4.8, review_count: 980 },
];
```

**Step 2：health route**

```typescript
// src/routes/health.ts
import { Router } from 'express';
import { getPublicJwk } from '../lib/jwt.js';

export const healthRouter = Router();
healthRouter.get('/healthz', (_req, res) => res.json({ ok: true }));
healthRouter.get('/.well-known/jwks.json', async (_req, res) => {
  const jwk = await getPublicJwk();
  res.json({ keys: [jwk] });
});
```

**Step 3：main entry**

```typescript
// src/index.ts
import express from 'express';
import { randomUUID } from 'node:crypto';
import { corsMiddleware } from './middleware/cors.js';
import { healthRouter } from './routes/health.js';

const app = express();
app.use(corsMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const rid = req.header('Request-Id') ?? randomUUID();
  res.setHeader('Request-Id', rid);
  next();
});
app.use(healthRouter);

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`ucp-server listening on :${PORT}`));
```

**Step 4：啟動驗證**

```bash
npm run dev &
sleep 1
curl -s http://localhost:3001/healthz
curl -s http://localhost:3001/.well-known/jwks.json | head -c 200
kill %1
```

Expected: `{"ok":true}` 與 JWKS 內含一支 ES256 公鑰

**Step 5：Commit**

```bash
git add src/index.ts src/data/products.ts src/routes/health.ts
git commit -m "feat: bootstrap express app with health + jwks endpoints"
```

---

# M2：UCP 端點 + Mandate

## Task 11：CheckoutMandate 與 PaymentMandate libs

**Files:**
- Create: `ucp-server/src/lib/checkoutMandate.ts`
- Create: `ucp-server/src/lib/paymentMandate.ts`
- Test: `ucp-server/src/lib/mandates.test.ts`

**Step 1：寫測試**

```typescript
// src/lib/mandates.test.ts
import { describe, it, expect } from 'vitest';
import { signCheckoutMandate, verifyCheckoutMandate, hashCheckoutState } from './checkoutMandate.js';
import { signPaymentMandate, verifyPaymentMandate } from './paymentMandate.js';

describe('CheckoutMandate', () => {
  it('signs state hash and verifies', async () => {
    const hash = hashCheckoutState({ id: 'chk_1', total: 8390 });
    const jws = await signCheckoutMandate(hash, 'chk_1');
    const r = await verifyCheckoutMandate(jws, 'chk_1', hash);
    expect(r.ok).toBe(true);
  });

  it('rejects tampered hash', async () => {
    const jws = await signCheckoutMandate('abc', 'chk_1');
    await expect(verifyCheckoutMandate(jws, 'chk_1', 'xyz')).rejects.toThrow();
  });
});

describe('PaymentMandate', () => {
  it('signs and produces SD-JWT-like token with trailing ~', async () => {
    const token = await signPaymentMandate({ checkout_id: 'chk_1', amount: 8390, currency: 'TWD' });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+~$/);
  });

  it('verifies fresh and rejects replayed', async () => {
    const token = await signPaymentMandate({ checkout_id: 'chk_1', amount: 8390, currency: 'TWD' });
    const r = await verifyPaymentMandate(token, 'chk_1', 8390);
    expect(r.ok).toBe(true);
    await expect(verifyPaymentMandate(token, 'chk_1', 8390)).rejects.toThrow(/replay/i);
  });
});
```

**Step 2：實作 checkoutMandate.ts**

```typescript
// src/lib/checkoutMandate.ts
import { createHash } from 'node:crypto';
import { signJwt, verifyJwt } from './jwt.js';

export function hashCheckoutState(state: unknown): string {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

export async function signCheckoutMandate(stateHash: string, checkoutId: string) {
  return signJwt({ checkout_hash: stateHash, checkout_id: checkoutId }, { aud: 'merchant', exp: 300 });
}

export async function verifyCheckoutMandate(jws: string, checkoutId: string, expectedHash: string) {
  const { payload } = await verifyJwt(jws, 'merchant');
  if (payload.checkout_id !== checkoutId) throw new Error('checkout_id mismatch');
  if (payload.checkout_hash !== expectedHash) throw new Error('checkout_hash mismatch (tampered)');
  return { ok: true, payload };
}
```

**Step 3：實作 paymentMandate.ts**

```typescript
// src/lib/paymentMandate.ts
import { signJwt, verifyJwt } from './jwt.js';
import { mandateStore } from '../store/mandates.js';

interface PaymentMandateClaims {
  checkout_id: string;
  amount: number;
  currency: string;
}

export async function signPaymentMandate(claims: PaymentMandateClaims) {
  const jwt = await signJwt(claims, { aud: 'merchant', exp: 300 });
  // SD-JWT-VC-shaped: append trailing ~ (empty disclosures for demo)
  return `${jwt}~`;
}

export async function verifyPaymentMandate(token: string, expectedCheckoutId: string, expectedAmount: number) {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(~[A-Za-z0-9_-]*)*$/.test(token)) {
    throw new Error('invalid SD-JWT-VC shape');
  }
  const jwt = token.split('~')[0];
  const { payload } = await verifyJwt(jwt, 'merchant');
  if (payload.checkout_id !== expectedCheckoutId) throw new Error('checkout_id mismatch');
  if (payload.amount !== expectedAmount) throw new Error('amount mismatch');
  const jti = payload.jti as string;
  if (mandateStore.isUsed(jti)) throw new Error('payment mandate replay detected');
  mandateStore.markUsed(jti);
  return { ok: true, payload };
}
```

**Step 4：Run tests & commit**

```bash
npm test -- mandates
git add src/lib/checkoutMandate.ts src/lib/paymentMandate.ts src/lib/mandates.test.ts
git commit -m "feat(lib): add CheckoutMandate (detached JWS) + PaymentMandate (SD-JWT-VC shape)"
```

---

## Task 12：POST /checkout-sessions

**Files:**
- Create: `ucp-server/src/routes/checkoutSessions.ts`
- Test: `ucp-server/src/routes/checkoutSessions.test.ts`
- Modify: `ucp-server/src/index.ts`

**Step 1：Write test for POST**

```typescript
// src/routes/checkoutSessions.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { sessionStore } from '../store/sessions.js';

const authHeaders = {
  'UCP-Agent': 'profile="http://localhost:3002/profile"',
  'Request-Id': 'req-1',
  'Idempotency-Key': 'idem-1',
};

describe('POST /checkout-sessions', () => {
  beforeEach(() => sessionStore.clear());

  it('creates an incomplete session', async () => {
    const app = buildApp();
    const r = await request(app)
      .post('/checkout-sessions').set(authHeaders)
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('incomplete');
    expect(r.body.id).toMatch(/^chk_/);
    expect(r.body.line_items[0].item.title).toBe('Sony WH-1000XM6');
    expect(r.body.totals.find((t: any) => t.type === 'total').amount).toBeGreaterThan(0);
  });

  it('rejects missing UCP-Agent', async () => {
    const app = buildApp();
    const r = await request(app).post('/checkout-sessions').send({ currency: 'TWD', line_items: [] });
    expect(r.status).toBe(400);
  });

  it('returns cached response on same Idempotency-Key', async () => {
    const app = buildApp();
    const body = { currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] };
    const r1 = await request(app).post('/checkout-sessions').set(authHeaders).send(body);
    const r2 = await request(app).post('/checkout-sessions').set(authHeaders).send(body);
    expect(r1.body.id).toBe(r2.body.id);
  });
});
```

**Step 2：重構 — 抽出 buildApp**

```typescript
// src/app.ts
import express from 'express';
import { randomUUID } from 'node:crypto';
import { corsMiddleware } from './middleware/cors.js';
import { healthRouter } from './routes/health.js';
import { checkoutSessionsRouter } from './routes/checkoutSessions.js';

export function buildApp() {
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.setHeader('Request-Id', req.header('Request-Id') ?? randomUUID());
    next();
  });
  app.use(healthRouter);
  app.use(checkoutSessionsRouter);
  return app;
}
```

```typescript
// src/index.ts (改)
import { buildApp } from './app.js';
const PORT = Number(process.env.PORT ?? 3001);
buildApp().listen(PORT, () => console.log(`ucp-server listening on :${PORT}`));
```

**Step 3：實作 POST route**

```typescript
// src/routes/checkoutSessions.ts
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

function hydrateLineItems(input: { item: { id: string }; quantity: { original: number; total: number; fulfilled: number } }[]): LineItem[] {
  return input.map((li, i) => {
    const p = PRODUCTS.find(x => x.id === li.item.id);
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
  }
);
```

**Step 4：Run tests**

```bash
npm test -- checkoutSessions
```

Expected: 3 tests pass

**Step 5：Commit**

```bash
git add src/app.ts src/index.ts src/routes/checkoutSessions.ts src/routes/checkoutSessions.test.ts
git commit -m "feat(api): POST /checkout-sessions (hydrate line_items, compute totals)"
```

---

## Task 13：GET + PUT /checkout-sessions/:id

**Files:**
- Modify: `ucp-server/src/routes/checkoutSessions.ts`
- Modify: `ucp-server/src/routes/checkoutSessions.test.ts`

**Step 1：Add tests**

```typescript
describe('GET /checkout-sessions/:id', () => {
  it('returns existing session', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions').set(authHeaders)
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).get(`/checkout-sessions/${created.body.id}`).set(authHeaders);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(created.body.id);
  });

  it('returns 404 for unknown id', async () => {
    const app = buildApp();
    const r = await request(app).get('/checkout-sessions/chk_nope').set(authHeaders);
    expect(r.status).toBe(404);
  });
});

describe('PUT /checkout-sessions/:id', () => {
  it('updates buyer + fulfillment + payment → transitions to ready_for_complete', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions').set(authHeaders)
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).put(`/checkout-sessions/${created.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'idem-put-1' })
      .send({
        buyer: { email: 'a@b.c', first_name: 'A', last_name: 'B' },
        fulfillment: { destinations: [{ recipient: 'A B', line1: 'Taipei', city: 'TP', postal_code: '100', country: 'TW' }], method_type: 'shipping' },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet' }] },
      });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ready_for_complete');
  });

  it('stays incomplete when buyer missing', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions').set(authHeaders)
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).put(`/checkout-sessions/${created.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'idem-put-2' })
      .send({ fulfillment: { destinations: [{ recipient: 'A', line1: 'x', city: 'TP', postal_code: '100', country: 'TW' }], method_type: 'shipping' } });
    expect(r.body.status).toBe('incomplete');
  });
});
```

**Step 2：Add routes**

```typescript
// Append to src/routes/checkoutSessions.ts
import { assertTransition } from '../lib/stateMachine.js';

checkoutSessionsRouter.get('/checkout-sessions/:id', requireUcpHeaders, (req, res) => {
  const s = sessionStore.get(req.params.id);
  if (!s) return res.status(404).json({ messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'session not found', severity: 'high' }] });
  res.json(s);
});

checkoutSessionsRouter.put('/checkout-sessions/:id', requireUcpHeaders, idempotencyMiddleware, (req, res) => {
  const s = sessionStore.get(req.params.id);
  if (!s) return res.status(404).json({ messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'session not found', severity: 'high' }] });
  if (s.status === 'completed' || s.status === 'canceled')
    return res.status(409).json({ messages: [{ type: 'error', code: 'UCP_INVALID_STATE', content: `cannot update session in ${s.status}`, severity: 'high' }] });

  const { buyer, fulfillment, payment } = req.body ?? {};
  if (buyer) s.buyer = buyer;
  if (fulfillment) s.fulfillment = fulfillment;
  if (payment) s.payment = payment;

  const ready = !!(s.buyer && s.fulfillment?.destinations?.length && s.payment?.instruments?.length);
  const nextStatus = ready ? 'ready_for_complete' : 'incomplete';
  assertTransition(s.status, nextStatus);
  s.status = nextStatus;
  sessionStore.put(s);
  res.json(s);
});
```

**Step 3：Run tests & commit**

```bash
npm test -- checkoutSessions
git add src/routes/checkoutSessions.ts src/routes/checkoutSessions.test.ts
git commit -m "feat(api): GET + PUT /checkout-sessions/:id with state transitions"
```

---

## Task 14：POST /checkout-sessions/:id/complete

**Files:**
- Modify: `ucp-server/src/routes/checkoutSessions.ts`
- Create: `ucp-server/src/routes/orders.ts`
- Modify: `ucp-server/src/app.ts`

**Step 1：Add tests（繼續於 checkoutSessions.test.ts）**

```typescript
describe('POST /checkout-sessions/:id/complete', () => {
  it('validates mandates and transitions to completed, creates order', async () => {
    const app = buildApp();
    // seed
    const created = await request(app).post('/checkout-sessions').set(authHeaders)
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    await request(app).put(`/checkout-sessions/${created.body.id}`)
      .set({ ...authHeaders, 'Idempotency-Key': 'idem-p' })
      .send({
        buyer: { email: 'a@b.c', first_name: 'A', last_name: 'B' },
        fulfillment: { destinations: [{ recipient: 'A B', line1: 'Taipei', city: 'TP', postal_code: '100', country: 'TW' }], method_type: 'shipping' },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet' }] },
      });

    // Build mandates server-side (for test — real SDK signs with its own key)
    const total = created.body.totals.find((t: any) => t.type === 'total').amount +
                  Math.round(created.body.totals.find((t: any) => t.type === 'subtotal').amount * 0.05);
    const { hashCheckoutState, signCheckoutMandate } = await import('../lib/checkoutMandate.js');
    const { signPaymentMandate } = await import('../lib/paymentMandate.js');
    const stateHash = hashCheckoutState({ id: created.body.id, total });
    const checkoutMandate = await signCheckoutMandate(stateHash, created.body.id);
    const paymentMandate = await signPaymentMandate({ checkout_id: created.body.id, amount: total, currency: 'TWD' });

    const r = await request(app).post(`/checkout-sessions/${created.body.id}/complete`)
      .set({ ...authHeaders, 'Idempotency-Key': 'idem-c' })
      .send({
        ap2: { checkout_mandate: checkoutMandate },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet', credential: { token: paymentMandate } }] },
        expected_total: total,
        signals: { 'dev.ucp.buyer_ip': '127.0.0.1', 'dev.ucp.user_agent': 'test' },
      });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('completed');
    expect(r.body.order.id).toMatch(/^ord_/);
  });

  it('rejects when state not ready_for_complete', async () => {
    const app = buildApp();
    const created = await request(app).post('/checkout-sessions').set(authHeaders)
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).post(`/checkout-sessions/${created.body.id}/complete`)
      .set({ ...authHeaders, 'Idempotency-Key': 'idem-c2' })
      .send({ ap2: { checkout_mandate: 'x' }, payment: { instruments: [] }, expected_total: 0 });
    expect(r.status).toBe(409);
  });
});
```

**Step 2：實作 orders route**

```typescript
// src/routes/orders.ts
import { Router } from 'express';
import { requireUcpHeaders } from '../middleware/ucpHeaders.js';
import { orderStore } from '../store/orders.js';

export const ordersRouter = Router();

ordersRouter.get('/orders/:id', requireUcpHeaders, (req, res) => {
  const o = orderStore.get(req.params.id);
  if (!o) return res.status(404).json({ messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'order not found', severity: 'high' }] });
  res.json(o);
});
```

**Step 3：實作 complete endpoint**

```typescript
// Append to src/routes/checkoutSessions.ts
import { randomUUID } from 'node:crypto';
import { hashCheckoutState, verifyCheckoutMandate } from '../lib/checkoutMandate.js';
import { verifyPaymentMandate } from '../lib/paymentMandate.js';
import { orderStore } from '../store/orders.js';
import type { Order, OrderLineItem } from '../types/ucp.js';

const MERCHANT_BASE = process.env.MERCHANT_URL ?? 'http://localhost:3000';

checkoutSessionsRouter.post('/checkout-sessions/:id/complete', requireUcpHeaders, idempotencyMiddleware, async (req, res) => {
  const s = sessionStore.get(req.params.id);
  if (!s) return res.status(404).json({ messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'session not found', severity: 'high' }] });
  if (s.status !== 'ready_for_complete') return res.status(409).json({ messages: [{ type: 'error', code: 'UCP_INVALID_STATE', content: `expected ready_for_complete, got ${s.status}`, severity: 'high' }] });

  try {
    const { ap2 = {}, payment = {}, expected_total } = req.body ?? {};
    const total = s.totals.find(t => t.type === 'total')!.amount;
    if (expected_total !== total) throw new Error('expected_total mismatch');

    const stateHash = hashCheckoutState({ id: s.id, total });
    await verifyCheckoutMandate(ap2.checkout_mandate, s.id, stateHash);

    const token = payment.instruments?.[0]?.credential?.token;
    if (!token) throw new Error('missing payment mandate');
    await verifyPaymentMandate(token, s.id, total);

    // transition
    s.status = 'completed';
    s.ap2 = { checkout_mandate: ap2.checkout_mandate };
    s.payment = payment;

    // create order
    const orderId = `ord_${randomUUID().slice(0, 8)}`;
    const order: Order = {
      ucp: { version: '1.0' },
      id: orderId,
      checkout_id: s.id,
      permalink_url: `${MERCHANT_BASE}/ecommerce-frontend/#/order/${orderId}`,
      line_items: s.line_items.map<OrderLineItem>(li => ({
        id: li.id, item: li.item, quantity: li.quantity, totals: li.totals, status: 'processing',
      })),
      fulfillment: {
        expectations: [{
          id: 'exp_1',
          line_items: s.line_items.map(li => li.id),
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
    s.order = { id: orderId, permalink_url: order.permalink_url };
    sessionStore.put(s);
    res.json(s);
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ messages: [{ type: 'error', code: 'UCP_MANDATE_INVALID', content: err.message, severity: 'high' }] });
  }
});
```

**Step 4：Wire routers**

```typescript
// src/app.ts（加 ordersRouter）
import { ordersRouter } from './routes/orders.js';
// app.use(ordersRouter);
```

**Step 5：Run tests & commit**

```bash
npm test
git add src/routes/checkoutSessions.ts src/routes/orders.ts src/app.ts src/routes/checkoutSessions.test.ts
git commit -m "feat(api): POST /complete validates mandates, creates Order, transitions to completed"
```

---

## Task 15：POST /checkout-sessions/:id/cancel

**Files:**
- Modify: `ucp-server/src/routes/checkoutSessions.ts`

**Step 1：Test**

```typescript
describe('POST /checkout-sessions/:id/cancel', () => {
  it('cancels incomplete session', async () => {
    const app = buildApp();
    const c = await request(app).post('/checkout-sessions').set(authHeaders)
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const r = await request(app).post(`/checkout-sessions/${c.body.id}/cancel`)
      .set({ ...authHeaders, 'Idempotency-Key': 'idem-cancel' }).send({});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('canceled');
  });

  it('refuses to cancel completed', async () => {
    const app = buildApp();
    const c = await request(app).post('/checkout-sessions').set(authHeaders)
      .send({ currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] });
    const s = sessionStore.get(c.body.id)!; s.status = 'completed'; sessionStore.put(s);
    const r = await request(app).post(`/checkout-sessions/${c.body.id}/cancel`)
      .set({ ...authHeaders, 'Idempotency-Key': 'idem-cancel2' }).send({});
    expect(r.status).toBe(409);
  });
});
```

**Step 2：實作**

```typescript
checkoutSessionsRouter.post('/checkout-sessions/:id/cancel', requireUcpHeaders, idempotencyMiddleware, (req, res) => {
  const s = sessionStore.get(req.params.id);
  if (!s) return res.status(404).json({ messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'session not found', severity: 'high' }] });
  if (s.status === 'completed' || s.status === 'canceled')
    return res.status(409).json({ messages: [{ type: 'error', code: 'UCP_INVALID_STATE', content: `cannot cancel ${s.status}`, severity: 'high' }] });
  s.status = 'canceled';
  sessionStore.put(s);
  res.json(s);
});
```

**Step 3：Commit**

```bash
npm test
git add src/routes/checkoutSessions.ts src/routes/checkoutSessions.test.ts
git commit -m "feat(api): POST /checkout-sessions/:id/cancel"
```

---

## Task 16：GET /catalog（demo-only）

**Files:**
- Create: `ucp-server/src/routes/catalog.ts`
- Modify: `ucp-server/src/app.ts`

**Step 1：實作（輸出 Schema.org Product JSON-LD array）**

```typescript
// src/routes/catalog.ts
import { Router } from 'express';
import { PRODUCTS } from '../data/products.js';

export const catalogRouter = Router();

catalogRouter.get('/catalog', (_req, res) => {
  res.setHeader('X-UCP-Extension', 'demo-catalog');
  res.json({
    note: 'Non-UCP-standard endpoint. Real UCP obtains products via merchant JSON-LD or GMC feed.',
    products: PRODUCTS.map(p => ({
      '@context': 'https://schema.org',
      '@type': 'Product',
      '@id': p.id,
      name: p.title,
      image: p.image_url,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'TWD',
        price: p.price,
        availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.review_count },
    })),
  });
});
```

**Step 2：Wire & smoke test**

```bash
# 掛進 app.ts, 啟動 server, curl
curl -s -H 'UCP-Agent: profile="http://x/p"' -H 'Request-Id: r1' http://localhost:3001/catalog | head -c 300
```

**Step 3：Commit**

```bash
git add src/routes/catalog.ts src/app.ts
git commit -m "feat(api): GET /catalog (demo-only, Schema.org Product)"
```

---

## Task 17：Dockerfile for ucp-server

**Files:**
- Create: `ucp-server/Dockerfile`
- Create: `ucp-server/.dockerignore`

**Step 1：Dockerfile**

```dockerfile
# ucp-server/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

**Step 2：.dockerignore**

```
node_modules
dist
keys
*.log
.git
src/**/*.test.ts
```

**Step 3：Build & smoke**

```bash
docker build -t ucp-server:dev /Users/sam/project/ucp-server
docker run --rm -e UCP_ALLOWED_ORIGINS="http://localhost:3002" -p 8080:8080 ucp-server:dev &
sleep 2; curl -s http://localhost:8080/healthz; kill %1
```

Expected: `{"ok":true}`

**Step 4：Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: Dockerfile for Cloud Run deployment"
```

---

## Task 18：M2 roll-up — 所有端點 smoke test

**Files:**
- Create: `ucp-server/scripts/smoke.sh`

**Step 1：寫 smoke script 跑完整流程**

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="http://localhost:3001"
H_AGENT='UCP-Agent: profile="http://localhost:3002/profile"'
H_RID='Request-Id: smoke-1'
CREATE=$(curl -s -X POST "$BASE/checkout-sessions" \
  -H "$H_AGENT" -H "$H_RID" -H "Idempotency-Key: sm-create" \
  -H "Content-Type: application/json" \
  -d '{"currency":"TWD","line_items":[{"item":{"id":"sony-wh1000xm6"},"quantity":{"original":1,"total":1,"fulfilled":0}}]}')
ID=$(echo "$CREATE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
echo "Created $ID"
curl -s -X PUT "$BASE/checkout-sessions/$ID" \
  -H "$H_AGENT" -H "$H_RID" -H "Idempotency-Key: sm-put" \
  -H "Content-Type: application/json" \
  -d '{"buyer":{"email":"a@b.c","first_name":"A","last_name":"B"},"fulfillment":{"destinations":[{"recipient":"A","line1":"x","city":"TP","postal_code":"100","country":"TW"}],"method_type":"shipping"},"payment":{"instruments":[{"handler_id":"google-pay-mock","type":"wallet"}]}}' | head -c 200
echo
```

**Step 2：Run & verify**

```bash
chmod +x scripts/smoke.sh
npm run dev &
sleep 1; ./scripts/smoke.sh; kill %1
```

**Step 3：Commit**

```bash
git add scripts/smoke.sh
git commit -m "test: add manual smoke script"
```

---

## Task 19：ucp-server public/sdk.js（skeleton）

**Files:**
- Create: `ucp-server/public/sdk.js`
- Modify: `ucp-server/src/app.ts`（提供靜態檔）

**Step 1：serve public dir**

```typescript
// app.ts
import express from 'express';
app.use(express.static('public'));
```

**Step 2：sdk.js 最小版**

```javascript
// ucp-server/public/sdk.js
(function () {
  const UCP_API = window.__UCP_API__ || 'http://localhost:3001';
  window.UcpSdk = {
    async getCatalog() {
      const r = await fetch(`${UCP_API}/catalog`, {
        headers: { 'UCP-Agent': `profile="${location.origin}/profile"`, 'Request-Id': crypto.randomUUID() },
      });
      if (!r.ok) throw new Error('catalog fetch failed');
      return (await r.json()).products;
    },
  };
  document.dispatchEvent(new CustomEvent('ucp-sdk-ready'));
})();
```

**Step 3：Commit**

```bash
git add src/app.ts public/sdk.js
git commit -m "feat(sdk): skeleton SDK served at /sdk.js"
```

---

## Task 20：M2 完成標記

**Step 1：在 `docs/plans/` 內附注 M2 完成**

略（由 executor 於實作中決定）

---

# M3：publisher-site

## Task 21：初始化 publisher-site（Vite + TS）

**Files:**
- Create: `publisher-site/package.json`
- Create: `publisher-site/vite.config.ts`
- Create: `publisher-site/tsconfig.json`
- Create: `publisher-site/index.html`
- Create: `publisher-site/src/main.ts`

**Step 1：init**

```bash
mkdir -p /Users/sam/project/publisher-site && cd /Users/sam/project/publisher-site
git init
npm init -y
npm install -D vite typescript @types/node
```

**Step 2：vite.config.ts**

```typescript
import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 3002, host: 'localhost' },
  preview: { port: 3002, host: '0.0.0.0' },
});
```

**Step 3：package.json scripts**

```json
{ "scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview"
}}
```

**Step 4：tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "lib": ["ES2022", "DOM"], "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

**Step 5：Commit**

```bash
git add . && git commit -m "chore: init publisher-site with Vite + TypeScript"
```

---

## Task 22：文章頁 HTML + CSS

**Files:**
- Create: `publisher-site/index.html`
- Create: `publisher-site/src/styles/article.css`

**Step 1：index.html**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <title>科技媒體 | 2026 最佳降噪耳機評測</title>
  <link rel="stylesheet" href="/src/styles/article.css" />
</head>
<body>
  <header class="site-header">
    <h1>TechReview Taiwan</h1>
  </header>
  <main class="article">
    <h1>2026 最佳降噪耳機評測</h1>
    <p class="byline">2026-04-15 · 編輯部</p>
    <p>在 2026 年，主動降噪技術已進入成熟階段...</p>
    <p>我們測試了目前市面上最受關注的三款耳機...</p>

    <!-- UCP Ad slot -->
    <div id="ad-slot-1" data-ucp-ad slot="sony-wh1000xm6"></div>

    <p>續航力方面，Sony WH-1000XM6 提供 30 小時的播放...</p>
    <p>主動降噪表現上，Bose QC Ultra 在城市噪音環境下...</p>
  </main>
  <script>window.__UCP_API__ = 'http://localhost:3001';</script>
  <script src="http://localhost:3001/sdk.js"></script>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

**Step 2：article.css（簡潔樣式）**

```css
body { font-family: "Noto Sans TC", sans-serif; max-width: 720px; margin: 0 auto; padding: 24px; }
.site-header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 24px; }
.article h1 { font-size: 28px; line-height: 1.4; }
.article p { line-height: 1.8; color: #333; }
.byline { color: #888; font-size: 14px; }
[data-ucp-ad] { margin: 32px 0; min-height: 180px; }
```

**Step 3：Run dev → 看文章頁出現**

```bash
npm run dev &
sleep 1; curl -s http://localhost:3002 | head -c 300; kill %1
```

**Step 4：Commit**

```bash
git add . && git commit -m "feat: tech media article page with ad slot"
```

---

## Task 23：UCP Client 模組

**Files:**
- Create: `publisher-site/src/lib/ucpClient.ts`

**Step 1：實作**

```typescript
// src/lib/ucpClient.ts
const UCP_API = (window as any).__UCP_API__ ?? 'http://localhost:3001';
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

export async function createSession(productId: string) {
  const r = await fetch(`${UCP_API}/checkout-sessions`, {
    method: 'POST',
    headers: authHeaders(crypto.randomUUID()),
    body: JSON.stringify({ currency: 'TWD', line_items: [{ item: { id: productId }, quantity: { original: 1, total: 1, fulfilled: 0 } }] }),
  });
  if (!r.ok) throw new Error(`createSession ${r.status}`);
  return r.json();
}

export async function updateSession(id: string, data: any) {
  const r = await fetch(`${UCP_API}/checkout-sessions/${id}`, {
    method: 'PUT', headers: authHeaders(crypto.randomUUID()), body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`updateSession ${r.status}`);
  return r.json();
}

export async function completeSession(id: string, body: any) {
  const r = await fetch(`${UCP_API}/checkout-sessions/${id}/complete`, {
    method: 'POST', headers: authHeaders(crypto.randomUUID()), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`completeSession ${r.status}`);
  return r.json();
}

export async function getCatalog() {
  const r = await fetch(`${UCP_API}/catalog`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`catalog ${r.status}`);
  return (await r.json()).products;
}
```

**Step 2：Commit**

```bash
git add src/lib/ucpClient.ts
git commit -m "feat(sdk): UCP client (create/update/complete/catalog)"
```

---

## Task 24：Mandate 簽章（client-side）

**Files:**
- Create: `publisher-site/src/lib/clientMandate.ts`

**Step 1：安裝 jose**

```bash
cd /Users/sam/project/publisher-site && npm install jose
```

**Step 2：實作**

```typescript
// src/lib/clientMandate.ts
import { SignJWT, generateKeyPair, exportJWK } from 'jose';

let keypair: { priv: CryptoKey; pub: CryptoKey; jwk: unknown } | null = null;

async function ensureKeypair() {
  if (keypair) return keypair;
  const stored = localStorage.getItem('ucp-sdk-keypair');
  if (stored) {
    // For simplicity, regenerate each page load (demo)
  }
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.alg = 'ES256'; jwk.kid = 'sdk-client-key-1';
  keypair = { priv: privateKey, pub: publicKey, jwk };
  return keypair;
}

async function sign(payload: Record<string, unknown>, aud: string, expSeconds = 300) {
  const { priv } = await ensureKeypair();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'sdk-client-key-1', typ: 'JWT' })
    .setIssuer(location.origin)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(`${expSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(priv);
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function buildCheckoutMandate(sessionId: string, total: number) {
  const hash = await sha256Hex(JSON.stringify({ id: sessionId, total }));
  return sign({ checkout_hash: hash, checkout_id: sessionId }, 'merchant');
}

export async function buildPaymentMandate(sessionId: string, amount: number, currency: string) {
  const jwt = await sign({ checkout_id: sessionId, amount, currency }, 'merchant');
  return `${jwt}~`;
}
```

**重要說明：**
由於 ucp-server 驗證 mandate 用自己的 ES256 公鑰（見 `jwt.ts`），client SDK 簽的 mandate 用 client 自己的 key 無法通過 server 驗證。解法：**改由 server-side sign mandate** 於 demo 情境（實務上是買方錢包簽）。在 executing-plans 時調整為：SDK 呼叫 ucp-server 新增的 `POST /internal/sign-mandate`（demo-only dev endpoint）取得簽好的 mandate。這段在 Task 24 執行時需改動 — 記為 ADR。

**Step 3：Commit**

```bash
git add src/lib/clientMandate.ts package.json package-lock.json
git commit -m "feat(sdk): client mandate builder (TBD: server-side signing ADR)"
```

---

## Task 25：Demo-only server signing endpoint + client 改走此路徑

**Files:**
- Modify: `ucp-server/src/routes/checkoutSessions.ts`（新增 internal endpoint）
- Modify: `publisher-site/src/lib/clientMandate.ts`

**Step 1：ucp-server 加 internal endpoint**

```typescript
// src/routes/checkoutSessions.ts (append)
import { signCheckoutMandate, hashCheckoutState } from '../lib/checkoutMandate.js';
import { signPaymentMandate } from '../lib/paymentMandate.js';

checkoutSessionsRouter.post('/internal/demo-sign-mandate/:id', requireUcpHeaders, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ messages: [{ type: 'error', code: 'DEMO_ONLY', content: 'dev endpoint', severity: 'high' }] });
  const s = sessionStore.get(req.params.id);
  if (!s) return res.status(404).json({ messages: [{ type: 'error', code: 'UCP_NOT_FOUND', content: 'session not found', severity: 'high' }] });
  const total = s.totals.find(t => t.type === 'total')!.amount;
  const hash = hashCheckoutState({ id: s.id, total });
  const checkoutMandate = await signCheckoutMandate(hash, s.id);
  const paymentMandate = await signPaymentMandate({ checkout_id: s.id, amount: total, currency: s.currency });
  res.json({ checkout_mandate: checkoutMandate, payment_mandate: paymentMandate, total });
});
```

**Step 2：client 改為呼叫此 endpoint**

```typescript
// publisher-site/src/lib/clientMandate.ts (replace)
const UCP_API = (window as any).__UCP_API__ ?? 'http://localhost:3001';

export async function requestMandates(sessionId: string) {
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
  if (!r.ok) throw new Error(`mandate sign ${r.status}`);
  return r.json() as Promise<{ checkout_mandate: string; payment_mandate: string; total: number }>;
}
```

**Step 3：Commit**

```bash
# 在 ucp-server
git -C /Users/sam/project/ucp-server add src/routes/checkoutSessions.ts
git -C /Users/sam/project/ucp-server commit -m "feat(api): demo-only /internal/demo-sign-mandate (dev env)"
# 在 publisher-site
git -C /Users/sam/project/publisher-site add src/lib/clientMandate.ts
git -C /Users/sam/project/publisher-site commit -m "refactor(sdk): use server-side demo signing endpoint"
```

---

## Task 26：Shadow DOM 廣告元件

**Files:**
- Create: `publisher-site/src/components/AdSlot.ts`

**Step 1：實作**

```typescript
// src/components/AdSlot.ts
import { getCatalog, createSession } from '../lib/ucpClient.js';

const CARD_CSS = `
  :host { all: initial; display: block; }
  .card { font-family: "Noto Sans TC", sans-serif; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px; max-width: 560px; }
  .badge { background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
  .title { font-size: 18px; font-weight: 600; margin: 8px 0; }
  .price { font-size: 22px; color: #111; }
  .meta { color: #666; font-size: 14px; margin: 4px 0; }
  button { background: #0f62fe; color: #fff; border: 0; padding: 10px 16px; border-radius: 8px; cursor: pointer; }
  img { max-width: 160px; border-radius: 8px; }
`;

export class UcpAdSlot extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    const productId = this.getAttribute('slot') ?? '';
    shadow.innerHTML = `<style>${CARD_CSS}</style><div class="card">Loading…</div>`;
    this.load(shadow, productId).catch(e => {
      shadow.querySelector('.card')!.textContent = `廣告載入失敗：${e.message}`;
    });
  }

  private async load(shadow: ShadowRoot, productId: string) {
    const products = await getCatalog();
    const p = products.find((x: any) => x['@id'] === productId);
    if (!p) throw new Error(`product ${productId} not found`);
    const card = shadow.querySelector('.card')!;
    card.innerHTML = `
      <div class="badge">⚡ Live Commerce Ad</div>
      <img src="${p.image}" alt="${p.name}" />
      <div class="title">${p.name}</div>
      <div class="price">NT$${p.offers.price.toLocaleString()}</div>
      <div class="meta">${p.offers.availability.endsWith('InStock') ? '✅ 有貨・免運' : '❌ 缺貨'} ⭐ ${p.aggregateRating.ratingValue} (${p.aggregateRating.reviewCount})</div>
      <button id="buy">立即購買 →</button>
      <div id="checkout" style="margin-top: 16px;"></div>
    `;
    card.querySelector('#buy')!.addEventListener('click', async () => {
      const session = await createSession(productId);
      this.dispatchEvent(new CustomEvent('ucp-checkout-open', { detail: { session }, bubbles: true, composed: true }));
      // Further UI handled by CheckoutForm (Task 27)
    });
  }
}

customElements.define('ucp-ad-slot', UcpAdSlot);

// Auto-upgrade existing [data-ucp-ad] divs
export function mountAdSlots() {
  document.querySelectorAll('[data-ucp-ad]').forEach(el => {
    const slot = document.createElement('ucp-ad-slot');
    slot.setAttribute('slot', el.getAttribute('slot') ?? '');
    el.appendChild(slot);
  });
}
```

**Step 2：main.ts 掛載**

```typescript
// src/main.ts
import { mountAdSlots } from './components/AdSlot.js';
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAdSlots);
} else {
  mountAdSlots();
}
```

**Step 3：測試**

```bash
cd /Users/sam/project/publisher-site && npm run dev &
# 另一個 terminal: cd /Users/sam/project/ucp-server && npm run dev
# 開瀏覽器 http://localhost:3002，應看到 Sony WH-1000XM6 Rich Product Card
```

**Step 4：Commit**

```bash
git add src/components/AdSlot.ts src/main.ts
git commit -m "feat: Shadow DOM ad slot with Rich Product Card"
```

---

## Task 27：Inline Checkout Form

**Files:**
- Create: `publisher-site/src/components/CheckoutForm.ts`
- Modify: `publisher-site/src/components/AdSlot.ts`

**Step 1：CheckoutForm component**

```typescript
// src/components/CheckoutForm.ts
import { updateSession, completeSession } from '../lib/ucpClient.js';
import { requestMandates } from '../lib/clientMandate.js';

export function renderCheckoutForm(container: HTMLElement, session: any, onDone: (result: any) => void) {
  container.innerHTML = `
    <form id="co" style="display:grid; gap:8px;">
      <input name="first_name" placeholder="名字" required />
      <input name="last_name" placeholder="姓氏" required />
      <input name="email" type="email" placeholder="Email" required />
      <input name="line1" placeholder="地址" required />
      <input name="city" placeholder="城市" required value="台北市" />
      <input name="postal_code" placeholder="郵遞區號" required value="100" />
      <div class="pay-box" style="padding:8px; border:1px solid #000; border-radius:6px; text-align:center; cursor:pointer;" id="gpay">
        🅖 Pay with Google Pay (demo mock)
      </div>
      <div id="totals" style="font-size:14px; color:#555;"></div>
      <button type="submit" id="confirm" disabled>請先點 Google Pay</button>
      <div id="err" style="color:red;"></div>
    </form>
  `;
  const totals = session.totals;
  const line = (t: string) => totals.find((x: any) => x.type === t)?.amount ?? 0;
  container.querySelector('#totals')!.textContent =
    `小計 NT$${line('subtotal').toLocaleString()}　運費 $${line('shipping')}　稅 NT$${line('tax').toLocaleString()}　合計 NT$${line('total').toLocaleString()}`;

  let gpayReady = false;
  container.querySelector('#gpay')!.addEventListener('click', () => {
    gpayReady = true;
    (container.querySelector('#gpay') as HTMLElement).style.background = '#d1fae5';
    (container.querySelector('#confirm') as HTMLButtonElement).disabled = false;
    (container.querySelector('#confirm') as HTMLButtonElement).textContent = '確認訂單';
  });

  container.querySelector('#co')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!gpayReady) return;
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      const updated = await updateSession(session.id, {
        buyer: { email: fd.get('email'), first_name: fd.get('first_name'), last_name: fd.get('last_name') },
        fulfillment: { destinations: [{ recipient: `${fd.get('first_name')} ${fd.get('last_name')}`, line1: fd.get('line1'), city: fd.get('city'), postal_code: fd.get('postal_code'), country: 'TW' }], method_type: 'shipping' },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet' }] },
      });
      const { checkout_mandate, payment_mandate, total } = await requestMandates(session.id);
      const completed = await completeSession(session.id, {
        ap2: { checkout_mandate },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet', credential: { token: payment_mandate } }] },
        expected_total: total,
        signals: { 'dev.ucp.buyer_ip': 'unknown', 'dev.ucp.user_agent': navigator.userAgent },
      });
      onDone(completed);
    } catch (err) {
      (container.querySelector('#err') as HTMLElement).textContent = (err as Error).message;
    }
  });
}
```

**Step 2：AdSlot 接上 CheckoutForm**

```typescript
// 修改 AdSlot.ts 的 click handler
import { renderCheckoutForm } from './CheckoutForm.js';
// ...
card.querySelector('#buy')!.addEventListener('click', async () => {
  const session = await createSession(productId);
  const co = card.querySelector('#checkout') as HTMLElement;
  renderCheckoutForm(co, session, (result) => {
    co.innerHTML = `<div style="padding:12px; background:#d1fae5; border-radius:8px;">
      ✅ 訂單完成：<strong>${result.order.id}</strong>
      <br /><a href="${result.order.permalink_url}" target="_blank">查看訂單 →</a>
    </div>`;
    window.postMessage({ type: 'ucp-order-completed', order: result.order }, '*');
  });
});
```

**Step 3：端到端手測**

```bash
# 同時跑：ucp-server (3001) + publisher-site (3002)
# 開 http://localhost:3002，點 立即購買 → 填表 → Google Pay → 確認訂單
# 預期：看到綠色訂單完成訊息 + ord_ 編號
```

**Step 4：Commit**

```bash
git add src/components/CheckoutForm.ts src/components/AdSlot.ts
git commit -m "feat: inline checkout form with mandate sign + complete"
```

---

## Task 28：publisher-site Dockerfile

**Files:**
- Create: `publisher-site/Dockerfile`
- Create: `publisher-site/.dockerignore`
- Create: `publisher-site/nginx.conf`

**Step 1：Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm ci && npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

**Step 2：nginx.conf**

```nginx
server {
  listen 8080;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

**Step 3：.dockerignore**

```
node_modules
dist
.git
*.log
```

**Step 4：Build + smoke**

```bash
docker build -t publisher-site:dev /Users/sam/project/publisher-site
docker run --rm -p 8082:8080 publisher-site:dev &
sleep 2; curl -sI http://localhost:8082 | head -2; kill %1
```

**Step 5：Commit**

```bash
git add Dockerfile .dockerignore nginx.conf
git commit -m "build: Dockerfile for Cloud Run (nginx static)"
```

---

## Task 29：M3 完成 — publisher-site 完整流程驗收

**Step 1：手測**

同 Task 27 端到端流程，確認：
- 廣告卡片顯示 Sony 商品與價格
- 點擊購買後 inline 展開表單
- Google Pay mock 按鈕切換狀態
- 確認訂單後顯示訂單編號
- 訂單 permalink 可點擊（Task 32 前會 404）

**Step 2：無新 commit**

---

# M4：ecommerce-frontend 升級

## Task 30：OrderLookupPage

**Files:**
- Create: `ecommerce-frontend/src/pages/OrderLookupPage.vue`
- Modify: `ecommerce-frontend/src/router/index.js`
- Create: `ecommerce-frontend/src/utils/ucpClient.js`

**Step 1：ucpClient.js**

```javascript
// src/utils/ucpClient.js
const UCP_API = import.meta.env.VITE_UCP_API_URL || 'http://localhost:3001';

export async function getOrder(id) {
  const r = await fetch(`${UCP_API}/orders/${id}`, {
    headers: {
      'UCP-Agent': `profile="${location.origin}/profile"`,
      'Request-Id': crypto.randomUUID(),
    },
  });
  if (!r.ok) throw new Error(`order ${id}: ${r.status}`);
  return r.json();
}
```

**Step 2：OrderLookupPage.vue**

```vue
<template>
  <div class="order-page">
    <h1>訂單詳情</h1>
    <div v-if="loading">載入中...</div>
    <div v-else-if="error" class="error">載入失敗：{{ error }}</div>
    <div v-else-if="order" class="order">
      <p><strong>訂單編號：</strong>{{ order.id }}</p>
      <p><strong>結帳編號：</strong>{{ order.checkout_id }}</p>
      <h3>商品</h3>
      <ul>
        <li v-for="li in order.line_items" :key="li.id">
          {{ li.item.title }} × {{ li.quantity.total }} — NT${{ li.totals[0].amount.toLocaleString() }}
        </li>
      </ul>
      <h3>配送</h3>
      <p v-for="exp in order.fulfillment.expectations" :key="exp.id">
        {{ exp.method_type }} → {{ exp.destination.recipient }} / {{ exp.destination.line1 }}, {{ exp.destination.city }}
      </p>
      <h3>金額</h3>
      <p v-for="t in order.totals" :key="t.type">
        {{ t.type }}: NT${{ t.amount.toLocaleString() }}
      </p>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { getOrder } from '../utils/ucpClient.js';

export default {
  name: 'OrderLookupPage',
  setup() {
    const route = useRoute();
    const order = ref(null);
    const loading = ref(true);
    const error = ref(null);
    onMounted(async () => {
      try {
        order.value = await getOrder(route.params.id);
      } catch (e) {
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    });
    return { order, loading, error };
  },
};
</script>

<style scoped>
.order-page { max-width: 640px; margin: 24px auto; padding: 16px; }
.error { color: red; }
.order p { line-height: 1.8; }
</style>
```

**Step 3：router**

```javascript
// router/index.js — 加入
import OrderLookupPage from '../pages/OrderLookupPage.vue';
// routes:
{ path: '/order/:id', name: 'OrderLookup', component: OrderLookupPage },
```

**Step 4：手測**

```bash
cd /Users/sam/project/ecommerce-frontend && npm run dev &
# 跑完整 publisher flow 取得 ord_xxx
# 開 http://localhost:3000/ecommerce-frontend/#/order/ord_xxx
# 預期：看到完整訂單資訊
```

**Step 5：Commit**

```bash
git add src/pages/OrderLookupPage.vue src/router/index.js src/utils/ucpClient.js
git commit -m "feat: OrderLookupPage fetches from ucp-server"
```

---

## Task 31：Schema.org Product JSON-LD 嵌入 ProductPage

**Files:**
- Modify: `ecommerce-frontend/src/pages/ProductPage.vue`

**Step 1：加入 JSON-LD block**

```vue
<!-- 在 ProductPage.vue template 最後加 -->
<script type="application/ld+json" v-if="product">
  {{ JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': product.id,
    name: product.name,
    image: product.image,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'TWD',
      price: product.price,
      availability: 'https://schema.org/InStock'
    }
  }) }}
</script>
```

**Step 2：手測（View Source 確認 JSON-LD 出現）**

```bash
curl -s http://localhost:3000/ecommerce-frontend/ | grep -A 10 'application/ld+json'
```

**Step 3：Commit**

```bash
git add src/pages/ProductPage.vue
git commit -m "feat: embed Schema.org Product JSON-LD"
```

---

## Task 32：Dockerfile for ecommerce-frontend

**Files:**
- Create: `ecommerce-frontend/Dockerfile`
- Create: `ecommerce-frontend/nginx.conf`
- Modify: `ecommerce-frontend/.dockerignore`

**Step 1：Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build || (echo "vite build failed" && exit 1)

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/docs /usr/share/nginx/html/ecommerce-frontend
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

**Step 2：nginx.conf**

```nginx
server {
  listen 8080;
  root /usr/share/nginx/html;
  index index.html;
  location /ecommerce-frontend/ { try_files $uri $uri/ /ecommerce-frontend/index.html; }
  location / { return 302 /ecommerce-frontend/; }
}
```

**Step 3：修 package.json `build` 避開 deploy:onepixel**

```json
"scripts": {
  "build:app": "npm run update-facebook-feed && vite build"
}
```

再改 Dockerfile 第 4 行：`RUN npm run build:app`

**Step 4：Build + smoke**

```bash
docker build -t ecommerce-frontend:dev /Users/sam/project/ecommerce-frontend
docker run --rm -p 8080:8080 ecommerce-frontend:dev &
sleep 2; curl -sI http://localhost:8080/ecommerce-frontend/; kill %1
```

**Step 5：Commit**

```bash
git add Dockerfile nginx.conf package.json
git commit -m "build: Dockerfile + nginx config for Cloud Run"
```

---

## Task 33：M4 roll-up

無新檔；人工驗證 ecommerce-frontend 可跑 + 可查訂單。

---

# M5：聯調 + E2E

## Task 34：docker-compose for three-service local boot

**Files:**
- Create: `/Users/sam/project/docker-compose.yml`

**Step 1：compose file**

```yaml
version: "3.9"
services:
  ucp-server:
    build: ./ucp-server
    environment:
      PORT: 8080
      UCP_ALLOWED_ORIGINS: "http://localhost:8000,http://localhost:8002"
      MERCHANT_URL: "http://localhost:8000"
    ports: ["3001:8080"]
  merchant:
    build: ./ecommerce-frontend
    ports: ["3000:8080"]
  publisher:
    build: ./publisher-site
    ports: ["3002:8080"]
    depends_on: [ucp-server]
```

**Step 2：Run**

```bash
cd /Users/sam/project
docker compose up --build -d
sleep 6
curl -s http://localhost:3001/healthz
curl -sI http://localhost:3000/ecommerce-frontend/
curl -sI http://localhost:3002
docker compose down
```

Expected: 三個服務都回 200

**Step 3：Commit（在父目錄若是 git，否則記錄到 km）**

```bash
# 若 /Users/sam/project 不是 git repo，將 docker-compose.yml 同步複製至 publisher-site/ 並 commit
cp /Users/sam/project/docker-compose.yml /Users/sam/project/publisher-site/docker-compose.yml
git -C /Users/sam/project/publisher-site add docker-compose.yml
git -C /Users/sam/project/publisher-site commit -m "chore: docker-compose for three-service local boot"
```

---

## Task 35：Playwright E2E setup

**Files:**
- Create: `publisher-site/tests/e2e/fullFlow.spec.ts`
- Create: `publisher-site/playwright.config.ts`

**Step 1：install**

```bash
cd /Users/sam/project/publisher-site
npm install -D @playwright/test
npx playwright install chromium
```

**Step 2：config**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3002', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  webServer: [
    { command: 'cd ../ucp-server && npm run dev', url: 'http://localhost:3001/healthz', reuseExistingServer: true },
    { command: 'npm run dev', url: 'http://localhost:3002', reuseExistingServer: true },
  ],
});
```

**Step 3：Commit**

```bash
git add playwright.config.ts package.json
git commit -m "chore: playwright config"
```

---

## Task 36：E2E happy path

**Files:**
- Create: `publisher-site/tests/e2e/fullFlow.spec.ts`

**Step 1：test**

```typescript
// tests/e2e/fullFlow.spec.ts
import { test, expect } from '@playwright/test';

test('end-to-end: ad → inline checkout → order completed', async ({ page }) => {
  await page.goto('/');
  const shadow = page.locator('ucp-ad-slot').locator('css=.card');
  await expect(shadow.locator('.title')).toHaveText(/Sony WH-1000XM6/);
  await shadow.locator('#buy').click();

  await page.fill('input[name=first_name]', '測試');
  await page.fill('input[name=last_name]', '用戶');
  await page.fill('input[name=email]', 'test@example.com');
  await page.fill('input[name=line1]', '市民大道 1 號');
  await page.locator('#gpay').click();
  await page.locator('#confirm').click();

  await expect(page.locator('text=/訂單完成/')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('text=/ord_/')).toBeVisible();
});

test('api contract: /checkout-sessions returns UCP shape', async ({ request }) => {
  const r = await request.post('http://localhost:3001/checkout-sessions', {
    headers: {
      'UCP-Agent': 'profile="http://localhost:3002/profile"',
      'Request-Id': 'ct-1',
      'Idempotency-Key': 'ct-1',
      'Content-Type': 'application/json',
    },
    data: { currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] },
  });
  expect(r.status()).toBe(201);
  const body = await r.json();
  expect(body.ucp.version).toBe('1.0');
  expect(body.status).toBe('incomplete');
  expect(body.line_items[0].item.title).toBeTruthy();
  expect(body.totals.some((t: any) => t.type === 'total')).toBe(true);
});
```

**Step 2：Run**

```bash
npx playwright test
```

Expected: 2 passed

**Step 3：Commit**

```bash
git add tests/e2e/fullFlow.spec.ts
git commit -m "test(e2e): full flow happy path + contract"
```

---

## Task 37：E2E negative paths

**Files:**
- Modify: `publisher-site/tests/e2e/fullFlow.spec.ts`

**Step 1：加入 tests**

```typescript
test('rejects tampered Content-Type', async ({ request }) => {
  const r = await request.post('http://localhost:3001/checkout-sessions', {
    headers: { 'Content-Type': 'application/json' }, // missing UCP headers
    data: {},
  });
  expect(r.status()).toBe(400);
});

test('cancel then complete is 409', async ({ request }) => {
  const create = await request.post('http://localhost:3001/checkout-sessions', {
    headers: {
      'UCP-Agent': 'profile="http://localhost:3002/profile"',
      'Request-Id': 'neg-1', 'Idempotency-Key': 'neg-create',
      'Content-Type': 'application/json',
    },
    data: { currency: 'TWD', line_items: [{ item: { id: 'sony-wh1000xm6' }, quantity: { original: 1, total: 1, fulfilled: 0 } }] },
  });
  const { id } = await create.json();
  await request.post(`http://localhost:3001/checkout-sessions/${id}/cancel`, {
    headers: {
      'UCP-Agent': 'profile="http://localhost:3002/profile"',
      'Request-Id': 'neg-2', 'Idempotency-Key': 'neg-cancel',
      'Content-Type': 'application/json',
    },
    data: {},
  });
  const r = await request.post(`http://localhost:3001/checkout-sessions/${id}/complete`, {
    headers: {
      'UCP-Agent': 'profile="http://localhost:3002/profile"',
      'Request-Id': 'neg-3', 'Idempotency-Key': 'neg-complete',
      'Content-Type': 'application/json',
    },
    data: { ap2: { checkout_mandate: 'x' }, payment: { instruments: [] }, expected_total: 0 },
  });
  expect(r.status()).toBe(409);
});
```

**Step 2：Run & commit**

```bash
npx playwright test
git add tests/e2e/fullFlow.spec.ts
git commit -m "test(e2e): negative paths (missing headers, cancel-then-complete)"
```

---

## Task 38：M5 roll-up — all tests green

**Step 1：run all test suites**

```bash
cd /Users/sam/project/ucp-server && npm test
cd /Users/sam/project/publisher-site && npx playwright test
```

Expected: 全部綠燈

**Step 2：無新 commit**

---

# M6：文件與部署

## Task 39：README（三個服務各一份）

**Files:**
- Create: `ucp-server/README.md`
- Create: `publisher-site/README.md`
- Modify: `ecommerce-frontend/README.md`（加 UCP 整合段落）

**Step 1：ucp-server/README.md**

```markdown
# ucp-server

Google Universal Commerce Protocol (UCP) 實作原型，90% 擬真（見 `../docs/plans/2026-04-15-ucp-agentic-commerce-demo-design.md` 第 4 節）。

## Endpoints

- POST /checkout-sessions
- GET  /checkout-sessions/:id
- PUT  /checkout-sessions/:id
- POST /checkout-sessions/:id/complete
- POST /checkout-sessions/:id/cancel
- GET  /orders/:id
- GET  /catalog （non-UCP, demo only）
- GET  /.well-known/jwks.json
- POST /internal/demo-sign-mandate/:id （dev only）

## Required headers

`UCP-Agent`, `Idempotency-Key` (mutations), `Request-Id`

## Dev

```bash
npm install
npm run dev       # port 3001
npm test
```

## Cloud Run

```bash
docker build -t ucp-server .
# 部署由使用者自行依容器架構部署
```

## Env vars

- `PORT` (default 3001, Cloud Run 8080)
- `UCP_ALLOWED_ORIGINS` — CORS allowlist, comma-separated
- `UCP_ISSUER` — JWT iss
- `MERCHANT_URL` — used in `order.permalink_url`
```

**Step 2：其餘 README 類似**

（省略，內容比照上例）

**Step 3：Commit**

```bash
git -C /Users/sam/project/ucp-server add README.md
git -C /Users/sam/project/ucp-server commit -m "docs: README"
# 同樣在 publisher-site
```

---

## Task 40：OpenAPI 文件（標註 demo 偏離）

**Files:**
- Create: `ucp-server/openapi.yaml`

**Step 1：最小 OpenAPI 3.0**

```yaml
openapi: 3.0.3
info:
  title: UCP Demo Server
  version: 0.1.0
  description: |
    UCP 90% 擬真實作。偏離官方 spec 處：
    - SD-JWT-VC: payment mandate 採 ES256 JWS + trailing ~（無 selective disclosure）
    - RFC 9421: response 產出 Signature-Input / Content-Digest，request 不強制驗證
    - Identity Linking: 未實作 OAuth
    - /catalog: 非 UCP 標準（demo-only）
servers:
  - url: http://localhost:3001
paths:
  /checkout-sessions:
    post:
      summary: Create checkout session
      parameters:
        - name: UCP-Agent
          in: header
          required: true
          schema: { type: string }
        - name: Idempotency-Key
          in: header
          required: true
          schema: { type: string }
        - name: Request-Id
          in: header
          required: true
          schema: { type: string }
      responses:
        "201":
          description: Created
  /checkout-sessions/{id}:
    get:
      summary: Get checkout session
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
    put:
      summary: Update checkout session
  /checkout-sessions/{id}/complete:
    post:
      summary: Complete checkout (verify mandates, create order)
  /checkout-sessions/{id}/cancel:
    post:
      summary: Cancel checkout
  /orders/{id}:
    get:
      summary: Get order
  /catalog:
    get:
      summary: "[demo-only] Product catalog"
```

**Step 2：Commit**

```bash
git -C /Users/sam/project/ucp-server add openapi.yaml
git -C /Users/sam/project/ucp-server commit -m "docs: OpenAPI with demo deviation notes"
```

---

## Task 41：Cloud Run 部署說明

**Files:**
- Create: `docs/plans/2026-04-15-cloud-run-deployment.md`

**Step 1：寫部署指引**

```markdown
# Cloud Run 部署指引（交付使用者手動執行）

三個服務各自獨立部署。使用者將依現有 Cloud Run 容器架構操作，以下為參考指令。

## ucp-server

```bash
gcloud run deploy ucp-server \
  --source /Users/sam/project/ucp-server \
  --region asia-east1 \
  --port 8080 \
  --min-instances 0 --max-instances 10 --memory 256Mi \
  --set-env-vars UCP_ALLOWED_ORIGINS="https://merchant.example.com,https://publisher.example.com",UCP_ISSUER="https://ucp.example.com",MERCHANT_URL="https://merchant.example.com"
```

## ecommerce-frontend

靜態站，nginx 映像。部署後取得 URL，填入 publisher-site 的 `VITE_UCP_API_URL` build 變數。

## publisher-site

Build 前設定 `window.__UCP_API__` 對應 ucp-server 的 Cloud Run URL。

## DNS / CORS

將 ucp-server `UCP_ALLOWED_ORIGINS` 更新為最終 publisher 與 merchant 的 prod URL，重新部署即可。

## 驗收

部署完成後跑 Playwright 測試 with `BASE_URL=<publisher Cloud Run URL>`。
```

**Step 2：Commit（km 無 git，不 commit）**

留檔即可。

---

## Task 42：總驗收清單

**Files:**
- Create: `docs/plans/2026-04-15-ucp-agentic-commerce-demo-acceptance.md`

**Step 1：驗收 matrix**

```markdown
# UCP Demo 驗收清單

- [ ] ucp-server 單元測試全綠（`npm test`，~30 case）
- [ ] publisher-site E2E 全綠（`npx playwright test`，5 case）
- [ ] `docker compose up --build` 三服務啟動成功
- [ ] 從 publisher-site 完整走完結帳，得到 ord_xxx
- [ ] 點 permalink → ecommerce-frontend 顯示完整訂單
- [ ] View Source on ProductPage 可見 Schema.org JSON-LD
- [ ] Idempotency：同 key POST 兩次回相同 session id
- [ ] CORS：非 allowlist origin 被拒
- [ ] Mandate：篡改 checkout_mandate 被拒（401/400）
- [ ] 狀態機：completed 狀態不能再 cancel（409）
- [ ] README 各三份到位；OpenAPI 文件完整；Cloud Run 部署指引可行
- [ ] Jira FRON-5348 填實際投入時數並 resolve
```

**Step 2：在 ticket resolve 時更新**

---

# 完成後

進入 `superpowers:finishing-a-development-branch` 決定如何整合這三個服務的分支與提交至遠端。

---

## 執行交接

> Plan complete and saved to `docs/plans/2026-04-15-ucp-agentic-commerce-demo-plan.md`. Two execution options:
>
> **1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration
>
> **2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints
>
> **Which approach?**
