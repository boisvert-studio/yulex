#!/usr/bin/env node
// Border sweep: every bordered cell on every page should be a closed box with single lines (lib/cells.mjs).
// Read-only: GET requests and headless browsing. Writes qa/output/borders-<time>.json (git-ignored).
// node borders.mjs [--target staging|live] [--pages home,profile] [--widths 1920,1440,900,375] [--locales fr,en] [--templates]
// --templates also sweeps every profile and expertise linked from /equipe and /expertises, not only pages.json's samples.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import * as C from './lib/config.mjs';
import { cellProbe } from './lib/cells.mjs';

const args = { target: 'staging', pages: null, widths: C.ALL_WIDTHS, locales: Object.keys(C.LOCALES), templates: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], val = () => process.argv[++i];
  if (a === '--target') args.target = val();
  else if (a === '--pages') args.pages = val().split(',');
  else if (a === '--widths') args.widths = val().split(',').map(Number);
  else if (a === '--locales') args.locales = val().split(',');
  else if (a === '--templates') args.templates = true;
}

let { pages } = C.loadPages();
pages = await C.resolvePages(pages);
if (args.pages) pages = pages.filter((p) => args.pages.includes(p.key) || args.pages.includes(p.type));
if (args.templates) {
  const base = C.TARGETS[args.target];
  for (const [from, re, type] of [['/equipe', /^\/equipe\/[^/]+$/, 'profile'], ['/expertises', /^\/expertises\/[^/]+$/, 'expertise']]) {
    const html = await (await fetch(base + from)).text();
    const hrefs = [...new Set([...html.matchAll(/href="([^"#?]+)"/g)].map((m) => m[1]).filter((h) => re.test(h)))];
    for (const h of hrefs) if (!pages.some((p) => p.path === h)) pages.push({ key: `${type}:${h.split('/').pop()}`, type, path: h });
  }
}

const browser = await chromium.launch();
const jobs = [];
for (const pg of pages) for (const locale of args.locales) for (const width of args.widths) jobs.push({ pg, locale, width });
const results = [];
const run = async ({ pg, locale, width }) => {
  const mobile = width <= C.MOBILE_MAX_WIDTH;
  const ctx = await browser.newContext({ viewport: { width, height: C.VIEWPORT_HEIGHT }, isMobile: mobile, hasTouch: mobile });
  await ctx.route((url) => C.BLOCKED_HOSTS.some((h) => url.href.includes(h)), (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(C.urlFor(args.target, locale, pg), { waitUntil: 'load', timeout: C.NAV_TIMEOUT }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: C.NETWORKIDLE_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(C.SETTLE_MS);
  await page.addStyleTag({ content: `${C.BANNER_SELECTORS.join(',')}{display:none!important}` });
  const cells = await page.evaluate(cellProbe);
  const bad = cells.filter((c) => [c.top, c.right, c.bottom, c.left].some((n) => n !== 1));
  const sides = ['top', 'right', 'bottom', 'left'];
  results.push({
    page: pg.key, locale, width, cells: cells.length,
    open: bad.reduce((n, c) => n + sides.filter((s) => c[s] === 0).length, 0),
    doubled: bad.reduce((n, c) => n + sides.filter((s) => c[s] >= 2).length, 0),
    bad,
  });
  await ctx.close();
};
const queue = [...jobs];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await run(queue.shift()); }));
await browser.close();

results.sort((a, b) => a.page.localeCompare(b.page) || a.locale.localeCompare(b.locale) || b.width - a.width);
const file = path.join(C.QA_DIR, 'output', `borders-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ target: args.target, results }, null, 1));
for (const r of results.filter((x) => x.open || x.doubled)) {
  console.log(`${r.page} ${r.locale} ${r.width}: open ${r.open}, doubled ${r.doubled}`);
  for (const c of r.bad) console.log(`  ${c.el} at ${c.x},${c.y} ${c.w}x${c.h}: T${c.top} R${c.right} B${c.bottom} L${c.left}`);
}
const total = (k) => results.reduce((n, r) => n + r[k], 0);
console.log(`${results.length} captures, open ${total('open')}, doubled ${total('doubled')}. ${file}`);
