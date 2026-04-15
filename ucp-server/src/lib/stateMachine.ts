import type { CheckoutStatus } from '../types/ucp.js';

const ALLOWED: Record<CheckoutStatus, CheckoutStatus[]> = {
  incomplete: ['incomplete', 'ready_for_complete', 'canceled'],
  ready_for_complete: ['ready_for_complete', 'incomplete', 'completed', 'canceled'],
  completed: [],
  canceled: [],
};

export function canTransition(from: CheckoutStatus, to: CheckoutStatus) {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: CheckoutStatus, to: CheckoutStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`illegal transition ${from} → ${to}`);
  }
}
