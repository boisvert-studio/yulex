// Compact previous/next bar below 992 px. Self-starts on `[data-yx-prevnext]`.
import { cardLink, children, mod, warn } from './utils';

// Finsweet loads past 100 items in the background; give it this long before warning.
const SETTLE_MS = 4000;

export const startPrevNext = () => {
  const bar = document.querySelector<HTMLElement>('[data-yx-prevnext]');
  if (!bar || bar.hasAttribute('data-yx-ready')) return;

  const list = document.querySelector<HTMLElement>('[data-yx-prevnext-list]');
  const links = {
    prev: bar.querySelector<HTMLAnchorElement>('[data-yx-prevnext-link="prev"]'),
    next: bar.querySelector<HTMLAnchorElement>('[data-yx-prevnext-link="next"]'),
  };

  if (!list || !links.prev || !links.next) {
    warn('prevnext: needs [data-yx-prevnext-list] and prev and next [data-yx-prevnext-link].');
    bar.hidden = true;
    return;
  }

  const label = (link: HTMLElement) => link.querySelector<HTMLElement>('[data-yx-prevnext-label]');
  const loadsMore = Boolean(document.querySelector('[fs-list-load]'));

  /** Returns false when the current item is not in the list (yet). */
  const update = () => {
    const items = children(list);
    bar.hidden = items.length < 2;
    if (items.length < 2) return !loadsMore;

    const here = items.findIndex((item) => item.querySelector('.w--current'));
    if (here < 0) return false;

    (['prev', 'next'] as const).forEach((side) => {
      const item = items[mod(here + (side === 'prev' ? -1 : 1), items.length)];
      const target = cardLink(item);
      const title = item.querySelector('[data-yx-prevnext-title]')?.textContent?.trim();
      const link = links[side]!;
      if (target) link.setAttribute('href', target.getAttribute('href') ?? '');
      const text = label(link);
      if (text && title) text.textContent = title;
    });
    return true;
  };

  const settled = update();
  bar.setAttribute('data-yx-ready', 'true');

  const giveUp = () => {
    bar.hidden = true;
    if (children(list).length >= 2)
      warn('prevnext: the current page is not in [data-yx-prevnext-list].');
  };

  if (!loadsMore) {
    if (!settled) giveUp();
    return;
  }

  // Background loading appends items to the list; read again as they arrive.
  let timer: number | undefined;
  const observer = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (update()) window.clearTimeout(giveUpTimer);
    }, 100);
  });
  observer.observe(list, { childList: true });
  const giveUpTimer = window.setTimeout(() => {
    if (!update()) giveUp();
  }, SETTLE_MS);
};
