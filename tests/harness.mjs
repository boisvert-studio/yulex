import * as esbuild from 'esbuild';
import { chromium } from '../qa/node_modules/playwright/index.mjs';

/** The bundle as a browser script, built from source so the tests never read a stale dist. */
export const bundle = async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2020',
  });
  return outputFiles[0].text;
};

export const launch = () => chromium.launch();

/**
 * Open `html` at `width`, shim Webflow.push so the bundle's start-up callback runs, inject the bundle.
 * Returns the page with `page.warnings` (console.warn texts) and `page.errors` (page errors).
 */
export const open = async (browser, html, { width = 1440, script, start = true } = {}) => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.warnings = [];
  page.errors = [];
  page.on('console', (m) => m.type() === 'warning' && page.warnings.push(m.text()));
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setContent(html);
  await page.evaluate(() => {
    window.__starts = [];
    window.Webflow = { push: (fn) => (window.__starts.push(fn), fn()) };
  });
  if (start) await page.addScriptTag({ content: script });
  return page;
};

/** Run the registered start-up callbacks again (a second start of the bundle). */
export const restart = (page) => page.evaluate(() => window.__starts.forEach((fn) => fn()));

/** Resize and wait two frames, so matchMedia listeners have run. */
export const resize = async (page, width) => {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
};
