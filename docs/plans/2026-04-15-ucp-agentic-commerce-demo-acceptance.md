# UCP Agentic Commerce Demo — 驗收清單

> Jira：[FRON-5348](https://guoshi.atlassian.net/browse/FRON-5348)
> Branches：umbrella `feat/ucp-demo-implementation`、ecommerce-frontend `feat/ucp-order-lookup`
> Cloud Run target：GCP project `ucp-ec-demo`（asia-east1, 免費方案）

## 測試

- [x] **ucp-server vitest 全綠**：`cd ucp-server && npm test` → 71 tests / 11 files passing
- [x] **publisher-site Playwright 全綠**：`cd publisher-site && npm run e2e` → 4 tests passing（1 UI + 1 contract + 2 negative）
- [x] **ecommerce-frontend build 成功**：`cd /Users/sam/project/ecommerce-frontend && npm run build:app`
- [x] **publisher-site tsc 0 error**：`./node_modules/.bin/tsc --noEmit`

## 端到端功能

- [x] 從 publisher-site 完整走完結帳，得到 `ord_*`（Task 29 smoke + Task 36 E2E 都有覆蓋）
- [x] 點 permalink → ecommerce-frontend 顯示完整訂單（Task 30 實作 OrderLookupPage；Task 30 smoke 驗證 permalink 格式正確 + CORS 通過）
- [x] ProductPage 可見 Schema.org JSON-LD（Task 31；bundle 內含 `schema.org/Product` 引用）

## UCP 合規 / 安全

- [x] **Idempotency**：同 key 同 body POST 兩次回相同 session id（ucp-server test `returns cached response on same Idempotency-Key`）
- [x] **CORS**：非 allowlist origin 被拒（ucp-server middleware 實作 + E2E 用 allowed origin 驗證通過）
- [x] **Mandate 篡改偵測**：`verifyCheckoutMandate` 檢查 `checkout_hash`（ucp-server test `rejects tampered checkout_mandate`）
- [x] **狀態機**：cancel 後再 complete 回 409（E2E `cancel then complete is 409 UCP_INVALID_STATE`）
- [x] **replay 保護**：payment mandate `jti` 入 mandateStore，再次提交被拒（ucp-server test `rejects replayed payment mandate`）

## 容器化

- [x] **ucp-server Dockerfile**：多階段，node:20-alpine runtime，non-root user
- [x] **publisher-site Dockerfile**：nginx:1.27-alpine，`/healthz` probe
- [x] **ecommerce-frontend Dockerfile**：`build:app` 跳過 gh-pages-only 的 `deploy:onepixel`
- [x] **docker-compose.yml**：umbrella 內，`../ecommerce-frontend` 相對參照，service_healthy 依賴
- [ ] `docker compose up --build` 三服務啟動成功 ← **Docker daemon 本機離線，未實際 up**，待使用者本機 Docker 可用後確認

## 文件

- [x] ucp-server/README.md
- [x] publisher-site/README.md
- [x] ecommerce-frontend 既有 readme.md 加 UCP 整合段落
- [x] `ucp-server/openapi.yaml`（OpenAPI 3.0.3，標註 4 處偏離）
- [x] `docs/plans/2026-04-15-cloud-run-deployment.md`（project=ucp-ec-demo，免費方案 flags）
- [x] `docs/plans/2026-04-15-ucp-agentic-commerce-demo-plan.md`（原 plan，42 tasks）
- [x] `docs/plans/2026-04-15-ucp-agentic-commerce-demo-design.md`（design 決策）
- [x] `docs/plans/2026-04-15-ucp-demo-progress-checkpoint.md`（進度記錄）

## Jira

- [ ] FRON-5348 填實際投入時數並 resolve

---

## 與 plan 原文的主要偏離（已沉澱）

1. **publisher-site 位置**：plan 原寫獨立 repo `/Users/sam/project/publisher-site/`，實作改為 umbrella 內子資料夾 `publisher-site/`（checkpoint 有記錄），複用 umbrella `.gitignore`。
2. **Task 24 客戶端簽章**：plan 要求用 jose 在 browser 端簽 mandate；實作改為 ADR + stub，Task 25 直接接上 server-side `/internal/demo-sign-mandate/:id`（避免 install-then-uninstall jose 的多餘動作）。
3. **ucp-server permalink_url**：plan 寫 `/#/order/...`（hash router），但 ecommerce-frontend 用 history mode；修為 `/order/...`。
4. **JSON-LD 注入方式**：plan 放在 `<template>` 裡的 `<script>`，Vue 3 compiler 對字面 `<script>` 警告；改用 `<component :is="'script'">`+`v-html` 綁 computed JSON（同樣產出 `<script type="application/ld+json">`，但通過 compiler）。
5. **Currency**：plan Task 31 寫 TWD，實際 `ecommerce-frontend/src/assets/products.json` 是 USD，以實資料為準。
6. **port cleanup**：plan 未提；依執行期觀察 VSCode Live Preview 常占 3000/3001，新增 `scripts/free-port.sh` + npm `predev`/`prestart`/`prepreview`/`pree2e` hooks。

## 統計

- Umbrella：~55 commits on `feat/ucp-demo-implementation`
- ecommerce-frontend：4 commits on `feat/ucp-order-lookup`
- 測試：ucp-server 71 vitest + publisher-site 4 Playwright E2E
- 三服務 tsc / vite build / ts-compiled bundle 全綠
