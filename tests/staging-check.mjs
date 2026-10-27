// Injects a fresh build into staging pages and reports what each module did. Read-only: GET + a headless browser.
// Usage: node tests/staging-check.mjs [bundle-path|--build] ; output goes to qa/output/ (git-ignored).
import { mkdirSync, writeFileSync } from 'node:fs';

import { bundle, launch } from './harness.mjs';

const ORIGIN = 'https://yulex-staging.webflow.io';
const WIDTHS = [375, 900, 1440];
const LOCALES = ['', '/en-ca'];

const browser = await launch();
const script = await bundle();

// One representative page per module; profile and article paths are found from the team page and the Contenus page.
const discover = async (path, match, index) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${ORIGIN}${path}`);
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
  await page.context().close();
  const hits = [...new Set(hrefs.filter((h) => new RegExp(match).test(h)))];
  return hits.at(index);
};

const targets = [
  { key: 'home', path: '/' },
  { key: 'profile', path: await discover('/equipe', '^/equipe/[^/]+$', 0) },
  { key: 'profile-no-own', path: await discover('/equipe', '^/equipe/[^/]+$', -1) },
  { key: 'expertise', path: '/expertises/litige' },
  { key: 'content', path: await discover('/contenus', '^/contenu/[^/]+$', 0) },
  { key: 'affiliation', path: '/affiliations/interlegal' },
  { key: 'about-item', path: '/a-propos/notre-adn' },
];

const results = [];
for (const locale of LOCALES) {
  for (const target of targets) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const warnings = [];
      const errors = [];
      page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${ORIGIN}${locale}${target.path}`, { waitUntil: 'networkidle' });
      await page.addScriptTag({ content: script });
      await page.waitForTimeout(600);
      const report = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const visible = (el) => getComputedStyle(el).display !== 'none';
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          coverflow: q('[data-yx-coverflow]') && {
            ready: q('[data-yx-coverflow]').getAttribute('data-yx-ready'),
            visible: [...q('[data-yx-coverflow]').children].filter(visible).length,
          },
          homeTeam: q('[data-yx-home-team]') && {
            ready: q('[data-yx-home-team]').getAttribute('data-yx-ready'),
            visible: [...q('[data-yx-home-team]').children].filter(visible).length,
            ctaInList: q('[data-yx-home-team-cta]')?.parentElement === q('[data-yx-home-team]'),
          },
          prevnext: q('[data-yx-prevnext]') && {
            ready: q('[data-yx-prevnext]').getAttribute('data-yx-ready'),
            hidden: q('[data-yx-prevnext]').hidden,
            prev: q('[data-yx-prevnext-link="prev"]')?.getAttribute('href'),
            next: q('[data-yx-prevnext-link="next"]')?.getAttribute('href'),
          },
          related: q('[data-yx-related-section]') && {
            ready: q('[data-yx-related-section]').getAttribute('data-yx-ready'),
            rows: [...document.querySelectorAll('[data-yx-related]')].map((r) => ({
              type: r.getAttribute('data-yx-related'),
              items: r.querySelectorAll('.w-dyn-item').length,
              shown: visible(r),
            })),
          },
        };
      });
      results.push({
        locale: locale || 'fr',
        page: target.key,
        path: target.path,
        width,
        ...report,
        warnings,
        errors,
      });
      await context.close();
    }
  }
}
await browser.close();

mkdirSync('qa/output', { recursive: true });
const file = `qa/output/stage3-staging-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(results, null, 2));
console.log(file);
for (const r of results) {
  const mods =
    ['coverflow', 'homeTeam', 'prevnext', 'related'].filter((m) => r[m]).join(',') || '-';
  console.log(
    `${r.locale} ${r.page} ${r.width}: modules=${mods} overflow=${r.overflow} warnings=${r.warnings.length} errors=${r.errors.length}`
  );
}
