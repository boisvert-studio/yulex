import fs from 'node:fs';
import path from 'node:path';
import { thumbnail } from './diff.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Classify one capture result into display cells. cls: g(reen) a(mber) r(ed) n(eutral). */
export function cells(r) {
  if (!r) return null;
  if (r.error) return { error: r.error };
  const b = r.borders;
  const lm = r.landmarks;
  const lmOk = lm.main === 1 && lm.header >= 1 && lm.footer >= 1 && lm.nav >= 1;
  return {
    edges: !b.borderedGrids
      ? { text: 'no grids', cls: 'n' }
      : { text: `${b.open} / ${b.doubled}`, cls: b.open + b.doubled === 0 ? 'g' : 'r' },
    h1: {
      text: r.h1.hidden ? `${r.h1.visible} +${r.h1.hidden}h` : String(r.h1.visible),
      cls: r.h1.visible === 1 ? (r.h1.hidden ? 'a' : 'g') : 'r',
    },
    landmarks: {
      text: `M${lm.main} H${lm.header} F${lm.footer} N${lm.nav}`,
      cls: lmOk ? 'g' : lm.main === 0 || lm.footer === 0 ? 'r' : 'a',
    },
    overflow: { text: r.overflow.px ? `${r.overflow.px}px` : '0', cls: r.overflow.px ? 'r' : 'g' },
    wf: { text: String(r.webflowLinks.length), cls: r.webflowLinks.length ? 'r' : 'g' },
    http: { text: String(r.status ?? '?'), cls: r.status === r.expectStatus ? 'g' : 'r' },
  };
}

export function diffCell(d) {
  if (!d) return { text: '-', cls: 'n' };
  if (d.error) return { text: 'ERR', cls: 'r' };
  let text = `${d.mismatchPct}%`;
  if (d.heightDelta) text += ` (Δh ${d.heightDelta > 0 ? '+' : ''}${d.heightDelta})`;
  if (d.widthDelta) text += ` (Δw ${d.widthDelta})`;
  const cls = d.heightDelta || d.widthDelta || d.mismatchPct > 2 ? 'r' : d.mismatchPct > 0.1 ? 'a' : 'g';
  return { text, cls };
}

const COLS = [
  ['edges', 'Open / doubled edges'],
  ['h1', 'h1 (visible +hidden)'],
  ['landmarks', 'Landmarks'],
  ['overflow', 'Overflow'],
  ['wf', 'webflow.io links'],
  ['http', 'HTTP'],
];

function details(r) {
  if (!r || r.error) return '';
  const parts = [];
  parts.push(`<p><b>h1</b>: ${r.h1.texts.map((t) => `${t.visible ? '' : '(hidden) '}${esc(t.text)}`).join(' &middot; ') || 'none'}</p>`);
  if (r.overflow.px) {
    parts.push(
      `<p><b>Overflow</b>: scrollWidth ${r.overflow.scrollWidth} vs clientWidth ${r.overflow.clientWidth}; ${r.overflow.offenderCount} offending element(s), widest:</p><ul>` +
        r.overflow.offenders.map((o) => `<li><code>${esc(o.el)}</code> right edge ${o.right}px (width ${o.width})</li>`).join('') +
        '</ul>',
    );
  }
  if (r.webflowLinks.length) parts.push(`<p><b>webflow.io links</b>: ${[...new Set(r.webflowLinks)].map((l) => `<code>${esc(l)}</code>`).join(', ')}</p>`);
  const gs = r.borders.grids.filter((g) => g.bordered);
  if (gs.length) {
    parts.push(
      '<table class="mini"><tr><th>Grid</th><th>Cards</th><th>Open</th><th>Doubled</th><th>Open sides T/R/B/L</th><th>Doubled sides T/R/B/L</th></tr>' +
        gs
          .map((g) => {
            const s = (o) => ['top', 'right', 'bottom', 'left'].map((k) => o[k]).join('/');
            return `<tr><td><code>${esc(g.container)}</code> @${g.y}px</td><td>${g.cards}</td><td class="${g.open ? 'r' : 'g'}">${g.open}</td><td class="${g.doubled ? 'r' : 'g'}">${g.doubled}</td><td>${s(g.openSides)}</td><td>${s(g.doubledSides)}</td></tr>`;
          })
          .join('') +
        '</table>',
    );
  }
  const unb = r.borders.grids.length - gs.length;
  if (unb) parts.push(`<p class="muted">${unb} card group(s) with no borders at all (ignored in the totals).</p>`);
  if (r.masks?.length) parts.push(`<p class="muted">Masked in diff: ${r.masks.map((m) => `<code>${esc(m.selector)}</code> (${esc(m.reason)})`).join(', ')}</p>`);
  if (r.truncated) parts.push(`<p class="muted">Screenshot cropped: page is ${r.height}px tall.</p>`);
  if (r.notes?.length) parts.push(`<p class="muted">${r.notes.map(esc).join('; ')}</p>`);
  return parts.join('');
}

/**
 * rows: [{ page, locale, width, res: {colId: capture}, diff }]
 * cols: [{ id, label }]
 */
export function renderReport({ title, meta, cols, rows, links, outDir }) {
  const rel = (p) => path.relative(outDir, p).split(path.sep).join('/');
  const img = (p, alt) => {
    if (!p || !fs.existsSync(p)) return '<span class="muted">-</span>';
    let src;
    try { src = thumbnail(p); } catch { return '<span class="muted">?</span>'; }
    return `<a href="${esc(rel(p))}" target="_blank"><img src="${src}" alt="${esc(alt)}" loading="lazy"></a>`;
  };
  const counts = {};
  const body = [];
  const detailBlocks = [];
  for (const row of rows) {
    const id = `${row.page.key}.${row.locale}.${row.width}`;
    const cs = cols.map((c) => cells(row.res[c.id]));
    const dc = diffCell(row.diff);
    const thumbs = cols.map((c) => img(row.res[c.id]?.maskedShot || row.res[c.id]?.shot, c.label)).join('') + (row.diff?.diffPath ? img(row.diff.diffPath, 'diff') : '');
    const tds = [];
    cols.forEach((c, i) => {
      const cc = cs[i];
      for (const [k] of COLS) {
        if (!cc) { tds.push('<td class="n">-</td>'); continue; }
        if (cc.error) { tds.push(k === 'http' ? `<td class="r" title="${esc(cc.error)}">ERR</td>` : '<td class="n">-</td>'); continue; }
        const cell = cc[k];
        const ref = i > 0 ? cs[0] : null;
        const inh = ref && !ref.error && ref[k] && ref[k].cls === cell.cls && (cell.cls === 'r' || cell.cls === 'a');
        counts[c.id] ??= {};
        counts[c.id][k] ??= { g: 0, a: 0, r: 0, n: 0, inh: 0 };
        counts[c.id][k][cell.cls]++;
        if (inh) counts[c.id][k].inh++;
        tds.push(`<td class="${cell.cls}${inh ? ' inh' : ''}"${inh ? ' title="same result on ' + esc(cols[0].label) + '"' : ''}>${esc(cell.text)}</td>`);
      }
    });
    const anyRed = [dc, ...cs.flatMap((cc) => (cc && !cc.error ? Object.values(cc) : [{ cls: 'r' }]))].some((x) => x.cls === 'r');
    body.push(
      `<tr data-red="${anyRed ? 1 : 0}" id="${esc(id)}"><td><a href="#d-${esc(id)}">${esc(row.page.key)}</a></td><td>${row.locale}</td><td>${row.width}</td><td class="thumbs">${thumbs}</td><td class="${dc.cls}">${esc(dc.text)}</td>${tds.join('')}</tr>`,
    );
    detailBlocks.push(
      `<details id="d-${esc(id)}"><summary>${esc(row.page.key)} / ${row.locale} / ${row.width}</summary>` +
        cols.map((c) => `<h4>${esc(c.label)} &mdash; <a href="${esc(row.res[c.id]?.url || '#')}">${esc(row.res[c.id]?.url || '')}</a></h4>${details(row.res[c.id])}`).join('') +
        '</details>',
    );
  }

  const head =
    `<tr><th rowspan="2">Page</th><th rowspan="2">Loc</th><th rowspan="2">W</th><th rowspan="2">${cols.map((c) => esc(c.label)).join(' | ')}${cols.length > 1 ? ' | diff' : ''}</th><th rowspan="2">Pixel diff${cols.length > 1 ? ` (${esc(cols[0].label)} vs ${esc(cols[1].label)})` : ''}</th>` +
    cols.map((c) => `<th colspan="${COLS.length}" class="grp">${esc(c.label)}</th>`).join('') +
    '</tr><tr>' +
    cols.map(() => COLS.map(([, l]) => `<th>${esc(l)}</th>`).join('')).join('') +
    '</tr>';

  const sumRows = cols
    .map((c) => {
      const cc = counts[c.id] || {};
      return `<tr><td>${esc(c.label)}</td>${COLS.map(([k]) => {
        const x = cc[k] || { g: 0, a: 0, r: 0, n: 0, inh: 0 };
        return `<td><span class="g">${x.g}</span> <span class="a">${x.a}</span> <span class="r">${x.r}</span>${x.inh ? ` <span class="muted">(${x.inh} also on ${esc(cols[0].label)})</span>` : ''}</td>`;
      }).join('')}</tr>`;
    })
    .join('');

  const linkSections = Object.entries(links || {})
    .map(([id, ls]) => {
      const bad = ls.filter((l) => l.status === 0 || l.status >= 400);
      return (
        `<h3>${esc(cols.find((c) => c.id === id)?.label || id)}: ${ls.length} unique links checked, ${bad.length} with status &ge; 400 or unreachable</h3>` +
        (bad.length
          ? '<table class="mini"><tr><th>Status</th><th>Kind</th><th>URL</th><th>Found on</th><th>Note</th></tr>' +
            bad
              .map(
                (l) =>
                  `<tr><td class="r">${l.status || esc(l.error)}</td><td>${l.kind}</td><td><code>${esc(l.url)}</code></td><td>${esc(l.foundOn.slice(0, 4).join(', '))}${l.foundOn.length > 4 ? ` +${l.foundOn.length - 4}` : ''}</td><td>${esc(l.note || '')}</td></tr>`,
              )
              .join('') +
            '</table>'
          : '')
      );
    })
    .join('');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--mut:#6b6b6b;--g:#d6f0d8;--a:#fdebb5;--r:#f6c6c6;--n:#eee;--line:#d6d6d6}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#e8e8e8;--mut:#9a9a9a;--g:#1f4a27;--a:#5a4a10;--r:#5e2323;--n:#2a2a2a;--line:#3a3a3a}}
body{font:13px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:16px}
h1{font-size:20px;margin:0 0 4px}h3{margin:20px 0 6px}h4{margin:10px 0 2px}
table{border-collapse:collapse}th,td{border:1px solid var(--line);padding:3px 6px;text-align:left;vertical-align:middle}
th{position:sticky;top:0;background:var(--bg);z-index:1}th.grp{text-align:center}
td.g,span.g{background:var(--g)}td.a,span.a{background:var(--a)}td.r,span.r{background:var(--r)}td.n{background:var(--n);color:var(--mut)}
span.g,span.a,span.r{padding:0 6px;border-radius:3px}
td.inh{background-image:repeating-linear-gradient(135deg,transparent 0 5px,rgba(0,0,0,.12) 5px 7px)}
.muted{color:var(--mut)}.thumbs{white-space:nowrap}.thumbs img{height:90px;width:auto;margin-right:4px;border:1px solid var(--line);vertical-align:top}
.mini th,.mini td{font-size:12px}code{font-size:12px}details{margin:4px 0}summary{cursor:pointer}
.meta td{border:none;padding:1px 10px 1px 0}.legend span{margin-right:8px}
</style></head><body>
<h1>${esc(title)}</h1>
<table class="meta">${Object.entries(meta).map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<p class="legend"><span class="g">&nbsp;ok&nbsp;</span><span class="a">&nbsp;warn&nbsp;</span><span class="r">&nbsp;fail&nbsp;</span><span class="n">&nbsp;n/a&nbsp;</span> Hatched = same result as on ${esc(cols[0].label)} (inherited, not a new regression). Edges are counted per card edge. Pixel diff: threshold 0.1; &gt; 0.1% amber, &gt; 2% or any size difference red.</p>
<h3>Summary (rows ok / warn / fail per check)</h3>
<table class="mini"><tr><th></th>${COLS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr>${sumRows}</table>
<h3>Per page &times; locale &times; width <label class="muted"><input type="checkbox" id="onlyred"> only rows with a failure</label></h3>
<table id="main">${head}${body.join('')}</table>
<h3>Link checks</h3>${linkSections}
<h3>Details</h3>${detailBlocks.join('')}
<script>document.getElementById('onlyred').onchange=e=>document.querySelectorAll('#main tr[data-red]').forEach(r=>r.style.display=e.target.checked&&r.dataset.red==='0'?'none':'');</script>
</body></html>`;
  fs.writeFileSync(path.join(outDir, 'report.html'), html);
  return { counts };
}
