// Functions in this file run INSIDE the page via page.evaluate().
// They must be self-contained (no imports, no closures over module scope).

/**
 * Model-agnostic border probe.
 * Collects every rendered border segment from every element's computed style,
 * finds repeated "card" children of grid/flex/list containers, and for each of a
 * card's four edges counts the distinct lines that sit on that edge.
 */
export function borderProbe() {
  const EDGE_TOL = 2; // a stroke counts for an edge if its centre line is within 2px of it
  const COVER = 0.8; // and its union must cover >= 80% of the edge length
  const SX = window.scrollX;
  const SY = window.scrollY;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'HEAD', 'TEMPLATE', 'BR', 'WBR', 'SVG', 'PATH']);

  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean);
    if (cls.length) s += '.' + cls.slice(0, 3).join('.');
    return s;
  };

  // ---- 1. every rendered border segment on the page -------------------------
  const H = []; // horizontal strokes: c = y of stroke centre, lo/hi = x extent
  const V = []; // vertical strokes:   c = x of stroke centre, lo/hi = y extent
  const colors = new Map();
  const elements = Array.from(document.querySelectorAll('body, body *'));
  for (const el of elements) {
    if (SKIP.has(el.tagName.toUpperCase())) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden') continue;
    if (parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) continue;
    const L = r.left + SX, R = r.right + SX, T = r.top + SY, B = r.bottom + SY;
    const sides = [
      ['Top', 'H', (w) => T + w / 2, L, R],
      ['Bottom', 'H', (w) => B - w / 2, L, R],
      ['Left', 'V', (w) => L + w / 2, T, B],
      ['Right', 'V', (w) => R - w / 2, T, B],
    ];
    for (const [side, axis, centre, lo, hi] of sides) {
      const w = parseFloat(cs['border' + side + 'Width']);
      const style = cs['border' + side + 'Style'];
      const color = cs['border' + side + 'Color'];
      if (!(w > 0) || style === 'none' || style === 'hidden') continue;
      const m = color.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(/[ ,/]+/).filter(Boolean);
        if (parts.length >= 4 && parseFloat(parts[3]) === 0) continue; // transparent
      }
      (axis === 'H' ? H : V).push({ c: centre(w), lo, hi, w, style, color, el });
      const key = `${w}px ${style} ${color}`;
      colors.set(key, (colors.get(key) || 0) + 1);
    }
  }

  // ---- 2. count distinct lines on one edge ----------------------------------
  const countLines = (strokes, E, lo, hi) => {
    const len = hi - lo;
    if (len <= 0) return 0;
    const near = strokes
      .filter((s) => Math.abs(s.c - E) <= EDGE_TOL && Math.min(hi, s.hi) - Math.max(lo, s.lo) > 0)
      .sort((a, b) => a.c - b.c);
    // cluster strokes whose bands substantially overlap (same pixels = one line);
    // strokes that merely touch (e.g. one card's bottom + the next card's top) stay distinct.
    const clusters = [];
    for (const s of near) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(s.c - last.anchor) < Math.min(s.w, last.w)) last.items.push(s);
      else clusters.push({ anchor: s.c, w: s.w, items: [s] });
    }
    let lines = 0;
    for (const cl of clusters) {
      const iv = cl.items
        .map((s) => [Math.max(lo, s.lo), Math.min(hi, s.hi)])
        .sort((a, b) => a[0] - b[0]);
      let covered = 0, curLo = iv[0][0], curHi = iv[0][1];
      for (let i = 1; i < iv.length; i++) {
        if (iv[i][0] <= curHi) curHi = Math.max(curHi, iv[i][1]);
        else { covered += curHi - curLo; curLo = iv[i][0]; curHi = iv[i][1]; }
      }
      covered += curHi - curLo;
      if (covered / len >= COVER) lines++;
    }
    return lines;
  };

  // ---- 3. find card groups ---------------------------------------------------
  const sig = (el) =>
    (typeof el.className === 'string' ? el.className : '')
      .split(/\s+/)
      .filter((c) => c && !/^w--|^w-condition|^is-|^cc-/.test(c))
      .sort()
      .join('.') || el.tagName;
  const abut = (a, b) => {
    const vOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const hOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    return (
      (vOverlap > 2 && (Math.abs(a.right - b.left) <= 3 || Math.abs(b.right - a.left) <= 3)) ||
      (hOverlap > 2 && (Math.abs(a.bottom - b.top) <= 3 || Math.abs(b.bottom - a.top) <= 3))
    );
  };

  const grids = [];
  const seen = new Set();
  for (const container of elements) {
    const cs = getComputedStyle(container);
    const isGrid = /grid|flex/.test(cs.display);
    if (!isGrid && !container.classList.contains('w-dyn-items')) continue;
    if (cs.display === 'none') continue;
    const kids = Array.from(container.children).filter((k) => {
      const kcs = getComputedStyle(k);
      if (kcs.display === 'none' || kcs.position === 'absolute' || kcs.position === 'fixed') return false;
      if (SKIP.has(k.tagName.toUpperCase())) return false;
      const r = k.getBoundingClientRect();
      return r.width >= 40 && r.height >= 40;
    });
    if (kids.length < 2) continue;
    const groups = new Map();
    for (const k of kids) {
      const s = sig(k);
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push(k);
    }
    const cards = Array.from(groups.values()).sort((a, b) => b.length - a.length)[0];
    if (cards.length < 2) continue;
    const rects = cards.map((c) => c.getBoundingClientRect());
    const tiled = rects.filter((r, i) => rects.some((o, j) => i !== j && abut(r, o))).length;
    if (tiled / cards.length < 0.75) continue;
    const key = cards.map((c) => describe(c)).join('|') + container.getBoundingClientRect().top;
    if (seen.has(key)) continue;
    seen.add(key);

    const outCards = cards.map((c, i) => {
      const r = rects[i];
      const L = r.left + SX, R = r.right + SX, T = r.top + SY, B = r.bottom + SY;
      return {
        i,
        el: describe(c),
        x: Math.round(L), y: Math.round(T), w: Math.round(r.width), h: Math.round(r.height),
        top: countLines(H, T, L, R),
        right: countLines(V, R, T, B),
        bottom: countLines(H, B, L, R),
        left: countLines(V, L, T, B),
      };
    });
    const sides = ['top', 'right', 'bottom', 'left'];
    const bordered = outCards.some((c) => sides.some((s) => c[s] > 0));
    let open = 0, doubled = 0;
    const openSides = { top: 0, right: 0, bottom: 0, left: 0 };
    const doubledSides = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const c of outCards) {
      for (const s of sides) {
        if (c[s] === 0) { open++; openSides[s]++; }
        else if (c[s] >= 2) { doubled++; doubledSides[s]++; }
      }
    }
    const cr = container.getBoundingClientRect();
    grids.push({
      container: describe(container),
      cardSel: describe(cards[0]),
      y: Math.round(cr.top + SY),
      cards: outCards.length,
      bordered,
      open: bordered ? open : 0,
      doubled: bordered ? doubled : 0,
      openSides: bordered ? openSides : null,
      doubledSides: bordered ? doubledSides : null,
      cardsDetail: outCards,
    });
  }
  grids.sort((a, b) => a.y - b.y);
  return {
    grids,
    strokeCount: H.length + V.length,
    strokeStyles: Array.from(colors.entries()).map(([k, n]) => ({ style: k, n })).sort((a, b) => b.n - a.n).slice(0, 8),
  };
}

/** h1 / landmarks / overflow / links, measured in CSS px. */
export function pageChecks({ vw }) {
  const out = {};
  const isVisible = (el) =>
    el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: false }) &&
    el.getBoundingClientRect().width > 0;

  const h1s = Array.from(document.querySelectorAll('h1'));
  out.h1 = {
    visible: h1s.filter(isVisible).length,
    hidden: h1s.filter((h) => !isVisible(h)).length,
    texts: h1s.map((h) => ({ visible: isVisible(h), text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) })),
  };

  const count = (sel) => document.querySelectorAll(sel).length;
  out.landmarks = {
    main: count('main, [role="main"]'),
    header: count('header, [role="banner"]'),
    footer: count('footer, [role="contentinfo"]'),
    nav: count('nav, [role="navigation"]'),
  };

  const doc = document.documentElement;
  const sw = Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0);
  out.overflow = { scrollWidth: sw, clientWidth: doc.clientWidth, px: Math.max(0, sw - doc.clientWidth), offenders: [] };
  if (sw > doc.clientWidth) {
    const clipped = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/hidden|clip|auto|scroll/.test(cs.overflowX) && p !== doc) return true;
        if (cs.position === 'fixed') return true;
      }
      return false;
    };
    const describe = (el) => {
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean);
      if (cls.length) s += '.' + cls.slice(0, 3).join('.');
      return s;
    };
    const found = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.right <= doc.clientWidth + 1) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.position === 'fixed') continue;
      if (clipped(el)) continue;
      found.push({ el: describe(el), right: Math.round(r.right), width: Math.round(r.width) });
    }
    found.sort((a, b) => b.right - a.right);
    out.overflow.offenders = found.slice(0, 8);
    out.overflow.offenderCount = found.length;
  }

  out.hrefs = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
    raw: a.getAttribute('href'),
    abs: a.href,
  }));
  out.webflowLinks = out.hrefs
    .filter((h) => /^(https?:)?\/\//i.test(h.raw.trim()) && /webflow\.io/i.test(h.raw))
    .map((h) => h.raw.trim());
  return out;
}

/** Bounding boxes (page coords) of anything matching the selectors, for reporting masks. */
export function countMatches(selectors) {
  const res = {};
  for (const s of selectors) res[s] = document.querySelectorAll(s).length;
  return res;
}
