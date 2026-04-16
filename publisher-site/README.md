# publisher-site

第三方媒體站示範（TechReview Taiwan 2026 最佳降噪耳機評測），嵌入 UCP 廣告 SDK 提供 Shadow DOM inline checkout。

## 開發

```bash
npm install
npm run dev        # :3002
```

`predev` 會清 port 3002。page 會從 `http://localhost:3001/sdk.js` 載入 UCP SDK skeleton，並由本 repo 的 Vite 模組 (`src/main.ts`) 註冊 `<ucp-ad-slot>` 自訂元素。

## 結構

```
src/
  main.ts                     # DOMContentLoaded → mountAdSlots()
  lib/
    ucpClient.ts              # 型別化 fetch wrapper（create / update / complete / catalog）
    clientMandate.ts          # requestMandates() — 呼叫 ucp-server demo 簽章端點
  components/
    AdSlot.ts                 # <ucp-ad-slot> Shadow DOM Rich Product Card
    CheckoutForm.ts           # inline 結帳表單（update → sign → complete）
  styles/
    article.css               # 文章頁樣式
tests/
  e2e/
    fullFlow.spec.ts          # Playwright E2E（4 tests）
```

## E2E

```bash
npm run e2e         # pree2e 會清 3001 / 3002，Playwright webServer 自動拉兩端
npm run e2e:ui      # interactive UI mode
npm run e2e:report  # 上次 HTML report
```

相依 `@playwright/test@^1.59`（對齊 user-scope chromium-1217）。若未來跨機需安裝瀏覽器：`npx playwright install chromium`。

## 環境假設

`index.html` 中：

```html
<script>window.__UCP_API__ = 'http://localhost:3001';</script>
<script src="http://localhost:3001/sdk.js"></script>
```

正式部署前，將 `__UCP_API__` 字面值（或改為 `import.meta.env.VITE_UCP_API_URL`）替換為 ucp-server Cloud Run URL。

## Docker

```bash
docker build -t publisher-site:dev .
docker run --rm -p 8082:8080 publisher-site:dev
```

Nginx 靜態站，healthcheck 在 `/healthz`。Cloud Run 部署見 `../docs/plans/2026-04-15-cloud-run-deployment.md`。

## 架構備忘

- `<ucp-ad-slot>` 用 `attachShadow({ mode: 'open' })` + `:host { all: initial }` 隔離頁面樣式
- Shadow DOM 內渲染 Schema.org 形狀的 product card（title / image / price / availability / rating）
- 點「立即購買」→ `createSession` → 同一 Shadow root 中展開 `CheckoutForm`
- submit → `updateSession` → `requestMandates`（server-side 簽 ES256 JWT）→ `completeSession` → 顯示 `ord_*` permalink
