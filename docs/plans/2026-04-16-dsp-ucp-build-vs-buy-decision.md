# DSP 接入 UCP（Universal Commerce Protocol）— Build vs Buy 決策分析

> **受眾**：DSP 公司 CEO / 董事會 / BD head / CTO
> **日期**：2026-04-16
> **作者**：依本 repo（ucp-agentic-commerce-demo）工程實作經驗整理
>
> **一句話結論**：DSP 不應直接自架 UCP server。**建議階段式推進 C（現成 shoppable ads）→ B（第三方 agentic commerce provider）→ A（自架 UCP）**，以 2026 年市場成熟度與 DSP 核心競爭力為依據。

---

## 1. Executive Summary

### 1.1 問題

DSP 在 publisher 端已有廣告版位，希望把「廣告 → 購買」路徑收斂到 in-ad inline checkout（不跳轉 merchant 站）。技術層有三種實作路徑，商業層的選擇會決定 12–24 個月的成本結構、風險敞口、與護城河類型。

### 1.2 三條路摘要

| 選項 | 描述 | 時間 | 前期成本 | 風險 |
|---|---|---|---|---|
| **A. 自架 UCP** | 自建完整 UCP server（照本 repo scale） | 8–12 個月到 GA | US$1–3M | 高（合規、金流、信任建立） |
| **B. 第三方 commerce provider** | 接 Stripe / Shopify / 同類 API，自己做 ad slot SDK + orchestration | 2–3 個月 MVP | US$200–400K | 中（綁 vendor、分潤） |
| **C. 現成 shoppable ads** | Google Shopping / Meta Shops / TikTok Shop | < 1 個月 | 近零 | 低（僅平台生態內） |

### 1.3 核心建議

**採「C → B → A」階段式推進**：

- **Phase 1（M0–M3）**：選項 C，驗證 publisher audience 購買力假設
- **Phase 2（M3–M9）**：選項 B，自建 ad slot SDK + orchestration、金流外包
- **Phase 3（M9+）**：若 GMV 證明值得（> US$30M/年），再評估 A

---

## 2. 市場現況（2026 年，需在決策前核對）

> **重要免責**：本節資訊參考截至 2025 Q2 的已知產業動態；2026 年當下可能有新進者或已下架產品，BD 需在最終決策前重新 scan。

### 2.1 已公開且成熟的 commerce + agent 方向

| Provider | 產品 | 適用 DSP 的路徑 | 成熟度 |
|---|---|---|---|
| **Stripe** | Agent Toolkit + Commerce APIs + Financial Connections | 選項 B 首選：金流 + payment mandate + 反詐，有 webhook、SDK、合規資源 | 高（已 GA） |
| **Shopify** | Storefront API + Hydrogen + Headless Checkout | 若 publisher 網絡上的 merchant 已在 Shopify，可直接接 | 高 |
| **OpenAI** | Operator / Instant Checkout | 談戰略合作、借用 agent 流量 | 中（2025 推出） |
| **Anthropic** | Computer Use / Claude SDK | 類似 OpenAI，agentic 流量導入 | 中 |
| **Perplexity Shopping** | Sponsored Shopping | 廣告 inventory 增量 | 中（部分功能） |

### 2.2 UCP 協定本身與相關標準化

| 單位 | 輸出 | 對 DSP 的意義 |
|---|---|---|
| **Google UCP spec** | Universal Commerce Protocol 規範（2024） | 是本 demo 對標的標準；未提供 turnkey hosted service |
| **W3C Agentic Commerce CG** | 標準化工作組（進行中） | 參與可影響規格、但短期無產品 |
| **AP2（Agentic Payments Protocol）** | CheckoutMandate / PaymentMandate 規範 | Mandate JWS shape 的來源；demo 實作 90% 擬真 |

### 2.3 Turnkey UCP-as-a-Service 現況

**截至 2025 Q2，市場上沒有明確的「UCP-as-a-Service」turnkey 供應商**。

最接近的組合是：
```
Stripe（金流 + mandate 概念） + 自己包 UCP spec 外殼 ≈ 選項 B
```

**2026 年需要確認（BD 查新）**：

- [ ] Stripe 是否推出 `CommerceProvider for Publishers` 產品
- [ ] Shopify 是否開放 Publisher SDK（目前集中在 merchant 側）
- [ ] Google 是否 open source UCP reference server 實作
- [ ] AWS / Azure / GCP 是否有 agentic commerce 託管方案
- [ ] 台灣在地（綠界 / TapPay / 藍新）是否出 agentic SDK
- [ ] 既有 commerce media 平台（Rokt / Firework / Bambuser）是否支援 UCP 外掛

---

## 3. 三選項深度比較

### 3.1 選項 A：自架 UCP server

#### 3.1.1 必做工作項
- UCP 協定 server（checkout session / order / mandate 簽驗）— 本 demo 的 90% 範圍
- 金流整合（PCI-DSS level 1，PSP 多家）
- 防詐（device fingerprint、velocity check、chargeback handling）
- 金鑰管理（ES256 + rotation + JWKS published）
- 資料庫 + 分散式 idempotency store + event queue
- Merchant onboarding dashboard + API portal
- 24/7 NOC + Incident response
- 合規（PCI、GDPR、個資法、反洗錢 AML/KYC）

#### 3.1.2 成本

| 項目 | 年度 |
|---|---|
| 工程團隊（5–8 人：backend 3、security 1、devops 1、SRE 1、frontend SDK 1） | US$800K–1.5M |
| 雲端基礎設施 + CDN | US$50–200K |
| 合規稽核（PCI QSA、SOC2、滲透測試） | US$150–300K |
| 法律 / 金流協定 / 保險 | US$100–200K |
| **合計首年** | **US$1.1–2.2M** |

#### 3.1.3 護城河類型
- **資料護城河**：拿到所有買家行為資料餵回 DSP bidding model（最大價值）
- **關係護城河**：直連 merchant，不被中間平台抽成
- **品牌護城河**：「最完整 agentic commerce 平台」的 positioning

#### 3.1.4 風險
- **時間風險**：12 個月沒有收入回流
- **信任風險**：買家第一次看到 agentic checkout，對小 DSP 品牌的信任門檻高
- **合規風險**：PCI 出問題一次可能整個業務停擺
- **規模風險**：若 GMV < US$30M/年，自建成本攤銷不下來

#### 3.1.5 何時選 A
- 年 GMV 預期 > US$50M
- 已有 payment / compliance team（或能快速挖角）
- 可承受 12 個月 US$1M+ 沒有 commerce 收入
- UCP / checkout 是公司的核心戰略（不只是 commerce 的副產品）

---

### 3.2 選項 B：接第三方 + 自做 orchestration

#### 3.2.1 架構
```
Publisher ad slot
     │
     ├─ DSP SDK（你做：Shadow DOM ad + inline UI）
     │
     └─ checkout → Stripe Commerce API（他們做：金流、mandate、防詐）
                    │
                    └─ webhook → merchant（他們自己 handle）
```

#### 3.2.2 必做工作項
- Ad slot SDK（Shadow DOM web component；可直接沿用本 demo 架構）
- Session orchestration（DSP 做 session lifecycle、把資料往 Stripe 丟）
- Merchant onboarding UI（接 Stripe Connect + 自家 dashboard）
- Reporting 與對帳（從 Stripe API 拉 + 自家補強）

#### 3.2.3 不用做
- 金流收單 / PCI
- Mandate 簽章 / JWKS / 金鑰管理
- 防詐演算法
- 24/7 金流維運

#### 3.2.4 成本

| 項目 | 年度 |
|---|---|
| 工程團隊（2–3 人：frontend SDK 1、backend orchestration 1–2） | US$300–500K |
| 雲端 + CDN（minimal） | US$20–60K |
| Stripe 交易費（2.5% + US$0.30 per txn） | 依 GMV 計，通常 merchant 端承擔 |
| Stripe Connect 平台費（可選） | US$2/activated merchant/month |
| **合計首年（不含交易費）** | **US$320–560K** |

#### 3.2.5 護城河類型
- **速度護城河**：2–3 個月上線、搶 first-mover
- **經驗護城河**：先累積 publisher x merchant 雙邊網路
- **資料護城河（有限）**：可以拿部分買家資料做 DSP bidding
- **切換成本（rent）**：綁 Stripe，未來想搬要付時間成本

#### 3.2.6 風險
- **平台依賴**：Stripe 政策轉向（漲價、下架某國家）直接衝擊
- **分潤壓縮**：Stripe 拿 2.5–3% 金流費；DSP 想收 agentic layer 的 premium 空間被壓
- **品牌稀釋**：買家看到 Stripe logo 而非 DSP 品牌
- **資料限制**：Stripe 不會把所有 buyer fingerprint 給你

#### 3.2.7 何時選 B
- 2026 年此刻大多數 DSP 的正確選擇
- 想在 3 個月內拿實戰數據證明商業模式
- 團隊 < 10 人工程
- GMV 預期 US$5–50M

---

### 3.3 選項 C：現成 shoppable ads 不做 UCP

#### 3.3.1 具體做法
- Google Ads Performance Max + Merchant Center
- Meta Advantage+ Shopping Campaigns
- TikTok Shop Ads
- Pinterest Shopping
- 三方廣告驗證：IAB OpenRTB deals

#### 3.3.2 必做工作項
- Merchant 資料準備（Merchant Center / Commerce Manager feed）
- DSP 和 SSP 的 deal 設定（若你在做 programmatic）
- 轉化追蹤（Google tag / Meta Pixel）
- Creative production（shoppable video / image）

#### 3.3.3 成本
- 主要是 media spend（廣告本身）+ 約 15–30% 平台分成
- 工程成本幾乎為零（現成平台）

#### 3.3.4 局限
- **平台封閉生態**：買家離開廣告到 Google/Meta 流量才完成交易，DSP 拿到的資料極少
- **UCP 特性缺失**：沒有跨域 inline checkout、沒有 agent-friendly API
- **費率高**：15–30% 分成 vs UCP 路徑的 1–5%

#### 3.3.5 何時選 C
- 純粹想驗證假設「我的 publisher audience 有沒有買東西的意願」
- 0 技術投入預算
- 年 GMV 預期 < US$5M
- 已經在用 Google/Meta 廣告平台，品類與 merchant 都對得上

---

## 4. DSP 決策 matrix

以「DSP 老闆此刻要做的選擇」為視角：

| 判斷點 | 選 A | 選 B | 選 C |
|---|---|---|---|
| **年 GMV 預期** | > US$50M | US$5–50M | < US$5M |
| **UCP 是否為公司核心差異化** | 是 | 否 | 否 |
| **有 PCI / 合規 / 金流團隊** | 有 | 沒有 | 沒有 |
| **可接受 time-to-market** | 12 個月+ | 2–3 個月 | < 1 個月 |
| **資金儲備** | > US$5M 12 個月 runway | > US$1M | < US$500K |
| **對買家 first-party data 的掌控慾** | 高 | 中 | 低 |
| **對 merchant 的直接掌控** | 強 | 中 | 弱（平台中介） |
| **預期平台分潤接受度** | 0% 給第三方 | 1–3% 給 Stripe | 15–30% 給 Google/Meta |
| **對品牌可見度要求** | 強 | 中 | 弱 |
| **技術團隊規模** | 15+ 工程 | 5–10 工程 | 1–2 工程 |

---

## 5. 階段式推進建議

### Phase 1（M0–M3）：選 C 開跑

**目標**：驗證「publisher audience 有購買意願」這個未被證實的假設。

**動作**：
- Publisher inventory 挑 3–5 個高 commerce-intent 品類（3C、美妝、服飾）
- 用 Google Performance Max + Meta Shops ads 在既有廣告版位試投
- 不寫任何後端代碼

**交付**：
- 各品類的 CVR / AOV / CPA benchmark
- publisher audience 購買力分級
- 值不值得做 B 的 go/no-go 決策資料

**成本**：廣告 spend + 小量分析師工時 ≈ US$50K 測試預算

**風險**：低（既有平台既有費率）

**決策 gate**：若 CVR > 0.8% 或 monthly GMV > US$200K，才進 Phase 2。

---

### Phase 2（M3–M9）：選 B 擴張

**目標**：擁有 first-party checkout 體驗 + buyer behavioral data。

**動作**：
- 採 Stripe（或驗證時點的同類第三方）做 checkout + mandate
- 自研 ad slot SDK（可以**直接套用本 demo 的 publisher-site 架構**，把 ucp-server 的動態部分替換成 Stripe 呼叫）
- Merchant onboarding：提供 JSON-LD embed guide + webhook handler 範例（本 demo 的 merchant integration guide 可直接 fork 使用）
- Dashboard：訂單、結算、退款管理
- Staging + prod 雙環境

**交付**：
- 2–3 個月 MVP 上線
- 5–10 個 pilot merchant
- Monthly GMV 追蹤

**成本**：
- 工程團隊 3 人 × 6 個月 × 月薪 US$15K ≈ US$270K
- 雲端 + 基礎設施：US$60K / 年
- Stripe 交易費：GMV × 2.5–3%（通常可與 merchant 分潤 cover）
- **合計首年非交易成本：~US$330K**

**決策 gate**：若 12 個月後 annualized GMV > US$30M 且 contribution margin > 15%，才進 Phase 3。

---

### Phase 3（M9–M24）：評估 A 自架

**觸發條件**：
1. Phase 2 驗證單位經濟模型（unit economics）— contribution margin > 15%
2. Stripe 成本（2.5–3% × GMV）每年 > US$1M，自建攤銷合算
3. 取得足夠 buyer 資料證明「自家 DSP bidding 用這些資料可以 outbid 其他 DSP」
4. 有合規人才儲備（PCI QSA 合作意願、AML 流程）

**動作**：
- 逐步把 Stripe 金流替換為自家 UCP server
- Ad slot SDK 可 100% 沿用（architecture 不變）
- Merchant API 維持向後相容（merchant 不用改動太多）
- 金流 PSP 可以與 Stripe 並行保持彈性（避免 single point of failure）

**成本**：參 §3.1.2

**競爭效應**：此階段你會成為 **DSP x Commerce Platform** 混合體；定位接近 2020 年代的 The Trade Desk + Shopify combo。

---

## 6. 本 demo repo 的定位（你手上這個產物）

這個 `ucp-agentic-commerce-demo` repo **不是 production 啟動資產**，但有下列高價值用途：

### 6.1 對 Publisher BD 的 demo asset
- 實機跑 `npm run e2e` 展示 inline checkout 流程
- 讓 publisher 工程師看 `publisher-site/` 源碼，確認 Shadow DOM 不污染他們的版面
- 建立「DSP 有能力提供這種廣告版位」的技術可信度

### 6.2 對 Merchant BD 的 demo asset
- 直接拿 `docs/plans/2026-04-16-merchant-integration-guide.md` 當 onboarding brochure
- 讓 merchant 工程師看 `ecommerce-frontend/` 的接入範圍，知道「接你要付出什麼」
- 60 分鐘內讓 merchant CTO 知道能不能接

### 6.3 對自家工程 / PM 的教育資產
- 工程師透過實作理解 UCP、SD-JWT-VC、RFC 9421、CheckoutMandate 等術語
- PM 看 consumer journey doc（§2 of `information-architecture-consumer-journey.md`）理解 end-user 體驗
- 之後無論選 B 或 A，都是有效的 technical baseline

### 6.4 對投資人 / 董事會的佐證
- 「我們能造一個完整 UCP 實作」的技術 credibility
- 用本 repo 展示 **三個選項 BD 都談得下來**的技術底氣
- 不需要真的把這個 repo scale up 成 production

### 6.5 對競品的防禦
- 若競品搶先做 UCP，你有可以快速 fork 的 baseline
- 技術 option value，不花錢就持有

---

## 7. 風險與 open questions

### 7.1 不可忽視風險

| 風險 | 影響 | 緩解 |
|---|---|---|
| **UCP spec 被 Google 自己廢棄或大改** | 所有 A 路徑投入打水漂 | B 路徑風險較低（Stripe 有商業誘因繼續支持） |
| **主要金流夥伴（Stripe）政策變化** | B 路徑成本突增或功能縮水 | 多家金流並行；與 PSP 簽長期合約 |
| **買家信任門檻** | 所有路徑的轉化都受影響 | 和知名 merchant 共同背書；清楚的 UCP 驗證 badge |
| **Ad blocker / browser privacy 措施** | SDK 被擋、Shadow DOM 仍可被 ad blocker 捕獲 | First-party JavaScript、non-tracking-like SDK 設計 |
| **跨國稅務 / 合規** | 不同國家金流、稅務、退貨政策差異 | 先聚焦單一市場，再逐國擴張 |

### 7.2 Open questions（決策前要釐清）

- [ ] 我們的 publisher inventory 裡，有多少 impression 是可以被歸類為 commerce-intent？
- [ ] 手上前 10 大 merchant（若有）中，有多少在 Shopify 生態？（決定 B 用 Stripe 還是 Shopify）
- [ ] 股東 / 董事會對「12 個月沒 commerce 收入」的接受度？（排除 A 的快速推進）
- [ ] 競爭對手（其他 DSP）有沒有已公開的 UCP 路線圖？
- [ ] 亞太 / 台灣在地金流（綠界、TapPay）與 UCP / agentic commerce 的整合路線？
- [ ] 和 merchant 現有 CRM / order system 的雙向同步預期是什麼？

---

## 8. 建議的 30 天下一步

| 週次 | 動作 | 負責人 | 產出 |
|---|---|---|---|
| W1 | 核對 §2 的第三方 landscape（2026 新進展） | BD head | update memo |
| W1 | 盤點 publisher inventory 中 commerce-intent 流量 | Ad ops | impression 分級 list |
| W2 | 接洽 Stripe / Shopify 談 publisher integration | BD + 技術 lead | 雙方 pricing / roadmap |
| W2 | 本 demo 跑一次內部 review（工程 / PM / BD 都看） | 工程 lead | 團隊共識 |
| W3 | Phase 1 試投計畫細化（選哪些品類、預算、成功指標） | Growth | Phase 1 OKR |
| W3 | 合規諮詢（若走 B：Stripe Connect；若走 A：PCI QSA） | CFO / Legal | 初步合規路徑 |
| W4 | 董事會 review：本文件 + 31 天盤點 | CEO | go/no-go Phase 1 |

---

## 9. 一句話重申

> **DSP 的核心競爭力是 audience × bidding × 創意，不是 checkout infrastructure。先用 C 驗證、再用 B 擴張、最後視規模決定要不要用 A 建護城河。本 demo repo 不是 production 起點，而是 BD 談判、工程教育、技術 option value 的資產。**
