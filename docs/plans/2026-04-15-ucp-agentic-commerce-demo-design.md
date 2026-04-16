# UCP Agentic Commerce Demo — 設計文件

> 建立日期：2026-04-15
> 商業依據：[DSP_UCP_商業可行性分析.md](../DSP_UCP_商業可行性分析.md)（方向 3、方向 6、方向 7）
> 協議規格來源：[ucp.dev](https://ucp.dev)（官方 spec）、Gemini 3.1 Pro Preview 交叉驗證
> 規格擬真度：90%（B 方案）

---

## 1. 目標

1. 將既有 `ecommerce-frontend` 升級為「UCP-compatible Merchant」示範商家，實作 UCP 官方 Checkout REST 與 Order spec
2. 新增 `publisher-site`（第三方網頁 domain）模擬媒體站，嵌入廣告 SDK，透過 UCP 協議跨域取得商品資料、展開 inline Rich Product Card、完成結帳
3. 新增 `ucp-server`（UCP API 服務），提供真實 UCP Checkout REST 端點、AP2 Mandate 簽章、Order 查詢
4. 三個服務皆可容器化部署至 Google Cloud Run

---

## 2. 系統架構

```
┌──────────────────────────┐    ┌──────────────────────────┐    ┌──────────────────────────┐
│   publisher-site         │    │   ucp-server             │    │   ecommerce-frontend     │
│   (3rd-party media)      │    │   (UCP REST API)         │    │   (Merchant storefront)  │
│   :3002                  │    │   :3001                  │    │   :3000                  │
│                          │    │                          │    │                          │
│   科技媒體文章 + 廣告位    │    │   /checkout-sessions     │    │   既有 SPA + 訂單查詢頁   │
│   SDK (sdk.js)           │    │   /orders/{id}           │    │   Schema.org JSON-LD     │
└────────┬─────────────────┘    │   /catalog (demo-only)   │    └──────────┬───────────────┘
         │                       └────────┬─────────────────┘                │
         │                                │                                  │
         │ 1. GET /catalog (demo) ────────▶│                                  │
         │ 2. POST /checkout-sessions ────▶│                                  │
         │ 3. PUT /checkout-sessions/{id} ▶│                                  │
         │ 4. POST /complete ─────────────▶│◀── 內部同步 order ───────────────│
         │                                 │                                  │
         │◀── 訂單完成回應 ────────────────│                                  │
         │                                                                    │
         └──── 使用者選擇開新分頁 ────────────────────────────────────────────▶
              GET /orders/{id} (經 UCP server)                查看訂單詳情
```

**跨域模擬**：三個服務以不同 port 代表不同 domain，滿足 CORS preflight、Origin header 驗證、cross-origin postMessage 的真實行為。

---

## 3. 專案結構

```
/Users/sam/project/
├── ecommerce-frontend/              # 既有 Vue 3 SPA（最小修改）
│   ├── src/
│   │   ├── pages/
│   │   │   └── OrderLookupPage.vue  # 新增：/order/:id 路由
│   │   ├── utils/
│   │   │   └── ucpClient.js         # 新增：從 ucp-server 查單
│   │   └── assets/products.json     # 既有，作為 catalog 資料來源
│   ├── Dockerfile                   # 新增：nginx 靜態部署
│   └── ... (既有檔案)
│
├── ucp-server/                      # 新增 Node 20 + TypeScript
│   ├── src/
│   │   ├── index.ts                 # Express app entrypoint
│   │   ├── routes/
│   │   │   ├── checkout-sessions.ts # POST / GET / PUT / complete / cancel
│   │   │   ├── orders.ts            # GET /orders/{id}
│   │   │   └── catalog.ts           # GET /catalog (demo-only, 標明非 UCP 標準)
│   │   ├── middleware/
│   │   │   ├── cors.ts              # Origin allowlist
│   │   │   ├── ucpHeaders.ts        # 驗證 UCP-Agent, Idempotency-Key, Request-Id
│   │   │   ├── contentDigest.ts    # RFC 9530 驗證（optional 模式）
│   │   │   └── errorHandler.ts
│   │   ├── store/
│   │   │   ├── sessions.ts          # in-memory Map<id, CheckoutSession>
│   │   │   ├── orders.ts            # in-memory Map<id, Order>
│   │   │   └── idempotency.ts       # Map<key, response> 快取
│   │   ├── lib/
│   │   │   ├── jwt.ts               # jose ES256 簽發/驗證
│   │   │   ├── checkoutMandate.ts   # Detached JWS for checkout state
│   │   │   ├── paymentMandate.ts    # SD-JWT-VC lite（ES256 JWS，不做 selective disclosure）
│   │   │   └── stateMachine.ts      # incomplete → ready_for_complete → completed/canceled
│   │   ├── types/ucp.ts             # 共用 UCP 型別定義
│   │   └── data/products.ts         # 從 ecommerce-frontend 同步的商品種子資料
│   ├── public/sdk.js                # 供 publisher-site <script> 引入
│   ├── keys/                        # .gitignore；dev-only ES256 private/public JWK
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
└── publisher-site/                  # 新增 Vite + TypeScript
    ├── src/
    │   ├── main.ts                  # 文章頁主邏輯
    │   ├── article.html             # 科技媒體假文章 template
    │   ├── components/
    │   │   ├── AdSlot.ts            # 廣告位 wrapper，呼叫 SDK
    │   │   └── CheckoutForm.ts      # inline checkout UI
    │   └── styles/
    ├── Dockerfile                   # nginx 靜態部署
    ├── index.html
    ├── package.json
    └── tsconfig.json
```

---

## 4. UCP 協議實作範圍（90% 規格 B 方案）

### 4.1 必做（100% 符合官方 spec）

- **端點路徑與 HTTP method**：完全符合 `ucp.dev/latest/specification/checkout-rest/`
  - `POST /checkout-sessions`
  - `GET /checkout-sessions/{id}`
  - `PUT /checkout-sessions/{id}`（非 PATCH）
  - `POST /checkout-sessions/{id}/complete`
  - `POST /checkout-sessions/{id}/cancel`
  - `GET /orders/{id}`
- **狀態機**：僅使用 `incomplete`、`ready_for_complete`、`completed`、`canceled` 四個狀態
- **必要 HTTP headers**：`UCP-Agent`、`Idempotency-Key`、`Request-Id` 全部驗證（缺任一回 400）
- **Checkout object 欄位**：`id, status, currency, line_items[], buyer, totals[], fulfillment, payment, messages[], links, order`，命名與結構對齊官方 schema
- **Order object 欄位**：`id, checkout_id, permalink_url, line_items[], fulfillment{expectations, events[]}, adjustments[], totals[], currency, messages[]`
- **Mandate 位置**：`ap2.checkout_mandate`（Complete 請求 body）與 `payment.instruments[*].credential.token`（PaymentMandate）
- **簽章演算法**：ES256（ECDSA P-256），用 `jose` 套件產生非對稱金鑰
- **Idempotency**：同 `Idempotency-Key` 重送相同請求回原始 response

### 4.2 簡化（demo 合理裁剪）

- **PaymentMandate**：用 ES256 JWS 的標準 JWT（payload 含 `checkout_id, amount, currency, iss, aud, iat, exp, jti`），**不實作 SD-JWT-VC 的 selective disclosure**。payload 仍用 tilde-separator 格式包裝（`<jwt>~`）以符合 spec 正則 `^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(~[A-Za-z0-9_-]+)*$`
- **RFC 9421 HTTP Message Signatures**：ucp-server 產出 `Content-Digest`、`Signature-Input`、`Signature` headers 但**不強制驗證** request 簽章（demo SDK 無 HSM；若有提供則驗證）
- **Identity Linking OAuth**：不實作 OAuth authorization code flow。buyer 資訊改由 SDK 表單直接收集（demo 不涉及 Agent 代理真實用戶帳號）

### 4.3 非 UCP 標準（demo 加料）

- `GET /catalog` — 回傳商品清單，Response header 標記 `X-UCP-Extension: demo-catalog`，並在 OpenAPI 文件註明「非 UCP 標準，僅供 publisher SDK demo 取得商品列表」。正式 UCP 的商品來源是商家站 JSON-LD 或 Google Merchant Center feed
- ecommerce-frontend 頁面嵌入 Schema.org Product JSON-LD（對應 GMC parity），確保「商家站也有正規商品結構化資料」

---

## 5. 資料流（端到端）

```
使用者在 publisher-site 文章頁
  │
  │ (a) Publisher 頁面載入時 <script src="http://localhost:3001/sdk.js"> 引入 SDK
  │
  │ (b) SDK 初始化：讀取 <div data-ucp-ad slot="sony-wh1000xm6"> 配置
  │
  │ (c) SDK → ucp-server: GET /catalog (非 UCP, demo 端點)
  │     Headers: UCP-Agent: profile="http://localhost:3002/profile", Request-Id: uuid
  │     Response: [ { id, name, price, image, inStock, rating } ]
  │
  │ (d) SDK 渲染 Rich Product Card（Shadow DOM 隔離樣式）
  │
  │ 使用者點「立即購買」
  │
  │ (e) SDK inline 展開 CheckoutForm（姓名/地址/email/mock Google Pay 按鈕）
  │
  │ (f) SDK → ucp-server: POST /checkout-sessions
  │     Headers: UCP-Agent, Idempotency-Key, Request-Id, Content-Type: application/json
  │     Body: { currency: "TWD", line_items: [{ item: {id}, quantity: {original:1, total:1, fulfilled:0} }] }
  │     Response 201: { id, status: "incomplete", totals, line_items, ... }
  │
  │ (g) 使用者填完表單
  │
  │ (h) SDK → ucp-server: PUT /checkout-sessions/{id}
  │     Body: { buyer: {email, first_name, last_name}, fulfillment: { destinations: [...] }, payment: { instruments: [{ handler_id: "google-pay-mock", type: "card" }] } }
  │     Response 200: { status: "ready_for_complete", ... }
  │
  │ 使用者點「確認訂單」
  │
  │ (i) SDK 構造 CheckoutMandate（detached JWS，signs checkout state hash）
  │     SDK 構造 PaymentMandate（ES256 JWS，含 checkout_id + amount + aud）
  │
  │ (j) SDK → ucp-server: POST /checkout-sessions/{id}/complete
  │     Body: {
  │       ap2: { checkout_mandate: "<detached-jws>" },
  │       payment: { instruments: [{ credential: { token: "<payment-mandate-jwt>~" } }] },
  │       signals: { "dev.ucp.buyer_ip": "...", "dev.ucp.user_agent": "..." }
  │     }
  │
  │ (k) ucp-server 驗證流程：
  │     1. 驗 CheckoutMandate 簽章（ES256 公鑰）
  │     2. 驗 PaymentMandate 簽章、aud、exp、checkout_id 一致性
  │     3. 驗狀態機：session.status == "ready_for_complete"
  │     4. 轉換狀態 → "completed"，建立 Order 物件
  │
  │ (l) ucp-server Response 200: {
  │       id, status: "completed",
  │       order: { id: "ord_xxx", permalink_url: "http://localhost:3000/order/ord_xxx" },
  │       ...
  │     }
  │
  │ (m) SDK 顯示「訂單完成 ord_xxx」+ postMessage 通知 Publisher 頁面（可選）
  │
  │ (n) 使用者點 permalink_url → 開啟 ecommerce-frontend /order/ord_xxx
  │     → OrderLookupPage.vue → GET /orders/{id} → 顯示完整訂單
```

---

## 6. 安全設計

### 6.1 CORS

ucp-server 以環境變數 `UCP_ALLOWED_ORIGINS` 設定 allowlist，dev：`http://localhost:3000,http://localhost:3002`。

回應所有必要 CORS headers：
```
Access-Control-Allow-Origin: <origin>
Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS
Access-Control-Allow-Headers: Content-Type, UCP-Agent, Idempotency-Key, Request-Id, Content-Digest, Signature-Input, Signature, Authorization
Access-Control-Expose-Headers: Request-Id, Content-Digest, Signature-Input, Signature
```

### 6.2 JWT 金鑰管理

- `ucp-server/keys/` 放 dev ES256 私鑰（JWK 格式，`.gitignore`）
- 啟動時若不存在自動產生
- 公鑰以 `GET /.well-known/jwks.json` 暴露供 SDK 驗證 server→client 的 mandate 簽章
- SDK 端簽 PaymentMandate 時使用自己的 test key；ucp-server 端以 `UCP_SDK_PUBLIC_JWK` 環境變數設定信任公鑰

### 6.3 狀態機守門

所有狀態轉換集中於 `lib/stateMachine.ts`，非法轉換回 409 Conflict。

### 6.4 防重放

- `Idempotency-Key` cache（TTL 24h，demo 用 in-memory）
- Mandate JWT 含 `jti` + `exp`，60 秒 TTL
- PaymentMandate 用過一次後加入 blacklist（in-memory Set）

---

## 7. Publisher 廣告 UX

### 7.1 Inline Expand 設計

```
┌─ 文章：「2026 最佳降噪耳機評測」────────────────────┐
│ 主流降噪耳機在 2026 年的表現...                      │
│                                                      │
│  ┌─ ⚡ Live Commerce Ad ──────────────────────────┐ │
│  │ [Sony WH-1000XM6 圖]                            │ │
│  │ Sony WH-1000XM6                                 │ │
│  │ NT$7,990  ✅ 有貨・免運  ⭐ 4.7 (2,340)         │ │
│  │ [ 立即購買 → ]                                   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│ ↓ 點擊後原地展開（不離開頁面）                        │
│                                                      │
│  ┌─ Checkout ────────────────────────────────────┐  │
│  │ 姓名 [_________]                               │  │
│  │ 地址 [_________]                               │  │
│  │ Email [________]                               │  │
│  │ ┌─ 🅖 Pay with Google Pay (demo) ──────────┐   │  │
│  │ └──────────────────────────────────────────┘   │  │
│  │                                                 │  │
│  │ 小計 NT$7,990  運費 $0  稅 NT$400  合計 8,390  │  │
│  │ [ 確認訂單 ]                                    │  │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│ 文章其他段落繼續 ...                                 │
└─────────────────────────────────────────────────────┘
```

### 7.2 Shadow DOM 隔離

SDK 建立 `<ucp-ad-slot>` custom element，內部使用 Shadow DOM，防止 Publisher 站 CSS 污染廣告樣式或反之。

### 7.3 完成後互動

- 成功：inline 顯示 ✅ 訂單編號 + 「查看訂單」連結（新分頁）+ `postMessage` 送給 `window.top`（供 Publisher 做分析）
- 失敗：顯示錯誤訊息 + 「重試」按鈕；ucp-server 回的 `messages[]` 會顯示具體原因

---

## 8. 部署（Cloud Run）

### 8.1 每個服務皆有

- `Dockerfile` — multi-stage build，最終映像 `< 150MB`
- `.dockerignore` — 排除 `node_modules`、`.env`、`keys/`
- `cloudbuild.yaml`（optional） — 供 Cloud Build trigger
- 環境變數化所有 URL 與 secret

### 8.2 服務間 URL 配置

| 服務 | dev URL | prod URL (Cloud Run) |
|---|---|---|
| ecommerce-frontend | http://localhost:3000 | `MERCHANT_URL`（env） |
| ucp-server | http://localhost:3001 | `UCP_API_URL`（env） |
| publisher-site | http://localhost:3002 | `PUBLISHER_URL`（env） |

publisher-site 的 `sdk.js` 要以 `UCP_API_URL` 注入（build-time 或 runtime config endpoint）。

### 8.3 Cloud Run 啟動參數

- ucp-server：`--port 8080 --min-instances 0 --max-instances 10 --memory 256Mi`
- ecommerce-frontend / publisher-site：nginx 靜態，`--port 8080 --min-instances 0 --memory 128Mi`

### 8.4 部署由使用者接手

本專案不包含 Cloud Run 部署自動化；使用者將依現有容器架構自行部署。

---

## 9. 測試策略

### 9.1 單元測試（vitest）

- `lib/stateMachine.test.ts` — 所有合法/非法狀態轉換
- `lib/jwt.test.ts` — ES256 簽發/驗證、過期、簽章不符
- `lib/checkoutMandate.test.ts` / `paymentMandate.test.ts`
- `middleware/ucpHeaders.test.ts` — 缺 header / 錯誤格式
- `store/idempotency.test.ts` — 同 key 回相同 response

### 9.2 Contract Tests

- `contract/checkout-flow.test.ts` — 完整走 POST → PUT → complete
- `contract/ucp-schema.test.ts` — response 結構對 ucp.dev spec 欄位比對

### 9.3 E2E（Playwright）

測試案例：
1. 開 publisher-site → 看到廣告 Rich Product Card
2. 點「立即購買」→ inline 展開 checkout form
3. 填表單 → 點「Google Pay」→ 點「確認訂單」
4. 看到訂單完成訊息 + 訂單編號
5. 點訂單連結 → 開 ecommerce-frontend 訂單頁 → 看到完整訂單資訊
6. 錯誤路徑：過期 mandate、無效 Idempotency-Key、狀態機違規

### 9.4 手測矩陣

| 項目 | 方法 |
|---|---|
| CORS preflight | DevTools Network 檢查 OPTIONS |
| Idempotency | curl 同 key 兩次，確認 response 一致 |
| Mandate 驗證 | 手動改簽章 bit，確認回 401 |
| 跨域 postMessage | DevTools Console 觀察事件 |

---

## 10. 里程碑與估時

| M | 範圍 | 估時 |
|---|---|---|
| **M1** | ucp-server 骨架：Express + TS + Dockerfile + 全部 middleware + state machine + in-memory store | 20% |
| **M2** | ucp-server 6 端點 + CheckoutMandate + PaymentMandate + ES256 JWT + 單元測試 | 25% |
| **M3** | publisher-site：文章頁 + SDK 架構 + Shadow DOM + Rich Product Card + inline checkout form | 20% |
| **M4** | ecommerce-frontend：OrderLookupPage + Schema.org JSON-LD + Dockerfile | 10% |
| **M5** | 三服務聯調 + E2E Playwright + Contract tests | 15% |
| **M6** | README、Cloud Run 部署說明、OpenAPI 文件（標明 demo 簡化處） | 10% |

---

## 11. 與商業分析方向的對應

| 方向 | 本 demo 如何展示 |
|---|---|
| **方向 6** Live Commerce Ads | SDK 從商家 catalog 即時拉取商品資料渲染 Rich Product Card（價格、庫存、評分），Schema.org JSON-LD 同步於 metadata 層 |
| **方向 3** Commerce-Enabled Ad Format | 廣告位內原地 inline checkout，不跳轉 Publisher 頁面；走完整 UCP 協議完成下單 |
| **方向 7** Decentralized Checkout Node | publisher-site 展示「開放網路上的交易節點」概念 — 媒體站本身變成 commerce endpoint |

---

## 12. 已排除與原因

| 項目 | 原因 |
|---|---|
| SD-JWT-VC selective disclosure | Demo 無跨 holder/issuer/verifier 場景，額外複雜度無展示價值 |
| RFC 9421 雙向驗證 | Demo SDK 無 HSM；伺服器端產出 header 足以示範 |
| OAuth 2.0 Identity Linking | 未引入第三方消費者帳號；以表單填寫替代 |
| Firestore / Cloud SQL | Cloud Run 單實例 + in-memory 已足 demo 需求 |
| 真 Google Pay 整合 | 需商家 ID 與 PSP 設定；mock 按鈕即可展示流程 |
| Webhook (order events) | 出貨/退貨事件與此 demo 核心流程無關 |

---

## 13. 風險與緩解

| 風險 | 緩解 |
|---|---|
| UCP spec 更新導致設計過時 | 設計文件引用 2026-04-15 snapshot；以 `ucp.dev/latest/` 為真相來源重新核對前需比對 diff |
| 三服務 port 衝突（既有專案佔 3000） | 以 env var `PORT` 控制；documented 在 README |
| Shadow DOM 與 Vue 樣式互動 | Shadow DOM 僅用於 publisher-site SDK；ecommerce-frontend 不受影響 |
| Cloud Run cold start 造成 demo 卡頓 | 第一次 demo 前預熱三個服務；或 `--min-instances 1` |

---

## 14. 下一步

進入 `writing-plans` skill，針對本設計產出分步驟、可交付的實作計劃（含每步的檔案修改、測試、驗證標準）。
