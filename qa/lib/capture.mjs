import fs from 'node:fs';
import path from 'node:path';
import * as C from './config.mjs';
import { borderProbe, pageChecks } from './inpage.mjs';

const HIDE_CSS = `
${C.BANNER_SELECTORS.join(',')}{display:none!important;visibility:hidden!important}
*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important;caret-color:transparent!important}
`;

async function settle(page, log) {
  // 1. network idle (fallback after a timeout), 2. let Webflow/Finsweet scripts run
  await page.waitForLoadState('networkidle', { timeout: C.NETWORKIDLE_TIMEOUT }).catch(() => log('networkidle timeout, continuing'));
  await page.waitForTimeout(C.SETTLE_MS);
  await page.addStyleTag({ content: HIDE_CSS });
  // make lazy images load, then walk the page to fire scroll-triggered reveals
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => i.setAttribute('loading', 'eager'));
  });
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(300, Math.floor(innerHeight * 0.7));
    for (let y = 0, n = 0; n < 120; n++) {
      window.scrollTo(0, y);
      await wait(90);
      const max = document.documentElement.scrollHeight - innerHeight;
      if (y >= max) break;
      y = Math.min(y + step, max);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await wait(400);
    window.scrollTo(0, 0);
    await wait(300);
  });
  await page
    .evaluate(async () => {
      await document.fonts.ready;
      await Promise.race([
        Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
    })
    .catch(() => {});
  await page.waitForTimeout(400);
}

/**
 * Capture one target x page x locale x width. Never throws: failures are recorded in `error`.
 */
export async function capture(browser, job) {
  const { target, locale, width, page: pg, shotPath, maskedPath, masks } = job;
  const url = C.urlFor(target, locale, pg);
  const mobile = width <= C.MOBILE_MAX_WIDTH;
  const dsf = mobile ? C.MOBILE_DSF : 1;
  const res = {
    target, page: pg.key, type: pg.type, locale, width, url,
    capturedAt: new Date().toISOString(),
    status: null, expectStatus: pg.expectStatus || 200, finalUrl: null, title: null,
    error: null, notes: [],
  };
  const log = (m) => res.notes.push(m);
  const ctx = await browser.newContext({
    viewport: { width, height: C.VIEWPORT_HEIGHT },
    deviceScaleFactor: dsf,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    locale: locale === 'fr' ? 'fr-CA' : 'en-CA',
    serviceWorkers: 'block',
  });
  try {
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      return C.BLOCKED_HOSTS.some((h) => u.includes(h)) ? route.abort() : route.continue();
    });
    const page = await ctx.newPage();
    let response;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        response = await page.goto(url, { waitUntil: attempt === 1 ? 'load' : 'domcontentloaded', timeout: C.NAV_TIMEOUT });
        break;
      } catch (e) {
        log(`goto attempt ${attempt} failed: ${String(e.message).split('\n')[0]}`);
        if (attempt === 2) throw e;
      }
    }
    res.status = response ? response.status() : null;
    res.finalUrl = page.url();
    await settle(page, log);
    res.title = await page.title();

    // measurements (banner already hidden, animations off)
    const probe = await page.evaluate(borderProbe);
    const chk = await page.evaluate(pageChecks, { vw: width });
    const height = await page.evaluate(() =>
      Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
    );
    res.height = height;
    res.h1 = chk.h1;
    res.landmarks = chk.landmarks;
    res.overflow = chk.overflow;
    res.webflowLinks = chk.webflowLinks;
    res.hrefs = chk.hrefs;
    res.hrefCount = chk.hrefs.length;
    res.borders = {
      strokeStyles: probe.strokeStyles,
      grids: probe.grids,
      borderedGrids: probe.grids.filter((g) => g.bordered).length,
      open: probe.grids.reduce((n, g) => n + g.open, 0),
      doubled: probe.grids.reduce((n, g) => n + g.doubled, 0),
    };

    // screenshot (cropped to the viewport width and to the height cap)
    const cap = Math.min(C.MAX_SHOT_HEIGHT, Math.floor(C.MAX_SHOT_DEVICE_PX / dsf));
    const shotH = Math.min(height, cap);
    res.truncated = height > cap;
    if (res.truncated) log(`page is ${height}px tall; screenshot cropped to ${cap}px`);
    const clip = { x: 0, y: 0, width, height: shotH };
    await page.screenshot({ path: shotPath, fullPage: true, clip, animations: 'disabled', caret: 'hide' });
    res.shot = shotPath;
    res.shotSize = { w: width * dsf, h: shotH * dsf, dsf };

    // masked variant for pixel diffing (nondeterministic regions painted over by Playwright)
    const active = [];
    for (const m of masks) {
      if (!(m.pages.includes('*') || m.pages.includes(pg.key))) continue;
      const n = await page.locator(m.selector).count();
      if (n > 0) active.push({ selector: m.selector, matches: n, reason: m.reason });
    }
    res.masks = active;
    if (active.length) {
      await page.screenshot({
        path: maskedPath, fullPage: true, clip, animations: 'disabled', caret: 'hide',
        mask: active.map((m) => page.locator(m.selector)), maskColor: '#ff00ff',
      });
      res.maskedShot = maskedPath;
    }
  } catch (e) {
    res.error = String(e.message).split('\n')[0];
  } finally {
    await ctx.close().catch(() => {});
  }
  return res;
}
