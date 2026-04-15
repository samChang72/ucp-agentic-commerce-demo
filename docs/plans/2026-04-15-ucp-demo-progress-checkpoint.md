# UCP Demo 執行進度 Checkpoint

> 最後更新：2026-04-15（M2 結束，準備進入 M3 publisher-site）
> Jira：[FRON-5348](https://guoshi.atlassian.net/browse/FRON-5348)

## 當前位置

- **Umbrella repo**：`/Users/sam/project/ucp-agentic-commerce-demo/`
- **Branch**：`feat/ucp-demo-implementation`
- **HEAD SHA**：`dfe6ddb` — `docs: relocate UCP plan, design, and progress checkpoint into repo`
- **狀態**：working tree clean

## 進度總覽

**完成 20/42 tasks（48%），~36 commits，68 tests / 11 test files passing，tsc 0 errors**

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

### 待續

- **下一步**：Task 21 — 初始化 publisher-site（Vite + TS，新 repo `/Users/sam/project/publisher-site`）
- M3 publisher-site（Task 21–29）
- M4 ecommerce-frontend（Task 30–33）
- M5 聯調 + E2E（Task 34–38）
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

1. 進入 repo：`cd /Users/sam/project/ucp-agentic-commerce-demo && git status`（應在 `feat/ucp-demo-implementation`, clean, HEAD=`177d101`）
2. 驗證 ucp-server tests：`cd ucp-server && npm test` → 68 / 11 passing
3. 重啟 subagent-driven skill：`/skill superpowers:subagent-driven-development`
4. 從 **Task 21** 接起（publisher-site 新 repo 初始化 Vite + TS）

## 執行模式

- 策略：**A**（每 task 完整三階段：implementer → spec reviewer → code quality reviewer → fix loop）
- 設定：權限已加入常用指令 allowlist（見 `~/.claude/settings.json`）
