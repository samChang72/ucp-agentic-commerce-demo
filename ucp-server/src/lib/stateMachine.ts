import type { CheckoutStatus } from '../types/ucp.js';

const ALLOWED: Record<CheckoutStatus, CheckoutStatus[]> = {
  incomplete: ['incomplete', 'ready_for_complete', 'canceled'],
  ready_for_complete: ['ready_for_complete', 'incomplete', 'completed', 'canceled'],
  completed: [],
  canceled: [],
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: CheckoutStatus,
    public readonly to: CheckoutStatus,
  ) {
    super(`illegal transition ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function canTransition(from: CheckoutStatus, to: CheckoutStatus) {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: CheckoutStatus, to: CheckoutStatus) {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}
