import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { related } from './fixtures.mjs';
import { bundle, launch, open, restart } from './harness.mjs';

let browser;
let script;
before(async () => {
  [browser, script] = [await launch(), await bundle()];
});
after(() => browser.close());

const state = (page) =>
  page.evaluate(() => {
    const section = document.querySelector('[data-yx-related-section]');
    const rows = Object.fromEntries(
      [...section.querySelectorAll('[data-yx-related]')].map((row) => [
        row.getAttribute('data-yx-related'),
        {
          links: [...row.querySelectorAll('.w-dyn-item a')].map((a) => a.getAttribute('href')),
          shown: getComputedStyle(row).display !== 'none',
          hidden: row.hidden,
          sameList: new Set([...row.querySelectorAll('.w-dyn-item')].map((i) => i.parentElement))
            .size,
        },
      ])
    );
    const heading = (kind) =>
      getComputedStyle(section.querySelector(`[data-yx-related-heading="${kind}"]`)).display !==
      'none';
    return {
      ready: section.getAttribute('data-yx-ready'),
      rows,
      own: heading('own'),
      latest: heading('latest'),
      poolLeft: section.querySelector('[data-yx-related-pool]')?.children.length,
    };
  });

describe('related content', () => {
  it('tops each row up to 3 from the pool of its own type, newest first, own items first', async () => {
    const page = await open(browser, related({ own: { article: [1, 2], podcast: [4, 5, 6] } }), {
      script,
    });
    const s = await state(page);
    assert.deepEqual(s.rows.article.links, ['/article-1', '/article-2', '/article-10']);
    assert.deepEqual(s.rows.capsule.links, ['/capsule-20', '/capsule-21', '/capsule-22']);
    assert.deepEqual(s.rows.podcast.links, ['/podcast-4', '/podcast-5', '/podcast-6']);
    assert.deepEqual(page.warnings, []);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });

  it('shows the own heading when any row has an own item', async () => {
    const page = await open(browser, related({ own: { capsule: [7] } }), { script });
    const s = await state(page);
    assert.equal(s.ready, 'own');
    assert.equal(s.own, true);
    assert.equal(s.latest, false);
    await page.context().close();
  });

  it('shows the latest heading when no row has an own item', async () => {
    const page = await open(browser, related(), { script });
    const s = await state(page);
    assert.equal(s.ready, 'latest');
    assert.equal(s.own, false);
    assert.equal(s.latest, true);
    assert.deepEqual(s.rows.article.links, ['/article-10', '/article-11', '/article-12']);
    await page.context().close();
  });

  it('never adds a duplicate: a pool card whose link is already in the row is skipped', async () => {
    const page = await open(browser, related({ own: { article: [10, 11] } }), { script });
    const s = await state(page);
    // The pool's articles start 10, 11, 12: 10 and 11 are already there, so 12 fills the third slot.
    assert.deepEqual(s.rows.article.links, ['/article-10', '/article-11', '/article-12']);
    assert.equal(new Set(s.rows.article.links).size, 3);
    await page.context().close();
  });

  it('shows what it has when the pool cannot fill a row, and hides a row with nothing', async () => {
    const page = await open(
      browser,
      related({ pool: { article: [10], capsule: [], podcast: [30, 31] } }),
      { script }
    );
    const s = await state(page);
    assert.deepEqual(s.rows.article.links, ['/article-10']);
    assert.deepEqual(s.rows.podcast.links, ['/podcast-30', '/podcast-31']);
    assert.equal(s.rows.capsule.hidden, true);
    assert.equal(s.rows.capsule.shown, false);
    assert.equal(s.rows.article.shown, true);
    await page.context().close();
  });

  it('puts topped-up cards in the same list as the row, including an empty one', async () => {
    const page = await open(browser, related({ own: { article: [1] } }), { script });
    const s = await state(page);
    assert.equal(s.rows.article.sameList, 1);
    assert.equal(s.rows.capsule.sameList, 1);
    await page.context().close();
  });

  it('does not use a pool card twice', async () => {
    const page = await open(browser, related(), { script });
    const s = await state(page);
    assert.equal(s.poolLeft, 12 - 9);
    await page.context().close();
  });

  it('works at 375, 900 and 1440px with no overflow', async () => {
    for (const width of [375, 900, 1440]) {
      const page = await open(browser, related({ own: { article: [1] } }), { width, script });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      assert.equal(overflow, 0);
      assert.equal((await state(page)).rows.article.links.length, 3);
      await page.context().close();
    }
  });

  it('without the script: own items only, empty rows hidden, pool hidden, heading follows the data', async () => {
    const page = await open(browser, related({ own: { article: [1] } }), { script, start: false });
    const s = await state(page);
    assert.equal(s.rows.article.shown, true);
    assert.equal(s.rows.capsule.shown, false);
    assert.equal(s.own, true);
    assert.equal(s.latest, false);
    const pool = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-yx-related-pool]')).display
    );
    assert.equal(pool, 'none');
    const none = await open(browser, related(), { script, start: false });
    const t = await state(none);
    assert.equal(t.own, false);
    assert.equal(t.latest, true);
    await page.context().close();
    await none.context().close();
  });

  it('is idempotent', async () => {
    const page = await open(browser, related({ own: { article: [1] } }), { script });
    const before = await page.content();
    await restart(page);
    assert.equal(await page.content(), before);
    await page.context().close();
  });

  it('warns when there is no pool and still hides empty rows', async () => {
    const html = related({ own: { article: [1] } }).replaceAll('data-yx-related-pool', 'data-x');
    const page = await open(browser, html, { script });
    assert.equal(page.warnings.length, 1);
    assert.match(page.warnings[0], /^\[yx\] related/);
    const s = await state(page);
    assert.equal(s.rows.capsule.hidden, true);
    await page.context().close();
  });

  it('does nothing without the attribute', async () => {
    const page = await open(browser, '<p>nothing here</p>', { script });
    assert.deepEqual(page.warnings, []);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
});
