// Related-content top-up to 3 items. Self-starts on `[data-yx-related-section]`.
import { children, isReady, warn } from './utils';

const ROW_SIZE = 3;
const TYPES = ['article', 'capsule', 'podcast'];

/**
 * A card's identity is the link to its item: the first link that isn't inside a nested
 * Collection List (authors, tags) and isn't a dead `#`. Capsule and podcast cards open with the
 * author list, so their first link is the author, shared by many cards.
 */
const hrefOf = (card: Element) => {
  const links =
    card instanceof HTMLAnchorElement ? [card] : Array.from(card.querySelectorAll('a[href]'));
  const own = links.find((link) => {
    const list = link === card ? null : link.closest('.w-dyn-list');
    const href = link.getAttribute('href') ?? '';
    return (!list || !card.contains(list)) && href !== '' && href !== '#';
  });
  return own?.getAttribute('href') ?? '';
};

export const startRelated = () => {
  const section = document.querySelector<HTMLElement>('[data-yx-related-section]');
  if (!section || isReady(section)) return;

  const rows = Array.from(section.querySelectorAll<HTMLElement>('[data-yx-related]'));
  const pool = section.querySelector<HTMLElement>('[data-yx-related-pool]');
  const headings = Array.from(section.querySelectorAll<HTMLElement>('[data-yx-related-heading]'));

  if (!rows.length) warn('related: no [data-yx-related] rows in the section.');
  if (!pool) warn('related: no [data-yx-related-pool], showing own items only.');

  const poolCards = pool ? children(pool) : [];
  let anyOwn = false;

  rows.forEach((row) => {
    const type = row.getAttribute('data-yx-related') ?? '';
    if (!TYPES.includes(type)) warn(`related: unknown row type "${type}".`);

    // An empty Collection List renders no items wrapper, so make one to receive the top-up.
    let own = row.querySelector<HTMLElement>('[data-yx-related-own]');
    const hadOwn = Boolean(own && children(own).length);
    anyOwn ||= hadOwn;

    if (!own) {
      own = document.createElement('div');
      own.setAttribute('role', 'list');
      own.className = 'w-dyn-items';
      own.setAttribute('data-yx-related-own', '');
      (row.querySelector('.w-dyn-list') ?? row).append(own);
    }

    const seen = new Set(children(own).map(hrefOf).filter(Boolean));
    for (const card of poolCards) {
      if (children(own).length >= ROW_SIZE) break;
      if (card.getAttribute('data-yx-related-type') !== type) continue;
      const href = hrefOf(card);
      if (href && seen.has(href)) continue;
      seen.add(href);
      own.append(card);
    }

    row.hidden = children(own).length === 0;
  });

  headings.forEach((heading) => {
    const kind = heading.getAttribute('data-yx-related-heading');
    heading.hidden = kind === 'own' ? !anyOwn : kind === 'latest' ? anyOwn : false;
  });

  section.setAttribute('data-yx-ready', anyOwn ? 'own' : 'latest');
};
