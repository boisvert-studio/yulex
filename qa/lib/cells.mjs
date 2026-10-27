// Runs INSIDE the page via page.evaluate(); self-contained like lib/inpage.mjs.

/**
 * Cell-level border check for the dashed grid model.
 * Every card-like cell (outermost match of CELL_SELECTOR, at least 40 x 40, outside nav, footer, the coverflow
 * and the related pool) should read as a closed box drawn with single lines: each edge carries exactly one
 * dashed line, whoever draws it (the cell, a neighbour or a container). Unlike borderProbe it doesn't need
 * cells to share a class, so CTA cells and row joins between different lists are checked too.
 * Returns one entry per bordered cell: top/right/bottom/left = number of distinct lines (0 open, 2+ doubled).
 */
export function cellProbe() {
  const SX = window.scrollX, SY = window.scrollY, TOL = 2, COVER = 0.8;
  const CELL_SELECTOR =
    '.post-card_component, .card-grid_cta, .card-grid_item, .affiliation-item, .logo-card_component, .link-card_component, .info-card_component, .prevnext_bar-link, .w-dyn-item';
  const EXCLUDE = '[data-yx-related-pool], nav, .w-nav, footer, [role="contentinfo"], [data-yx-coverflow]';

  const H = [], V = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (!el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const L = r.left + SX, R = r.right + SX, T = r.top + SY, B = r.bottom + SY;
    for (const [side, axis, centre, lo, hi] of [
      ['Top', H, (w) => T + w / 2, L, R],
      ['Bottom', H, (w) => B - w / 2, L, R],
      ['Left', V, (w) => L + w / 2, T, B],
      ['Right', V, (w) => R - w / 2, T, B],
    ]) {
      const w = parseFloat(cs['border' + side + 'Width']);
      // the grid model is dashed; solid UI borders (inputs, pagination) are out of scope
      if (!(w > 0) || cs['border' + side + 'Style'] !== 'dashed') continue;
      if (/rgba\([^)]*,\s*0\)/.test(cs['border' + side + 'Color'])) continue;
      axis.push({ c: centre(w), lo, hi, w });
    }
  }

  // distinct lines on one edge: strokes whose bands overlap are one line; touching strokes stay two (doubled)
  const countLines = (strokes, E, lo, hi) => {
    const len = hi - lo;
    const near = strokes
      .filter((s) => Math.abs(s.c - E) <= TOL && Math.min(hi, s.hi) - Math.max(lo, s.lo) > 0)
      .sort((a, b) => a.c - b.c);
    const clusters = [];
    for (const s of near) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(s.c - last.anchor) < Math.min(s.w, last.w)) last.items.push(s);
      else clusters.push({ anchor: s.c, w: s.w, items: [s] });
    }
    let lines = 0;
    for (const cl of clusters) {
      const iv = cl.items.map((s) => [Math.max(lo, s.lo), Math.min(hi, s.hi)]).sort((a, b) => a[0] - b[0]);
      let covered = 0, a = iv[0][0], b = iv[0][1];
      for (const [x, y] of iv.slice(1)) {
        if (x <= b) b = Math.max(b, y);
        else { covered += b - a; a = x; b = y; }
      }
      covered += b - a;
      if (covered / len >= COVER) lines++;
    }
    return lines;
  };

  const matches = [...document.querySelectorAll(CELL_SELECTOR)].filter((e) => e.checkVisibility() && !e.closest(EXCLUDE));
  const cells = matches
    .filter((e) => !matches.some((o) => o !== e && o.contains(e)))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; });
  const describe = (e) => e.tagName.toLowerCase() + '.' + [...e.classList].filter((c) => !/^w-dyn/.test(c)).join('.');
  const out = [];
  for (const e of cells) {
    const r = e.getBoundingClientRect();
    const L = r.left + SX, R = r.right + SX, T = r.top + SY, B = r.bottom + SY;
    const edges = { top: countLines(H, T, L, R), right: countLines(V, R, T, B), bottom: countLines(H, B, L, R), left: countLines(V, L, T, B) };
    if (Object.values(edges).every((v) => v === 0)) continue; // an unbordered list (filters, menus)
    out.push({ el: describe(e), x: Math.round(L), y: Math.round(T), w: Math.round(r.width), h: Math.round(r.height), ...edges });
  }
  return out;
}
