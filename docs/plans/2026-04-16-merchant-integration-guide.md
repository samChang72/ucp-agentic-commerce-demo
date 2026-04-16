# Merchant（EC 客戶端）整合指引

> 視角：你是 **UCP 平台運營方 + 媒體端**（擁有 ucp-server + publisher 網絡）。客戶是 **Merchant（EC 商家）**，想把他的商品放到你的媒體網絡上賣。
>
> 本文說明：
> - **Merchant 端必須做什麼**（他的系統要提供哪些能力才能接上）
> - **你（平台）端要提供什麼**（SLA、文件、配合動作）
> - **雙方最小契約**（接口邊界、資料交換格式、錯誤對齊）

---

## 總覽：角色分工

```
┌─────────────────────────────────────────────────────────────┐
│                    MERCHANT（客戶／EC 品牌）               │
├─────────────────────────────────────────────────────────────┤
│ A. 商品 catalog（Schema.org JSON-LD / GMC feed）            │
│ B. 訂單明細頁（permalink target）                           │
│ C. 收到訂單後的 webhook handler（出貨/庫存/退款）          │
│ D. payment handler ID 對接（Google Pay / Apple Pay / ...）  │
│ E. CORS allowlist 設定（merchant origin → ucp-server）      │
└─────────────────────────────────────────────────────────────┘
                          ▲       ▲
           (2) provide    │       │ (5) webhook
           catalog        │       │ order events
                          │       │
┌─────────────────────────────────────────────────────────────┐
│            PLATFORM（你，媒體 + UCP server）                │
├─────────────────────────────────────────────────────────────┤
│ 1. 媒體網絡（publisher-site 等）嵌入 SDK ad slot           │
│ 2. ucp-server：session/order 管理、mandate 簽驗、狀態機    │
│ 3. SDK：提供 <ucp-ad-slot> + inline checkout UI            │
│ 4. 金流整合：Google Pay / Apple Pay / 收單 PSP             │
│ 5. 對 merchant 發送訂單事件                                │
│ 6. 結算：月對帳單、佣金計算                                │
│ 7. 平台治理：防詐、replay 防護、CORS allowlist、SLA        │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Merchant 必須提供的 5 件事

### A. 商品 catalog

**demo 當前狀況**：ucp-server 硬編 `PRODUCTS` 陣列（3 個耳機）。

**production 版本**：Merchant 提供下列任一：

#### A.1 Schema.org Product JSON-LD（優先）
Merchant 在自己的商品頁 embed：

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "sku-12345",
  "name": "Sony WH-1000XM6",
  "image": "https://cdn.merchant.com/products/12345.jpg",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "USD",
    "price": 399.00,
    "availability": "https://schema.org/InStock",
    "priceValidUntil": "2026-12-31"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.7,
    "reviewCount": 2340
  }
}
</script>
```

平台的爬蟲 / discovery 服務會週期性抓。**demo repo** 的 ecommerce-frontend `ProductPage.vue` 已展示 embed 方式。

#### A.2 Google Merchant Center Feed（備選）
若 Merchant 已有 GMC feed（Google Shopping），平台可直接接 feed URL：

```
https://merchant.com/feeds/products.xml
```

平台每 1h 拉一次、增量同步進 ucp-server 的 catalog store。

#### A.3 REST API（需要即時庫存時）
若商品庫存波動快（如 flash sale），Merchant 需提供：

```
GET https://merchant.com/api/products
     Accept: application/json

GET https://merchant.com/api/products/:id/stock
     → { in_stock: boolean, available: number }
```

平台會在 **建立 session 前**（`POST /checkout-sessions` 的 hydrate 階段）即時查庫存。

> **誰決定 schema**：Merchant 用 A.1 時遵循 Schema.org，用 A.2 時遵循 Google spec，用 A.3 時照雙方協定。平台的 `hydrateLineItems` 負責把所有來源正規化成 UCP 的 `line_items` 結構。

---

### B. 訂單明細頁（permalink target）

**demo 當前狀況**：ucp-server 產生 `permalink_url = ${MERCHANT_URL}/ecommerce-frontend/order/ord_xxx`。點進去是 `OrderLookupPage.vue`，透過 `GET /orders/:id` 從 ucp-server 取明細。

**Merchant 需要做的**：

1. **提供一個穩定 URL 格式**，讓平台把 `permalink_url` 寫進 order object。例：
   ```
   https://merchant.com/orders/{order_id}
   ```
2. **該頁可以讀取 ucp-server 的訂單明細**。兩種實作：

   **B.1 透過 UCP API（demo 採用）**
   - Merchant 前端打 `GET https://ucp.platform.com/orders/:id`（帶 UCP-Agent + Request-Id）
   - 平台開 CORS 給 merchant origin
   - 優點：無需 merchant backend、無需同步訂單資料
   - 缺點：merchant 要能容忍跨域、依賴平台 uptime

   **B.2 Webhook 同步後自建（見 C）**
   - 訂單建立時平台 webhook → merchant 自己寫入自家 DB
   - Merchant 訂單頁從自家 DB 取
   - 優點：掌握自家資料、可客製化顯示
   - 缺點：需要 webhook infra + 雙 SOT 同步風險

> **平台建議**：demo 時期用 B.1 上線快；商家主流量成長後遷移到 B.2。

---

### C. 訂單事件 Webhook handler

**Merchant 需要提供一個 HTTPS 端點**，平台會在關鍵事件時 POST 過去：

```
POST https://merchant.com/hooks/ucp
Content-Type: application/json
X-UCP-Signature: <HMAC-SHA256 of body with shared secret>
X-UCP-Event: order.created | order.canceled | order.refunded
X-UCP-Delivery-Id: <uuid, 用於 dedupe>

{
  "event": "order.created",
  "timestamp": "2026-04-16T14:30:00Z",
  "order": { ... 完整 Order 物件 ... },
  "session": { "id": "chk_...", "permalink_url": "..." }
}
```

**Merchant 端義務**：

- **至少 `2xx` 回應** 才算 ack；平台用 exponential backoff 重試（最多 5 次，共 ~1h）
- **冪等處理**：同一 `X-UCP-Delivery-Id` 到兩次要能安全略過（replay 防護）
- **驗簽**：用共享 secret 算 HMAC-SHA256 比對 `X-UCP-Signature`，失敗就拒絕
- **處理時間 < 10s**：長任務請先 ack、背景處理

**事件清單（平台會發）**：

| event | 何時觸發 | merchant 該做 |
|---|---|---|
| `order.created` | `POST /checkout-sessions/:id/complete` 成功 | 入單、扣庫存、觸發出貨 |
| `order.canceled` | `POST /checkout-sessions/:id/cancel` 成功 | 釋放庫存 |
| `order.refunded` | 平台 admin 或 buyer 申請退款後 | 退款金流、標記訂單 |
| `order.shipped` | （若 merchant 出貨系統回報給平台） | - |

> **demo 未實作**：當前 demo 只 in-memory 建單，不發 webhook。上 production 時 ucp-server 要加 `orderEventBus` + HMAC signer。

---

### D. Payment handler ID 對接

**demo 當前狀況**：只支援 `google-pay-mock`（UI 假按鈕，server 端 mandate 簽章也是假的）。

**production**：

1. Merchant 告知想支援哪些金流：
   - Google Pay
   - Apple Pay
   - 收單 PSP（綠界 / TapPay / Stripe）
2. 平台配置 `payment_handlers` 對應的 processor ID 與 credentials
3. Merchant 提供 **receiving account**（PSP sub-account / Stripe Connect ID / 綠界特店編號）
4. 結帳時 `PaymentMandate` 的 `credential.token` 會由 buyer wallet（真實情境）簽給平台，平台再轉請 PSP 授權 → 入帳進 merchant 帳戶

**雙方 SLA 協議**：
- 手續費分潤（例如 2.5% PSP + 3% 平台佣金）
- 結算週期（T+3 / 月結）
- 爭議處理（chargeback / refund 由誰先承擔）
- 拒付額度（reserve）

---

### E. CORS / 網域設定

Merchant 要把自家商品頁、訂單頁的 origin 提供給平台，平台寫進 ucp-server 的 `UCP_ALLOWED_ORIGINS`：

```
UCP_ALLOWED_ORIGINS=https://merchant.com,https://www.merchant.com,https://ucp-sdk-host.platform.com
```

**Merchant 端要做**：

- **通知平台所有對外 origin**（包含 preview、staging）
- **若用 subdomain 切換**（如 `cart.merchant.com`）要事先申請
- **不可在 origin 後面加 path**（CORS 只吃 origin）
- 若 Merchant 自己的 CSP 嚴格，要加 `connect-src https://ucp-api.platform.com`

---

## 2. 平台（你）要提供給 Merchant 的東西

### 2.1 Onboarding 文件包

- API 規格：`ucp-server/openapi.yaml`（Swagger UI 可線上瀏覽）
- 接入流程 runbook（本文）
- Webhook payload schema + 簽章驗證範例（多語言）
- Test API credential（staging 環境）
- Postman collection / curl cookbook

### 2.2 Staging / Sandbox 環境

- URL：`https://ucp-staging.platform.com`
- 特色：
  - 不扣金流、不發真實 email
  - 訂單 24h 自動清除
  - 所有 webhook 事件只送到 merchant 的 staging endpoint
- Merchant 在 staging 跑通整合再切 prod

### 2.3 Dashboard

- 即時訂單 list、狀態篩選
- 退款 / 退訂操作 UI
- API key / webhook secret 管理
- 流量與轉化率儀表
- 結算單下載

### 2.4 SDK / Code samples

- 給 Merchant 的 demo integration：
  - Schema.org JSON-LD snippet
  - Order page 讀 UCP API 範例（React / Vue / vanilla JS）
  - Webhook handler 範例（Node / Python / Go）
  - 簽章驗證 code

### 2.5 SLA

| 指標 | 承諾 |
|---|---|
| ucp-server 可用性 | 99.9% / month |
| SDK CDN 延遲 | P95 < 200ms |
| Webhook delivery | 30s 內首發、1h 內重試完成 |
| 客服回應時間 | 工作日 4h 內初回 |

### 2.6 安全承諾

- buyer 卡號 / 個資不落地到 merchant（PCI scope 由平台承擔）
- 所有 mandate 簽章用平台 key，每 90 天輪替
- JWKS 公鑰端點讓 merchant 可驗 webhook 簽章
- 平台承擔 mandate replay / session hijack 的防禦

---

## 3. 雙方最小接口契約

### 3.1 資料進平台

Merchant → 平台：

| 項目 | 方向 | 契約 |
|---|---|---|
| 商品資料 | Merchant 自己 host，平台抓 | Schema.org JSON-LD（強建議） |
| 庫存查詢 | 平台問 Merchant API | `GET /api/products/:id/stock` |
| Payment account | Merchant 一次性設定給平台 | PSP sub-account ID |
| Order page URL | Merchant 告訴平台格式 | `https://merchant.com/orders/{order_id}` |
| Webhook endpoint | Merchant 告訴平台 | `https://merchant.com/hooks/ucp` |
| CORS origins | Merchant 告訴平台 | 完整 origin list |

### 3.2 資料出平台

平台 → Merchant：

| 項目 | 方向 | 契約 |
|---|---|---|
| 訂單通知 | 平台 POST Merchant hook | `order.created` / `.canceled` / `.refunded` 事件 |
| 訂單明細查詢 | Merchant GET ucp-server | `GET /orders/:id` with UCP headers |
| API key / secret | 平台 dashboard 發給 Merchant | rotate-able |
| 月結算報表 | 平台 email / dashboard | CSV + 明細 |

---

## 4. 接入時程範例（2 週 onboarding）

| Day | Merchant 端 | 平台端 |
|---|---|---|
| D0 | 填 onboarding form | 開 staging merchant account |
| D1–2 | 商品頁 embed JSON-LD | 爬蟲收錄並正規化 |
| D3–5 | 實作 webhook handler | 提供範例 code + staging webhook url |
| D6–7 | Order page 接 `GET /orders/:id` | CORS allowlist 加 merchant origin |
| D8 | 跑 staging E2E：建單→webhook→訂單頁渲染 | 監控 & 排錯 |
| D9 | 對齊金流 PSP 帳號 | 配置 payment handler |
| D10 | Merchant QA | 平台 review 安全設定 |
| D11–12 | Staging → Prod | 切流量、監控告警 |
| D13 | 首批訂單 smoke | 主動關心 |
| D14 | 正式上線 | 納入 dashboard 與 SLA |

---

## 5. 常見 Merchant 疑問

**Q1：為什麼買家結帳時不在我的域名？是不是我損失流量？**
A：UCP 的核心價值是「消費者不離開正在閱讀的內容就能買」，轉化率比「跳回 merchant 結帳」高 2–4 倍（產業數據）。流量反而導回 merchant 的 **訂單查詢** 與 **售後服務** 頁，是高意圖用戶。

**Q2：我已有自己的購物車系統，UCP 會取代嗎？**
A：不取代。UCP 是「跨媒體通路結帳層」；既有購物車仍在 merchant 站運作。你只是 **多一條銷售管道**，像多開一個實體店。

**Q3：買家資料會給我嗎？GDPR/個資怎辦？**
A：`Order` 物件包含 buyer（name/email/address）— 平台會在 webhook 中轉給你，與你自家購物車收到的資料一致。個資處理者（controller）登記在 merchant，平台是處理方（processor），簽 DPA。

**Q4：若 UCP 平台宕機我是不是也跟著停擺？**
A：**自家購物車不受影響**；只有 UCP 管道的銷售會暫停。Webhook 重試最多 1h；若 ucp-server 長時間宕，訂單會積壓在 staging queue 上，恢復後補發。

**Q5：金流是平台收還是我直收？**
A：技術上買家把錢授權給平台（PaymentMandate）→ 平台的 PSP 收單 → T+N 撥款進 merchant 帳戶。**對 buyer**，看到的是「向平台付款」；**對 merchant**，你拿到的是 **扣完手續費後的淨額 + 訂單**。

**Q6：我可以自訂 UI 嗎？**
A：Ad slot 的 Rich Product Card 樣式由平台 SDK 決定（Shadow DOM 隔離），保證跨 merchant 視覺一致。Merchant 可客製：商品圖、描述、品牌色（透過 catalog metadata）。CheckoutForm 暫不開放客製（安全考量）；未來開放主題色 / logo 覆蓋。

---

## 6. 若要參考 demo repo 的具體實作

- **商品 JSON-LD embed**：`ecommerce-frontend/src/pages/ProductPage.vue`
- **Order page 打 UCP API**：`ecommerce-frontend/src/pages/OrderLookupPage.vue` + `src/utils/ucpClient.js`
- **UCP client 的必填 headers**：`ecommerce-frontend/src/utils/ucpClient.js`（`UCP-Agent`, `Request-Id`）
- **CORS 正確設定方式**：`ucp-server/src/middleware/cors.ts`
- **Order 物件完整 shape**：`ucp-server/src/types/ucp.ts` + `openapi.yaml` 的 `Order` schema

Merchant engineer clone 下面兩個 repo 看就會實作：
- https://github.com/samChang72/ucp-agentic-commerce-demo
- https://github.com/samChang72/ecommerce-frontend（branch `feat/ucp-order-lookup`）

---

## 7. 一句話對齊

> **Merchant 出商品、出訂單頁、出 webhook；平台出 SDK、出 UCP server、出金流、出安全、出對帳。雙方只在 6 個明確接點交換資料（catalog、stock、payment account、order URL、webhook endpoint、CORS origins）。**
