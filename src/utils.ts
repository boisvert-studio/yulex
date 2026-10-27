// Shared helpers. No interface text lives here or in any module.

export const warn = (message: string) => {
  // eslint-disable-next-line no-console
  console.warn(`[yx] ${message}`);
};

/** Direct element children of a node, as an array. */
export const children = (node: Element) => Array.from(node.children) as HTMLElement[];

/** Run `callback` now and whenever the media query flips. */
export const watchMedia = (query: string, callback: () => void) => {
  const list = window.matchMedia(query);
  list.addEventListener('change', callback);
  return list;
};

/** Modulo that stays positive for negative numbers. */
export const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The link a card points at: the card itself if it is an anchor, else its first link. */
export const cardLink = (card: Element) =>
  card instanceof HTMLAnchorElement ? card : card.querySelector<HTMLAnchorElement>('a[href]');

/** True once a module has laid out its root; guards against a second start. */
export const isReady = (root: Element) => root.hasAttribute('data-yx-ready');
