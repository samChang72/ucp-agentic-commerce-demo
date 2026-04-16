# UCP Demo 執行進度 Checkpoint

> 最後更新：2026-04-16（M5 結束，準備進入 M6 文件 + 部署）
> Jira：[FRON-5348](https://guoshi.atlassian.net/browse/FRON-5348)

## 當前位置

- **Umbrella repo**：`/Users/sam/project/ucp-agentic-commerce-demo/`
- **Branch**：`feat/ucp-demo-implementation`
- **HEAD SHA**：(Task 29 完成時的 checkpoint 本身為 HEAD)
- **狀態**：working tree clean（唯 `.claude/` 未追蹤）

## 進度總覽

**完成 38/42 tasks（90%），umbrella ~52 commits + ecommerce-frontend 3 commits on `feat/ucp-order-lookup`**

- ucp-server: 71 tests / 11 files passing（vitest, 1.81s）
- publisher-site: 4 E2E passing（Playwright chromium, 6.3s），tsc 0 errors
- ecommerce-frontend: vite build 成功

### M1 ucp-server 骨架 ✅（Task 1–10）
- Task 1: init ucp-server — `ab338ae` + `b24c1b8` (tsconfig + engines 修正)
- Task 2: UCP 型別 — `9b58701` + `ecd37c9` (Item + Adjustment 抽出)
- Task 3: in-memory stores — `925d2c8` + `8639fa9` (補 4 個 store 的測試)
- Task 4: ES256 JWT lib — `4dd8142` + `a589c4f` (cold-start race + KEY_DIR module-relative)
- Task 5: state machine — `a5a4f7e` + `e72ac7c` (IllegalTransitionError class)
- Task 6: UCP headers middleware — `1666341` + `71cff28` (regex 收緊 + 細分 error codes)
- Task 7: CORS middleware — `9d93efc` + `432804b` (filter 空 origin + maxAge)
- Task 8: idempotency middleware — `ca8d408` + `42b91e3` (skip 5xx + wrap res.send)
- Task 9: signature producer — `6f4b644` + `620f657` (log errors + doc parity)
- Task 10: Express bootstrap — `b3711ee` + `92ceae0` (graceful shutdown + error handler)

### M2 UCP 端點 + Mandate（進行中，Task 11–20）
- Task 11: Mandate libs — `1ebb53d` + `4b2f576` (jti guard + 3 negative tests)
- Task 12: POST /checkout-sessions — `0b21f67` + `dd0c806` (typed errors + body validation)
- Task 13: GET + PUT /checkout-sessions/:id — `2819e21` + `ab00243` (immutable update + 409 mapping)
- Task 14: POST /complete + orders.ts — `f4d4090` + `3933d7a` (split request vs mandate errors)
- Task 15: POST /cancel — `7f86f01` + `5de9d8e` (ready_for_complete + double-cancel tests)
- Task 16: GET /catalog (demo-only) — `e5ad59f` ✅ approved clean
- Task 17: ucp-server Dockerfile — `9fec8ab` + `854c3f5` (USER node non-root)
  - ⚠️ **Docker daemon 離線，build/smoke 未執行**。重啟後如需驗證 container：
    `cd ucp-server && docker build -t ucp-server:dev . && docker run --rm -p 8080:8080 ucp-server:dev`
- Task 18: smoke script — `35f11c7` ✅ (scripts/smoke.sh runs end-to-end)
- Task 19: public/sdk.js skeleton — `316ea11` + `177d101` (fix: location.origin fallback + charset + Cache-Control) ✅
- Task 20: M2 完成標記 — 於本 checkpoint 記錄 ✅

**M2 完成 🎉**：UCP 端點（create/get/update/complete/cancel）+ catalog + mandate lib + Dockerfile + smoke + SDK skeleton 皆已就緒，working tree clean。

### M3 publisher-site ✅（Task 21–29）

publisher-site 落地於 umbrella repo `publisher-site/`（非獨立 repo），複用 umbrella `.gitignore`。

- Task 21: init Vite + TS scaffold — `1f05ba5`
- Task 22: 文章頁 HTML + CSS — `45fbed6` (zh-Hant TechReview Taiwan + data-ucp-ad slot)
- Task 23: ucpClient.ts — `3b0c496` (typed create/update/complete/catalog + UCP headers)
- Task 24: clientMandate stub + ADR — `e6322d5` (skip jose client-sign dead end)
- Task 25: `/internal/demo-sign-mandate/:id` + SDK integration — `d21f6c5` (+3 tests, 68→71 passing)
- Task 26: Shadow DOM AdSlot (Rich Product Card) — `3503f51` (`:host all:initial`, Schema.org consume)
- Task 27: CheckoutForm inline flow — `3d9a217` (update → sign → complete + gpay mock gate)
- Task 28: Dockerfile + nginx.conf + .dockerignore — (多階段 build → nginx:1.27-alpine, :8080, /healthz)
  - ⚠️ Docker daemon 離線，build/smoke 未執行（同 Task 17）
- Task 29: M3 驗收 — HTTP 整合 smoke 通過（create→update→sign→complete→order 生成 ord_xxx，total 8390）
  - UI 互動留待 Task 36 Playwright E2E

### M4 ecommerce-frontend ✅（Task 30–33）

ecommerce-frontend 仍在獨立 repo `/Users/sam/project/ecommerce-frontend/`，PR branch `feat/ucp-order-lookup`（自 `main` 切出）。

- Task 30: OrderLookupPage — ecommerce-frontend@`504880f`（`src/utils/ucpClient.js` + `src/pages/OrderLookupPage.vue` + router `/order/:id`）
  - 搭配 umbrella `143295a` fix(api)：`permalink_url` 拿掉 `#`（ecommerce-frontend 為 history mode）
- Task 31: ProductPage Schema.org JSON-LD — ecommerce-frontend@`c64fdb7`
  - 用 `<component :is="'script'">` + `v-html` 注入（繞過 Vue template compiler 對字面 `<script>` 的警告）
  - 貨幣 `USD`（以 `src/assets/products.json` 實資料為準，plan 原寫 TWD 為誤）
- Task 32: Dockerfile + nginx.conf + `build:app` — ecommerce-frontend@`1852bee`
  - `build:app` 避開 `deploy:onepixel`（gh-pages 專用）
  - 把 `docs/` 拷到 `/usr/share/nginx/html/ecommerce-frontend`，對齊 vite `base: /ecommerce-frontend/`
  - Docker daemon 離線，build/smoke 未跑（同 Task 17/28）
- Task 33: M4 roll-up — 本 checkpoint 記錄
  - 跨 repo HTTP smoke（Task 30 內跑過）：create→update→sign→complete 產 `ord_dbe952f7`，permalink 正確指向 `/ecommerce-frontend/order/ord_*`，CORS allow `localhost:3000`，`/orders/:id` 回 items/totals

### M5 聯調 + E2E ✅（Task 34–38）

- Task 34: umbrella 內 `docker-compose.yml` — `a971494`（`../ecommerce-frontend` 相對參照；alpine wget healthcheck；service_healthy 依賴；Docker daemon 離線未實跑）
- *port-cleanup*: `scripts/free-port.sh` + predev/prestart/prepreview/pree2e hooks — `52634ac`
- Task 35: `@playwright/test@1.59.1` + `playwright.config.ts`（webServer 自動拉 ucp-server 3001 + publisher-site 3002）— `437b128`
- Task 36: `tests/e2e/fullFlow.spec.ts` — `58da399`（Shadow DOM 全流程 + API contract）
- Task 37: negative paths（missing UCP-Agent → 400、cancel→complete → 409）— `58da399` 之後的 commit
- Task 38: M5 roll-up — 本 checkpoint 記錄；ucp-server vitest + publisher-site Playwright + ecommerce-frontend build 全綠

### 待續

- **下一步**：Task 39 — 三個服務各一份 README（ucp-server / publisher-site / ecommerce-frontend）
- M6 文件 + 部署（Task 39–42）

## 關鍵設計決定（已沉澱）

- UCP 90% 擬真（B 方案，見 `2026-04-15-ucp-agentic-commerce-demo-design.md` §4）
- `/catalog` 為非 UCP 標準 demo endpoint（`X-UCP-Extension: demo-catalog`）
- PaymentMandate SD-JWT-VC shape（trailing `~`）無真正 selective disclosure
- RFC 9421 簽章只產生 response header，不驗證 request 簽章
- SDK 端 mandate 簽章改走 server side `/internal/demo-sign-mandate`（Task 25，尚未實作）
- 三服務皆獨立 Dockerfile 可部署 Cloud Run（使用者自行部署）
- ecommerce-frontend 保留原位，docker-compose 以 `../ecommerce-frontend/` 相對路徑參照

## Restart 後恢復流程

1. 進入 umbrella：`cd /Users/sam/project/ucp-agentic-commerce-demo && git status`（應在 `feat/ucp-demo-implementation`, clean）
2. 驗證 ucp-server tests：`cd ucp-server && npm test` → 71 / 11 passing
3. 驗證 publisher-site E2E：`cd publisher-site && npm run e2e` → 4 passed
4. 檢查 ecommerce-frontend：`cd /Users/sam/project/ecommerce-frontend && git status`（應在 `feat/ucp-order-lookup`），`npm run build:app` 應通過
5. 從 **Task 39** 接起（三個服務各寫 README）

## 執行模式

- 策略：**A**（每 task 完整三階段：implementer → spec reviewer → code quality reviewer → fix loop）
- 設定：權限已加入常用指令 allowlist（見 `~/.claude/settings.json`）
