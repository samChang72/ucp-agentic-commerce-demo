// src/types/ucp.ts
export type CheckoutStatus = 'incomplete' | 'ready_for_complete' | 'completed' | 'canceled';

export interface Quantity {
  original: number;
  total: number;
  fulfilled: number;
}

export interface Total {
  type: 'subtotal' | 'tax' | 'shipping' | 'total';
  amount: number;      // minor units (NT$ uses whole integers)
  currency: string;
}

export interface LineItem {
  id: string;
  item: { id: string; title: string; price: number; image_url?: string };
  quantity: Quantity;
  totals: Total[];
}

export interface Buyer {
  email: string;
  first_name: string;
  last_name: string;
}

export interface PostalAddress {
  recipient: string;
  line1: string;
  city: string;
  postal_code: string;
  country: string;
}

export interface PaymentInstrument {
  handler_id: string;
  type: 'card' | 'wallet';
  display?: { brand?: string; last4?: string };
  credential?: { token: string };
  billing_address?: PostalAddress;
}

export interface Message {
  type: 'info' | 'warning' | 'error';
  code: string;
  content: string;
  path?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface CheckoutSession {
  ucp: { version: '1.0'; capabilities: string[]; payment_handlers: string[] };
  id: string;
  status: CheckoutStatus;
  currency: string;
  line_items: LineItem[];
  buyer?: Buyer;
  totals: Total[];
  fulfillment?: { destinations?: PostalAddress[]; method_type?: string };
  payment?: { instruments: PaymentInstrument[] };
  messages: Message[];
  links: { terms_of_service?: string };
  order?: { id: string; permalink_url: string };
  // mandate storage
  ap2?: { checkout_mandate?: string };
  // internal
  _idempotency_key?: string;
  _created_at: string;
}

export interface OrderLineItem {
  id: string;
  item: LineItem['item'];
  quantity: Quantity;
  totals: Total[];
  status: 'processing' | 'partial' | 'fulfilled' | 'removed';
  parent_id?: string;
}

export interface FulfillmentEvent {
  id: string;
  occurred_at: string;
  type: 'shipped' | 'delivered' | 'return' | 'cancel';
  line_items: { id: string; quantity: number }[];
  tracking_number?: string;
  tracking_url?: string;
  carrier?: string;
  description?: string;
}

export interface Order {
  ucp: { version: '1.0' };
  id: string;
  label?: string;
  checkout_id: string;
  permalink_url: string;
  line_items: OrderLineItem[];
  fulfillment: {
    expectations: Array<{
      id: string;
      line_items: string[];
      method_type: string;
      destination?: PostalAddress;
      description?: string;
      fulfillable_on?: string;
    }>;
    events: FulfillmentEvent[];
  };
  adjustments: unknown[];
  currency: string;
  totals: Total[];
  messages: Message[];
}
