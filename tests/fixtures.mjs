// Fixture markup shaped like Webflow's published HTML. Every name here is made up.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The shipped global styles, so the tests exercise the same CSS Webflow will serve. */
const globalStyles = readFileSync(`${here}../docs/global-styles/global-styles_custom.html`, 'utf8')
  // The swash data URIs are noise here.
  .replace(/url\('data:image[^']*'\)/g, 'none');

// Stand-ins for the Webflow classes and theme variables the CSS leans on.
const base = `
:root { --_theme---accent--tone-1: #007da7; --_theme---accent--tone-2: #4e5fa7; --_theme---accent--tone-3: #1d5f48; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px sans-serif; }
.container { padding: 0 16px; max-width: 1280px; margin: 0 auto; }
.person { min-height: 80px; border: 1px dashed #999; }
.row-wrapper { display: flex; gap: 8px; }
.row-wrapper > .w-dyn-list { display: flex; gap: 8px; flex-wrap: wrap; }
.post { width: 100px; height: 40px; }
.bar { display: flex; justify-content: space-between; }
`;

export const page = (body) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${globalStyles}<style>${base}</style></head><body><div class="container">${body}</div></body></html>`;

const person = (i) => `Person ${String(i + 1).padStart(2, '0')}`;
const slug = (i) => `/team/person-${i + 1}`;

/** n team cards, `current` carrying Webflow's w--current marker. */
export const coverflow = ({ n = 9, current = 0 } = {}) =>
  page(
    `<div class="w-dyn-list"><div role="list" data-yx-coverflow fs-list-element="list" class="w-dyn-items">${Array.from(
      { length: n },
      (_, i) =>
        `<div role="listitem" class="w-dyn-item"><a href="${slug(i)}" class="w-inline-block${i === current ? ' w--current' : ''}"><img alt="${person(i)}" width="100" height="120" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='120'%3E%3C/svg%3E" style="width:100%;height:auto;display:block"><div class="coverflow_background" style="position:absolute;inset:0;z-index:-1"></div></a></div>`
    ).join('')}</div></div>`
  );

/** n people in a list plus a CTA block beside it, with the Finsweet attributes the module removes. */
export const homeTeam = ({ n = 21, cta = true } = {}) =>
  page(
    `<div class="w-dyn-list"><div role="list" data-yx-home-team fs-list-instance="team" fs-list-element="list" class="w-dyn-items">${Array.from(
      { length: n },
      (_, i) =>
        `<div role="listitem" class="w-dyn-item person"><a href="${slug(i)}" class="name">${person(i)}</a></div>`
    ).join('')}</div>${
      cta
        ? `<div data-yx-home-team-cta fs-list-instance="team" fs-list-element="item" fs-list-position="0" class="person cta"><a href="/team">All</a></div>`
        : ''
    }</div>`
  );

/** A hidden list of n items with the bar above it; `current` is the index carrying w--current (or null). */
export const prevNext = ({ n = 5, current = 0, loadMore = false, bar = true } = {}) =>
  page(
    `${
      bar
        ? `<div data-yx-prevnext class="bar"><a data-yx-prevnext-link="prev" href="#"><span>Previous</span><span data-yx-prevnext-label>-</span></a><a data-yx-prevnext-link="next" href="#"><span>Next</span><span data-yx-prevnext-label>-</span></a></div>`
        : ''
    }<div style="display:none"><div role="list" data-yx-prevnext-list ${loadMore ? 'fs-list-load="pagination"' : ''} class="w-dyn-items">${Array.from(
      { length: n },
      (_, i) =>
        `<div role="listitem" class="w-dyn-item"><a href="/item-${i + 1}" class="w-inline-block${i === current ? ' w--current' : ''}"><span data-yx-prevnext-title> Item title ${i + 1} </span></a></div>`
    ).join('')}</div></div>`
  );

// With `byline`, the card opens with a nested author list like capsule and podcast cards do, so the
// first link in the card is the author, shared by every card of that author.
const post = (type, i, byline = false) =>
  `<div role="listitem" class="w-dyn-item post" data-yx-related-type="${type}">${
    byline
      ? '<div class="w-dyn-list"><div role="list" class="w-dyn-items"><div role="listitem" class="w-dyn-item"><a href="/equipe/shared-author">Shared Author</a></div></div></div>'
      : ''
  }<a class="post-title" href="/${type}-${i}">${type} ${i}</a></div>`;
const own = (type, items) =>
  items.length
    ? `<div role="list" data-yx-related-own class="w-dyn-items">${items.map((i) => post(type, i).replace(' data-yx-related-type="' + type + '"', '')).join('')}</div>`
    : `<div class="w-dyn-empty"><div>No items found.</div></div>`;

/**
 * Related section. `own` maps type -> post numbers the row already holds; `pool` maps type -> post
 * numbers in the shared pool, newest first (pool items are interleaved by type like the real list).
 */
export const related = ({
  own: ownItems = {},
  pool = { article: [10, 11, 12, 13], capsule: [20, 21, 22, 23], podcast: [30, 31, 32, 33] },
  byline = false,
} = {}) => {
  const types = ['article', 'capsule', 'podcast'];
  const poolHtml = Array.from({ length: 4 }, (_, k) =>
    types.map((t) => (pool[t][k] === undefined ? '' : post(t, pool[t][k], byline))).join('')
  ).join('');
  return page(
    `<section data-yx-related-section><h2 data-yx-related-heading="own">Own heading</h2><h2 data-yx-related-heading="latest">Latest heading</h2>${types
      .map(
        (t) =>
          `<div data-yx-related="${t}" class="row-wrapper"><div class="w-dyn-list">${own(t, ownItems[t] ?? [])}</div></div>`
      )
      .join(
        ''
      )}<div class="w-dyn-list"><div role="list" data-yx-related-pool class="w-dyn-items">${poolHtml}</div></div></section>`
  );
};

/** An article byline date as Webflow prints it, in the given page language. */
export const date = ({ lang = 'fr-CA', text = 'October 22, 2021' } = {}) =>
  page(`<div class="detail_byline-text" data-yx-date>${text}</div>`).replace(
    '<html>',
    `<html lang="${lang}">`
  );
