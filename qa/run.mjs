#!/usr/bin/env node
// Yulex QA harness. Read-only: GET/HEAD requests and headless browsing only.
// See README.md for the checks and the CLI.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import * as C from './lib/config.mjs';
import { capture } from './lib/capture.mjs';
import { diffImages } from './lib/diff.mjs';
import { checkLinks, normalizeHref } from './lib/links.mjs';
import { renderReport, cells, diffCell } from './lib/report.mjs';

// ---------------------------------------------------------------- CLI ----
function parseArgs(argv) {
  const a = { target: 'both', pages: null, widths: null, locales: null, baseline: false, diff: null, compare: false, concurrency: 3, reportOnly: false };
  for (let i = 0; i < argv.length; i++) {
    let [k, v] = argv[i].split('=');
    const val = () => (v !== undefined ? v : argv[++i]);
    switch (k) {
      case '--target': a.target = val(); break;
      case '--pages': a.pages = val().split(',').filter(Boolean); break;
      case '--widths': a.widths = val().split(',').map(Number); break;
      case '--locales': a.locales = val().split(',').filter(Boolean); break;
      case '--baseline': a.baseline = true; break;
      case '--diff': a.diff = true; break;
      case '--no-diff': a.diff = false; break;
      case '--compare-baseline': a.compare = true; break;
      case '--report-only': a.reportOnly = true; break;
      case '--concurrency': a.concurrency = Number(val()); break;
      case '-h': case '--help':
        console.log('node qa/run.mjs [--target live|staging|both] [--pages home,profile,...] [--widths 1440,900,375] [--locales fr,en] [--baseline] [--diff|--no-diff] [--compare-baseline] [--report-only] [--concurrency 3]');
        process.exit(0);
      default: throw new Error(`Unknown argument ${argv[i]}`);
    }
  }
  if (!['live', 'staging', 'both'].includes(a.target)) throw new Error('--target must be live, staging or both');
  return a;
}

const args = parseArgs(process.argv.slice(2));
const filtered = !!(args.pages || args.widths || args.locales);
const { pages: allPages, masks } = C.loadPages();
await C.resolvePages(allPages);
const pages = args.pages ? allPages.filter((p) => args.pages.includes(p.key) || args.pages.includes(p.type)) : allPages;
if (args.pages) {
  const unknown = args.pages.filter((n) => !allPages.some((p) => p.key === n || p.type === n));
  if (unknown.length) throw new Error(`Unknown page(s): ${unknown.join(', ')}. Known keys/types: ${allPages.map((p) => p.key + '/' + p.type).join(', ')}`);
}
const widths = args.widths || C.ALL_WIDTHS;
const locales = args.locales || Object.keys(C.LOCALES);
const mode = args.baseline ? 'baseline' : args.compare ? 'compare' : 'normal';
let targets = args.target === 'both' ? ['live', 'staging'] : [args.target];
if (mode === 'compare' && args.target === 'both') targets = ['staging'];
const doDiff = mode === 'baseline' ? false : mode === 'compare' ? true : args.diff ?? targets.length === 2;

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
const outRoot = path.join(C.QA_DIR, 'output', stamp);
const baselineDir = (t) => path.join(C.QA_DIR, 'baseline', t);
const t0 = Date.now();
const log = (...m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...m);

// ------------------------------------------------------------ helpers ----
const rel = (base, p) => (p ? path.relative(base, p).split(path.sep).join('/') : p);
const abs = (base, p) => (p ? path.resolve(base, p) : p);
function serialize(res, base) {
  const { hrefs, ...rest } = res;
  return { ...rest, shot: rel(base, res.shot), maskedShot: rel(base, res.maskedShot) };
}
function hostOf(t) { return new URL(C.TARGETS[t]).host; }

function collectLinks(target, results) {
  const map = new Map();
  const internalHosts = new Set([hostOf(target)]);
  if (target === 'live') internalHosts.add('yulex.ca');
  for (const r of results) {
    for (const h of r.hrefs || []) {
      if (!h.raw || h.raw.trim().startsWith('#')) continue;
      const u = normalizeHref(h.abs);
      if (!u) continue;
      if (!map.has(u)) map.set(u, { foundOn: new Set(), kind: internalHosts.has(new URL(u).host) ? 'internal' : 'external' });
      map.get(u).foundOn.add(`${r.page}/${r.locale}`);
    }
  }
  return map;
}

async function runLinks(target, results, cache) {
  const map = collectLinks(target, results);
  log(`${target}: checking ${map.size} unique links`);
  await checkLinks(map, cache, (d, n) => { if (d % 50 === 0) log(`${target}: links ${d}/${n}`); });
  return Array.from(map.entries())
    .map(([url, m]) => {
      const c = cache.get(url);
      const p = new URL(url).pathname;
      let note = '';
      if (m.kind === 'external' && [403, 429, 999].includes(c.status)) note = 'external site may block automated requests';
      if (target === 'staging' && /^(\/en-ca)?\/paiement(\/|$)/.test(p)) note = 'payment terminal is served outside Webflow; 404 on staging by design';
      return { url, kind: m.kind, status: c.status, finalUrl: c.finalUrl !== url ? c.finalUrl : undefined, via: c.via, error: c.error, note, foundOn: Array.from(m.foundOn) };
    })
    .sort((a, b) => a.url.localeCompare(b.url));
}

async function pool(tasks, n, fn) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await fn(tasks[i], i);
      }
    }),
  );
  return results;
}

// --------------------------------------------------------------- main ----
async function main() {
  if (args.reportOnly) return reportOnly();
  log(`mode=${mode} targets=${targets.join(',')} pages=${pages.length} locales=${locales} widths=${widths}`);
  const shotDir = (t) => (mode === 'baseline' ? path.join(baselineDir(t), 'screens') : path.join(outRoot, t));
  for (const t of targets) {
    if (mode === 'baseline' && !filtered) fs.rmSync(path.join(baselineDir(t), 'screens'), { recursive: true, force: true });
    fs.mkdirSync(shotDir(t), { recursive: true });
  }

  const tasks = [];
  for (const pg of pages) for (const locale of locales) for (const width of widths) for (const target of targets) {
    const base = C.fileBase(pg.key, locale, width);
    tasks.push({
      target, page: pg, locale, width, masks,
      shotPath: path.join(shotDir(target), `${base}.png`),
      maskedPath: path.join(shotDir(target), `${base}.masked.png`),
    });
  }

  const browser = await chromium.launch();
  let done = 0;
  const caps = await pool(tasks, args.concurrency, async (task) => {
    const r = await capture(browser, task);
    log(`(${++done}/${tasks.length}) ${r.target} ${r.page} ${r.locale} ${r.width}: ${r.error ? 'ERROR ' + r.error : `HTTP ${r.status}, ${r.height}px, open ${r.borders.open}/dbl ${r.borders.doubled}, h1 ${r.h1.visible}+${r.h1.hidden}, overflow ${r.overflow.px}`}`);
    return r;
  });
  await browser.close();

  const byTarget = Object.fromEntries(targets.map((t) => [t, caps.filter((c) => c.target === t)]));
  const cache = new Map();
  const links = {};
  for (const t of targets) links[t] = await runLinks(t, byTarget[t], cache);

  // ---- baseline ----------------------------------------------------------
  if (mode === 'baseline') {
    for (const t of targets) {
      const dir = baselineDir(t);
      const file = path.join(dir, 'baseline.json');
      let results = byTarget[t].map((r) => serialize(r, dir));
      let allLinks = links[t];
      if (filtered && fs.existsSync(file)) {
        const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
        const keys = new Set(results.map((r) => C.rowKey(r.page, r.locale, r.width)));
        results = [...prev.results.filter((r) => !keys.has(C.rowKey(r.page, r.locale, r.width))), ...results];
        const seen = new Set(allLinks.map((l) => l.url));
        allLinks = [...prev.links.filter((l) => !seen.has(l.url)), ...allLinks];
      }
      const capturedAt = new Date().toISOString();
      fs.writeFileSync(
        file,
        JSON.stringify({
          schema: 1, target: t, baseUrl: C.TARGETS[t], capturedAt, date: capturedAt.slice(0, 10),
          note: 'Captured read-only (GET + headless browsing). Shot paths are relative to this directory.',
          settings: {
            widths: C.ALL_WIDTHS, viewportHeight: C.VIEWPORT_HEIGHT, locales: C.LOCALES, mobileDeviceScaleFactor: C.MOBILE_DSF,
            maxShotHeight: C.MAX_SHOT_HEIGHT, diffThreshold: C.DIFF_THRESHOLD, settleMs: C.SETTLE_MS,
            hiddenBannerSelectors: C.BANNER_SELECTORS, blockedHosts: C.BLOCKED_HOSTS, masks,
          },
          results, links: allLinks,
        }, null, 1),
      );
      const rows = buildRows(pages, locales, widths, { [t]: Object.fromEntries(byTarget[t].map((r) => [C.rowKey(r.page, r.locale, r.width), r])) });
      writeReport({ dir, title: `Yulex QA baseline: ${t}`, cols: [{ id: t, label: t }], rows, links: { [t]: links[t] }, meta: { mode, target: t, capturedAt, baseUrl: C.TARGETS[t] } });
      log(`baseline written: ${path.relative(C.QA_DIR, dir)}`);
    }
    return;
  }

  // ---- normal / compare --------------------------------------------------
  fs.mkdirSync(outRoot, { recursive: true });
  let cols, resMaps;
  const mapOf = (arr) => Object.fromEntries(arr.map((r) => [C.rowKey(r.page, r.locale, r.width), r]));
  if (mode === 'compare') {
    const bdir = baselineDir('live');
    const bfile = path.join(bdir, 'baseline.json');
    if (!fs.existsSync(bfile)) throw new Error('No baseline at qa/baseline/live/baseline.json; run with --baseline --target live first.');
    const b = JSON.parse(fs.readFileSync(bfile, 'utf8'));
    const refResults = b.results.map((r) => ({ ...r, shot: abs(bdir, r.shot), maskedShot: abs(bdir, r.maskedShot) }));
    cols = [{ id: 'ref', label: `live baseline ${b.date}` }, { id: targets[0], label: `${targets[0]} (now)` }];
    resMaps = { ref: mapOf(refResults), [targets[0]]: mapOf(byTarget[targets[0]]) };
    links.ref = b.links;
    // order links like columns
    links[targets[0]] = links[targets[0]];
  } else {
    cols = targets.map((t) => ({ id: t, label: t }));
    resMaps = Object.fromEntries(targets.map((t) => [t, mapOf(byTarget[t])]));
  }
  const rows = buildRows(pages, locales, widths, resMaps);
  if (doDiff && cols.length === 2) {
    log('pixel diffing');
    for (const row of rows) {
      const a = row.res[cols[0].id], b = row.res[cols[1].id];
      if (!a || !b || a.error || b.error || !a.shot || !b.shot) { row.diff = { error: 'missing capture' }; continue; }
      const useMasked = a.maskedShot && b.maskedShot;
      const base = C.fileBase(row.page.key, row.locale, row.width);
      try {
        row.diff = diffImages(useMasked ? a.maskedShot : a.shot, useMasked ? b.maskedShot : b.shot, path.join(outRoot, 'diff', `${base}.png`));
        row.diff.masked = !!useMasked;
      } catch (e) {
        row.diff = { error: String(e.message) };
      }
    }
  }
  const ordered = {};
  for (const c of cols) ordered[c.id] = links[c.id] || [];
  writeReport({
    dir: outRoot,
    title: mode === 'compare' ? `Yulex QA: ${targets[0]} vs live baseline` : `Yulex QA: ${targets.join(' + ')}`,
    cols, rows, links: ordered,
    meta: { mode, targets: targets.join(', '), startedAt: new Date(t0).toISOString(), pages: pages.map((p) => p.key).join(', '), locales: locales.join(', '), widths: widths.join(', ') },
  });
  log(`report: ${path.join(outRoot, 'report.html')}`);
}

// Re-render report.html/json from a stored baseline.json (no browsing).
function reportOnly() {
  for (const t of targets) {
    const dir = baselineDir(t);
    const b = JSON.parse(fs.readFileSync(path.join(dir, 'baseline.json'), 'utf8'));
    const results = b.results.map((r) => ({ ...r, shot: abs(dir, r.shot), maskedShot: abs(dir, r.maskedShot) }));
    const rows = buildRows(allPages, Object.keys(C.LOCALES), C.ALL_WIDTHS, { [t]: Object.fromEntries(results.map((r) => [C.rowKey(r.page, r.locale, r.width), r])) });
    writeReport({ dir, title: `Yulex QA baseline: ${t}`, cols: [{ id: t, label: t }], rows, links: { [t]: b.links }, meta: { mode: 'baseline', target: t, capturedAt: b.capturedAt, baseUrl: b.baseUrl } });
    log(`re-rendered ${path.relative(C.QA_DIR, dir)}/report.html`);
  }
}

function buildRows(pages, locales, widths, resMaps) {
  const rows = [];
  for (const page of pages) for (const locale of locales) for (const width of widths) {
    const res = {};
    for (const [id, m] of Object.entries(resMaps)) res[id] = m[C.rowKey(page.key, locale, width)];
    rows.push({ page, locale, width, res, diff: null });
  }
  return rows;
}

function writeReport({ dir, title, cols, rows, links, meta }) {
  fs.mkdirSync(dir, { recursive: true });
  const linkSummary = Object.fromEntries(Object.entries(links).map(([id, ls]) => [id, { checked: ls.length, failing: ls.filter((l) => l.status === 0 || l.status >= 400) }]));
  const json = {
    meta, cols,
    rows: rows.map((r) => ({
      page: r.page.key, type: r.page.type, locale: r.locale, width: r.width,
      diff: r.diff && !r.diff.error ? { ...r.diff, ref: undefined, cur: undefined, refSize: r.diff.ref, curSize: r.diff.cur, diffPath: rel(dir, r.diff.diffPath), cell: diffCell(r.diff) } : r.diff,
      results: Object.fromEntries(cols.map((c) => {
        const x = r.res[c.id];
        return [c.id, x ? { url: x.url, status: x.status, height: x.height, error: x.error, cells: cells(x), shot: rel(dir, x.shot), maskedShot: rel(dir, x.maskedShot) } : null];
      })),
    })),
    links: linkSummary,
  };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(json, null, 1));
  renderReport({ title, meta, cols, rows, links, outDir: dir });
}

try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(mode === 'baseline' ? 0 : 1);
}
