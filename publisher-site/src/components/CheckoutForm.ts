import {
  updateSession,
  completeSession,
  type CheckoutSession,
} from '../lib/ucpClient.js';
import { requestMandates } from '../lib/clientMandate.js';

export interface CompletedOrder {
  id: string;
  permalink_url: string;
}

export interface CompletedResult {
  order?: CompletedOrder;
  [k: string]: unknown;
}

function findAmount(
  totals: Array<{ type: string; amount: number }>,
  type: string
): number {
  return totals.find((x) => x.type === type)?.amount ?? 0;
}

export function renderCheckoutForm(
  container: HTMLElement,
  session: CheckoutSession,
  onDone: (result: CompletedResult) => void
): void {
  container.innerHTML = `
    <form id="co" style="display:grid; gap:8px; margin-top: 8px;">
      <input name="first_name" placeholder="名字" required />
      <input name="last_name" placeholder="姓氏" required />
      <input name="email" type="email" placeholder="Email" required />
      <input name="line1" placeholder="地址" required />
      <input name="city" placeholder="城市" required value="台北市" />
      <input name="postal_code" placeholder="郵遞區號" required value="100" />
      <div
        class="pay-box"
        id="gpay"
        style="padding:8px; border:1px solid #000; border-radius:6px; text-align:center; cursor:pointer;"
        role="button"
        tabindex="0"
      >🅖 Pay with Google Pay (demo mock)</div>
      <div id="totals" style="font-size:14px; color:#555;"></div>
      <button type="submit" id="confirm" disabled>請先點 Google Pay</button>
      <div id="err" style="color:#b91c1c;"></div>
    </form>
  `;

  const totalsEl = container.querySelector<HTMLDivElement>('#totals');
  if (totalsEl) {
    const subtotal = findAmount(session.totals, 'subtotal');
    const shipping = findAmount(session.totals, 'shipping');
    const tax = findAmount(session.totals, 'tax');
    const total = findAmount(session.totals, 'total');
    totalsEl.textContent =
      `小計 NT$${subtotal.toLocaleString()}　` +
      `運費 $${shipping}　稅 NT$${tax.toLocaleString()}　` +
      `合計 NT$${total.toLocaleString()}`;
  }

  const gpay = container.querySelector<HTMLDivElement>('#gpay');
  const confirm = container.querySelector<HTMLButtonElement>('#confirm');
  const err = container.querySelector<HTMLDivElement>('#err');
  const form = container.querySelector<HTMLFormElement>('#co');
  if (!gpay || !confirm || !err || !form) return;

  let gpayReady = false;
  const markGpayReady = () => {
    gpayReady = true;
    gpay.style.background = '#d1fae5';
    confirm.disabled = false;
    confirm.textContent = '確認訂單';
  };
  gpay.addEventListener('click', markGpayReady);
  gpay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      markGpayReady();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!gpayReady) return;
    err.textContent = '';
    confirm.disabled = true;
    confirm.textContent = '處理中…';

    const fd = new FormData(form);
    const firstName = String(fd.get('first_name') ?? '');
    const lastName = String(fd.get('last_name') ?? '');

    try {
      await updateSession(session.id, {
        buyer: {
          email: String(fd.get('email') ?? ''),
          first_name: firstName,
          last_name: lastName,
        },
        fulfillment: {
          destinations: [
            {
              recipient: `${firstName} ${lastName}`.trim(),
              line1: String(fd.get('line1') ?? ''),
              city: String(fd.get('city') ?? ''),
              postal_code: String(fd.get('postal_code') ?? ''),
              country: 'TW',
            },
          ],
          method_type: 'shipping',
        },
        payment: { instruments: [{ handler_id: 'google-pay-mock', type: 'wallet' }] },
      });

      const { checkout_mandate, payment_mandate, total } = await requestMandates(session.id);

      const completed = (await completeSession(session.id, {
        ap2: { checkout_mandate },
        payment: {
          instruments: [
            {
              handler_id: 'google-pay-mock',
              type: 'wallet',
              credential: { token: payment_mandate },
            },
          ],
        },
        expected_total: total,
        signals: {
          'dev.ucp.buyer_ip': 'unknown',
          'dev.ucp.user_agent': navigator.userAgent,
        },
      })) as CompletedResult;

      onDone(completed);
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : String(caught);
      err.textContent = msg;
      confirm.disabled = false;
      confirm.textContent = '確認訂單';
    }
  });
}
