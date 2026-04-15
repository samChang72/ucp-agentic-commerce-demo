import { getCatalog, createSession, type CatalogProduct, type CheckoutSession } from '../lib/ucpClient.js';

const CARD_CSS = `
  :host { all: initial; display: block; }
  .card {
    font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 16px;
    max-width: 560px;
    background: #fff;
    color: #111;
    box-sizing: border-box;
  }
  .badge {
    background: #fef3c7;
    color: #92400e;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    display: inline-block;
  }
  .title { font-size: 18px; font-weight: 600; margin: 8px 0; }
  .price { font-size: 22px; color: #111; margin: 4px 0; }
  .meta { color: #666; font-size: 14px; margin: 4px 0; }
  button {
    background: #0f62fe;
    color: #fff;
    border: 0;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
  }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  img { max-width: 160px; border-radius: 8px; display: block; }
  .error { color: #b91c1c; }
`;

function availabilityLabel(availability: string | undefined): string {
  if (!availability) return '—';
  return availability.endsWith('InStock') ? '✅ 有貨・免運' : '❌ 缺貨';
}

export class UcpAdSlot extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    const productId = this.getAttribute('slot') ?? '';
    shadow.innerHTML = `<style>${CARD_CSS}</style><div class="card">Loading…</div>`;
    this.load(shadow, productId).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      const card = shadow.querySelector('.card');
      if (card) {
        card.textContent = `廣告載入失敗：${msg}`;
        card.classList.add('error');
      }
    });
  }

  private async load(shadow: ShadowRoot, productId: string): Promise<void> {
    if (!productId) throw new Error('missing slot attribute');
    const products: CatalogProduct[] = await getCatalog();
    const p = products.find((x) => x['@id'] === productId);
    if (!p) throw new Error(`product ${productId} not found`);

    const card = shadow.querySelector('.card');
    if (!card) throw new Error('card not rendered');

    const priceText = `NT$${p.offers.price.toLocaleString()}`;
    const rating = p.aggregateRating
      ? `⭐ ${p.aggregateRating.ratingValue} (${p.aggregateRating.reviewCount})`
      : '';
    const imgHtml = p.image ? `<img src="${p.image}" alt="${p.name}" />` : '';

    card.innerHTML = `
      <div class="badge">⚡ Live Commerce Ad</div>
      ${imgHtml}
      <div class="title">${p.name}</div>
      <div class="price">${priceText}</div>
      <div class="meta">${availabilityLabel(p.offers.availability)} ${rating}</div>
      <button id="buy" type="button">立即購買 →</button>
      <div id="checkout" style="margin-top: 16px;"></div>
    `;

    const buy = card.querySelector<HTMLButtonElement>('#buy');
    const checkout = card.querySelector<HTMLDivElement>('#checkout');
    if (!buy || !checkout) return;

    buy.addEventListener('click', async () => {
      buy.disabled = true;
      buy.textContent = '建立 session…';
      try {
        const session: CheckoutSession = await createSession(productId);
        this.dispatchEvent(
          new CustomEvent('ucp-checkout-open', {
            detail: { session, productId, container: checkout },
            bubbles: true,
            composed: true,
          })
        );
        // CheckoutForm (Task 27) renders inside `checkout` via this event.
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        checkout.innerHTML = `<div class="error">建立結帳失敗：${msg}</div>`;
        buy.disabled = false;
        buy.textContent = '立即購買 →';
      }
    });
  }
}

if (!customElements.get('ucp-ad-slot')) {
  customElements.define('ucp-ad-slot', UcpAdSlot);
}

export function mountAdSlots(root: ParentNode = document): void {
  root.querySelectorAll('[data-ucp-ad]').forEach((el) => {
    if (el.querySelector('ucp-ad-slot')) return;
    const slot = document.createElement('ucp-ad-slot');
    slot.setAttribute('slot', el.getAttribute('slot') ?? '');
    el.appendChild(slot);
  });
}
