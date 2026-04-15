/**
 * UCP wire-contract types.
 * Spec: https://ucp.dev/latest/specification/checkout-rest/
 *      https://ucp.dev/latest/specification/order/
 * Snapshot: 2026-04-15. snake_case field names are intentional (UCP convention).
 * Fields prefixed with `_` are internal server state, not part of the UCP contract.
 */
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

export interface Item {
  id: string;
  title: string;
  price: number;
  image_url?: string;
}

export interface LineItem {
  id: string;
  item: Item;
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
  credential?: {
    /** Opaque handler token (e.g., PaymentMandate SD-JWT-VC). Never log. */
    token: string;
  };
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
  item: Item;
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

/** UCP Order adjustments (refunds, returns, credits). Stub — expand per UCP spec when needed. */
export interface Adjustment {
  id: string;
  type: string;              // open string per spec: refund, return, credit, etc.
  occurred_at: string;       // RFC 3339
  status: 'pending' | 'completed' | 'failed';
  line_items?: Array<{ id: string; quantity: number }>;
  totals?: Total[];
  description?: string;
}

export interface Order {
  ucp: { version: '1.0' };
  id: string;
  /** Human-readable identifier (business-provided per UCP spec, optional). */
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
  adjustments: Adjustment[];
  currency: string;
  totals: Total[];
  messages: Message[];
}
