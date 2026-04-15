# UCP Agentic Commerce Demo

Google Universal Commerce Protocol (UCP) 端到端示範系統。

## 結構

- `ucp-server/` — UCP REST API（Node 20 + Express + TS）
- `publisher-site/` — 第三方媒體站，嵌入廣告 SDK（Vite + TS）
- `../ecommerce-frontend/` — Merchant storefront（既有 Vue 3 SPA，不屬於本 repo）

## 規格依據

- UCP spec: https://ucp.dev
- 擬真度：90%（見 `../km/plans/2026-04-15-ucp-agentic-commerce-demo-design.md`）

## 快速啟動

```bash
# 三服務同時跑
docker compose up --build
```

- ecommerce-frontend: http://localhost:3000/ecommerce-frontend/
- ucp-server:          http://localhost:3001
- publisher-site:      http://localhost:3002

## Jira

[FRON-5348](https://guoshi.atlassian.net/browse/FRON-5348)
