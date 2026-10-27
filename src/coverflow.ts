// Neighbour slider for team profile pages. Self-starts on `[data-yx-coverflow]`.
import { children, isReady, mod, warn, watchMedia } from './utils';

const FIVE_CARDS = '(min-width: 480px)';

export const startCoverflow = () => {
  const root = document.querySelector<HTMLElement>('[data-yx-coverflow]');
  if (!root || isReady(root)) return;

  const cards = children(root);
  if (!cards.length) {
    warn('coverflow: the list has no items.');
    return;
  }

  // The current person's card holds the link Webflow marks `w--current`.
  const found = cards.findIndex((card) => card.querySelector('.w--current'));
  const current = Math.max(found, 0);
  if (found < 0) warn('coverflow: no w--current link in the list, laying out from the first item.');

  cards.forEach((card, index) => card.setAttribute('data-yx-tone', String(index % 3)));

  const link = cards[current].querySelector<HTMLElement>('.w--current');
  link?.setAttribute('aria-current', 'page');
  link?.setAttribute('tabindex', '-1');

  const wide = watchMedia(FIVE_CARDS, () => layout());

  function layout() {
    const reach = wide.matches ? 2 : 1;
    // Fill the centre first, so a short list never gives the current card a neighbour's slot.
    const offsets = [0];
    for (let step = 1; step <= reach; step += 1) offsets.push(-step, step);

    const used = new Set<number>();
    const visible: { card: HTMLElement; slot: number }[] = [];
    cards.forEach((card) => card.removeAttribute('data-yx-slot'));

    offsets.forEach((slot) => {
      const index = mod(current + slot, cards.length);
      if (used.has(index)) return;
      used.add(index);
      visible.push({ card: cards[index], slot });
    });

    visible.sort((a, b) => a.slot - b.slot);
    visible.forEach(({ card, slot }) => {
      card.setAttribute('data-yx-slot', String(slot));
      root!.append(card);
    });

    root!.setAttribute('data-yx-ready', found < 0 ? 'no-current' : 'true');
  }

  layout();
};
