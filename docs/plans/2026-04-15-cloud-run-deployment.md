# Cloud Run 部署指引（GCP project：`ucp-ec-demo`）

三個服務（ucp-server / publisher-site / ecommerce-frontend）各自獨立部署到同一 GCP 專案 `ucp-ec-demo`。本文件以 **免費方案** 為目標調整 flags。

> **前置**：
>
> ```bash
> gcloud config set project ucp-ec-demo
> gcloud config set run/region asia-east1   # Taiwan, 對 zh-Hant user 延遲最低
> gcloud auth login                          # 若尚未登入
> gcloud services enable run.googleapis.com cloudbuild.googleapis.com
> ```

## 免費方案關鍵 flags（每個服務都沿用）

```
--min-instances=0          # MUST — 有 min 就開始計費
--max-instances=3          # 控制暴量時的封頂，demo 夠用
--cpu=1                    # 預設即可，避免用 2+ vCPU 快速燒完 vCPU-seconds
--memory=512Mi             # 免費層記憶體 tier 友善值
--concurrency=80           # 預設，維持
--port=8080                # 容器需 listen 此 port
--allow-unauthenticated    # demo 開放
--timeout=60s              # 60s 限縮單請求時間
```

Cloud Run 永久免費額度（2026 rates）:
- 2M requests / month
- 360,000 vCPU-seconds
- 180,000 GiB-seconds memory
- 1 GB network egress（部份 region）

以 demo 流量估算三服務合計完全足夠；`--min-instances=0` 確保閒置時不計費。

---

## 1. ucp-server（最先部署，其他服務需要它的 URL）

```bash
cd /Users/sam/project/ucp-agentic-commerce-demo/ucp-server

gcloud run deploy ucp-server \
  --source . \
  --region=asia-east1 \
  --port=8080 \
  --min-instances=0 --max-instances=3 \
  --cpu=1 --memory=512Mi \
  --concurrency=80 --timeout=60s \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=development,UCP_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002,MERCHANT_URL=http://localhost:3000"
```

> `NODE_ENV=development` 是刻意的 — demo 依賴 `/internal/demo-sign-mandate` 需要非 production。正式場景應設 production 並改接真實 buyer wallet 簽章。

**部署完取得 URL**（例如 `https://ucp-server-abc123-de.a.run.app`），記為 `UCP_URL`：

```bash
UCP_URL="$(gcloud run services describe ucp-server --region=asia-east1 --format='value(status.url)')"
echo "UCP_URL=$UCP_URL"
```

---

## 2. publisher-site

Publisher 在 `index.html` 寫死了 UCP API URL。部署前以一次性替換產出 prod-ready html：

```bash
cd /Users/sam/project/ucp-agentic-commerce-demo/publisher-site

# 替換兩處 localhost:3001 為 Cloud Run URL
#   - window.__UCP_API__ = '...'
#   - <script src="...sdk.js">
sed -i.bak "s|http://localhost:3001|${UCP_URL}|g" index.html

gcloud run deploy publisher-site \
  --source . \
  --region=asia-east1 \
  --port=8080 \
  --min-instances=0 --max-instances=3 \
  --cpu=1 --memory=512Mi \
  --concurrency=80 --timeout=60s \
  --allow-unauthenticated

# 還原 index.html（避免影響 local dev）
mv index.html.bak index.html
```

取得 URL：

```bash
PUBLISHER_URL="$(gcloud run services describe publisher-site --region=asia-east1 --format='value(status.url)')"
```

---

## 3. ecommerce-frontend

該 repo 不在 umbrella 內，需切換路徑。`src/utils/ucpClient.js` 讀 `VITE_UCP_API_URL`（build-time env）：

```bash
cd /Users/sam/project/ecommerce-frontend

# 1. 寫入 build-time env
echo "VITE_UCP_API_URL=${UCP_URL}" > .env.production

# 2. 部署（Dockerfile 的 build 階段會讀到 .env.production）
gcloud run deploy ecommerce-frontend \
  --source . \
  --region=asia-east1 \
  --port=8080 \
  --min-instances=0 --max-instances=3 \
  --cpu=1 --memory=512Mi \
  --concurrency=80 --timeout=60s \
  --allow-unauthenticated

MERCHANT_URL="$(gcloud run services describe ecommerce-frontend --region=asia-east1 --format='value(status.url)')"

# 3. 清掉 .env.production（避免 commit 到 repo）
rm .env.production
```

---

## 4. 回頭更新 ucp-server CORS + MERCHANT_URL

三服務 URL 都拿到後，更新 ucp-server 環境變數：

```bash
gcloud run services update ucp-server \
  --region=asia-east1 \
  --update-env-vars="UCP_ALLOWED_ORIGINS=${MERCHANT_URL},${PUBLISHER_URL},MERCHANT_URL=${MERCHANT_URL}"
```

`--update-env-vars` 只覆寫這兩個 key，保留其他 env（`NODE_ENV` 等）。

---

## 5. 驗收

```bash
# healthz
curl -s "${UCP_URL}/healthz"

# catalog（非 UCP，demo-only）
curl -s "${UCP_URL}/catalog" \
  -H "UCP-Agent: profile=\"${PUBLISHER_URL}/profile\"" \
  -H "Request-Id: prod-smoke-1" | head

# 開瀏覽器走完整流程
open "${PUBLISHER_URL}"
# 應能完成結帳，permalink 點下去開 ${MERCHANT_URL}/order/ord_xxx

# 也可跑 Playwright 針對 prod（需先改 playwright.config.ts 的 baseURL）
BASE_URL="${PUBLISHER_URL}" npm run e2e
```

---

## 成本控制備忘

| 指標 | 預估（demo 流量） | 免費額度 | 狀況 |
|------|------------------|----------|------|
| Requests | < 10K / month | 2M | 充裕 |
| vCPU-seconds | < 1K | 360K | 充裕 |
| Memory GiB-seconds | < 500 | 180K | 充裕 |
| Network egress | < 100 MB | 1 GB (asia-east1 計價不同，見 GCP billing) | 充裕 |

- 若發現服務被頻繁喚醒（cold start 多），考慮 `--min-instances=1`，但會 **開始計費**
- `--max-instances=3` 是暴量保險絲，若被攻擊或爬蟲轟炸仍可能超額 — 可配合 Cloud Armor / rate-limit
- 三個服務一個閒置週一個月預估 < US$1

## 清理

```bash
gcloud run services delete ucp-server publisher-site ecommerce-frontend --region=asia-east1 --quiet
```

## 延伸

- 要改成「zero-config 持續部署」：改用 `Cloud Build trigger` 監聽 GitHub repo push
- 要綁 custom domain：`gcloud run domain-mappings create --service=<svc> --domain=<fqdn>`
- 要加 HTTPS-only / CSP header：在 nginx.conf / ucp-server middleware 加
