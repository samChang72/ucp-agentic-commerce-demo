import { mountAdSlots } from './components/AdSlot.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAdSlots());
} else {
  mountAdSlots();
}
