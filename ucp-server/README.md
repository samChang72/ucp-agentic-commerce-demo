# ucp-server

Google Universal Commerce Protocol (UCP) 實作原型，90% 擬真（見 `../docs/plans/2026-04-15-ucp-agentic-commerce-demo-design.md` §4）。

## Endpoints

| Method | Path | 說明 |
|--------|------|------|
| POST | `/checkout-sessions` | 建立結帳 session |
| GET  | `/checkout-sessions/:id` | 取得 session |
| PUT  | `/checkout-sessions/:id` | 更新 buyer / fulfillment / payment |
| POST | `/checkout-sessions/:id/complete` | 驗證 mandate 並建立訂單 |
| POST | `/checkout-sessions/:id/cancel` | 取消 session |
| GET  | `/orders/:id` | 取得訂單（merchant OrderLookupPage 使用） |
| GET  | `/catalog` | **非 UCP 標準**（demo-only，`X-UCP-Extension: demo-catalog`） |
| GET  | `/.well-known/jwks.json` | 公鑰（ES256） |
| POST | `/internal/demo-sign-mandate/:id` | **Dev-only**：回傳 server-signed checkout/payment mandate（`NODE_ENV !== 'production'`） |

## Required headers（mutations）

- `UCP-Agent: profile="<agent profile URL>"`
- `Idempotency-Key: <uuid>`（POST/PUT 強制）
- `Request-Id: <uuid>`

## 開發

```bash
npm install
npm run dev       # listen :3001，預設會先清 port
npm test          # vitest（~71 tests / 11 files）
```

`predev` / `prestart` 會執行 `../scripts/free-port.sh` 清掉佔用 PORT 的 process。

## 環境變數

| Name | 預設 | 用途 |
|------|------|------|
| `PORT` | `3001` | 監聽 port（Cloud Run 會帶 `8080`） |
| `NODE_ENV` | `development` | 若為 `production`，停用 `/internal/demo-sign-mandate` |
| `UCP_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3002` | CORS allowlist（逗號分隔） |
| `UCP_ISSUER` | — | JWT `iss` claim（未設時使用內建預設） |
| `MERCHANT_URL` | `http://localhost:3000` | `order.permalink_url` 前綴 |

## 與官方 UCP 的偏離

詳見 `openapi.yaml` 的 `info.description` 與 design 文件 §4：
- PaymentMandate 用 ES256 JWS + trailing `~`（SD-JWT-VC shape 但無 selective disclosure）
- RFC 9421 僅 response 產簽，request 不強制驗簽
- Identity Linking 未實作 OAuth
- `/catalog` 為 demo extension（真實 UCP 從 merchant JSON-LD / GMC feed 取得）

## Docker

```bash
docker build -t ucp-server:dev .
docker run --rm -p 3001:8080 \
  -e NODE_ENV=development \
  -e UCP_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:3002" \
  ucp-server:dev
```

Cloud Run 部署見 `../docs/plans/2026-04-15-cloud-run-deployment.md`。
