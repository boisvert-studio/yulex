import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TARGETS = {
  live: 'https://www.yulex.ca',
  staging: 'https://yulex-staging.webflow.io',
};
export const LOCALES = { fr: '', en: '/en-ca' };
export const ALL_WIDTHS = [1440, 900, 375];
export const VIEWPORT_HEIGHT = 900;
export const MAX_SHOT_HEIGHT = 12000; // CSS px; taller pages are cropped and flagged
export const MOBILE_DSF = 1; // 2 would push the longest pages past Chromium's ~16k px texture limit
export const MAX_SHOT_DEVICE_PX = 16000; // guard: CSS px * deviceScaleFactor
export const MOBILE_MAX_WIDTH = 500;
export const SETTLE_MS = 1500;
export const NETWORKIDLE_TIMEOUT = 15000;
export const NAV_TIMEOUT = 45000;
export const DIFF_THRESHOLD = 0.1;

/** Consent-banner containers hidden (never clicked) for screenshots and measurements. */
export const BANNER_SELECTORS = ['.cky-consent-container', '.cky-overlay', '.cky-modal', '.cky-btn-revisit-wrapper'];

/** Analytics/ads hosts are not loaded, to keep QA traffic out of the client's stats. */
export const BLOCKED_HOSTS = [
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'doubleclick.net',
  'facebook.net',
  'facebook.com/tr',
  'hotjar.com',
  'clarity.ms',
  'linkedin.com/px',
  'px.ads.linkedin.com',
];

export function loadPages() {
  const raw = JSON.parse(fs.readFileSync(path.join(QA_DIR, 'pages.json'), 'utf8'));
  return { pages: raw.pages, masks: raw.masks || [] };
}

/** Resolves `discover` entries: picks a path from the unique same-site links on a live page (always live, so both targets get the same page). */
export async function resolvePages(pages) {
  const cache = {};
  for (const pg of pages) {
    if (!pg.discover || pg.path) continue;
    const { from, match, index } = pg.discover;
    if (!cache[from]) {
      const res = await fetch(TARGETS.live + from);
      const html = await res.text();
      cache[from] = [...new Set([...html.matchAll(/href="([^"#?]+)"/g)].map((m) => m[1]))];
    }
    const hits = cache[from].filter((h) => new RegExp(match).test(h));
    if (!hits.length) throw new Error(`discover: no link matching ${match} on ${from}`);
    pg.path = hits.at(index);
  }
  return pages;
}

export function urlFor(target, locale, pg) {
  const prefix = LOCALES[locale];
  const pagePath = pg.paths?.[locale] ?? pg.path; // optional per-locale path override (path WITHOUT the locale prefix)
  let p = pagePath;
  if (prefix) p = pagePath === '/' ? prefix : prefix + pagePath;
  return TARGETS[target] + p;
}

export const rowKey = (pageKey, locale, width) => `${pageKey}|${locale}|${width}`;
export const fileBase = (pageKey, locale, width) => `${pageKey}.${locale}.${width}`;
