import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { homeTeam } from './fixtures.mjs';
import { bundle, launch, open, resize, restart } from './harness.mjs';

let browser;
let script;
before(async () => {
  [browser, script] = [await launch(), await bundle()];
});
after(() => browser.close());

const state = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-yx-home-team]');
    const cta = document.querySelector('[data-yx-home-team-cta]');
    const visible = [...root.children].filter((c) => getComputedStyle(c).display !== 'none');
    const tops = [...new Set(visible.map((c) => Math.round(c.getBoundingClientRect().top)))];
    return {
      ready: root.getAttribute('data-yx-ready'),
      visible: visible.length,
      rows: tops.map(
        (t) => visible.filter((c) => Math.round(c.getBoundingClientRect().top) === t).length
      ),
      ctaIndex: visible.indexOf(cta),
      ctaInList: cta?.parentElement === root,
      ctaRow: cta ? tops.indexOf(Math.round(cta.getBoundingClientRect().top)) : -1,
      slots: visible.map((c) => c.getAttribute('data-yx-slot')),
      tones: visible.filter((c) => c !== cta).map((c) => c.getAttribute('data-yx-tone')),
      ctaTone: cta?.getAttribute('data-yx-tone'),
      hiddenCount: [...root.children].filter((c) => c.hidden).length,
      hiddenSlots: [...root.children].filter((c) => c.hidden && c.hasAttribute('data-yx-slot'))
        .length,
      people: visible.filter((c) => c !== cta).map((c) => c.textContent.trim()),
      fsOnList: [...root.attributes, ...(cta?.attributes ?? [])].filter((a) =>
        a.name.startsWith('fs-list-')
      ).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

describe('home team', () => {
  for (const [width, rows, total, cta, ctaRow] of [
    [1440, [4, 5, 4], 13, 6, 1],
    [1280, [4, 5, 4], 13, 6, 1],
    [1279, [2, 3, 2], 7, 3, 1],
    [900, [2, 3, 2], 7, 3, 1],
    [768, [2, 3, 2], 7, 3, 1],
    [767, [1, 1, 1, 1, 1], 5, 2, 2],
    [375, [1, 1, 1, 1, 1], 5, 2, 2],
  ]) {
    it(`lays out ${total} items in rows ${rows.join(' / ')} at ${width}px`, async () => {
      const page = await open(browser, homeTeam(), { width, script });
      const s = await state(page);
      assert.equal(s.visible, total);
      assert.deepEqual(s.rows, rows);
      assert.equal(s.ctaIndex, cta);
      assert.equal(s.ctaRow, ctaRow);
      assert.equal(s.ctaInList, true);
      assert.deepEqual(
        s.slots,
        Array.from({ length: total }, (_, i) => String(i))
      );
      assert.equal(s.hiddenCount, 21 + 1 - total);
      assert.equal(s.hiddenSlots, 0);
      assert.equal(s.overflow, 0);
      assert.deepEqual(page.warnings, []);
      assert.deepEqual(page.errors, []);
      await page.context().close();
    });
  }

  it('puts the CTA in the middle of the middle row', async () => {
    for (const [width, perRow, before] of [
      [1440, 5, 2],
      [900, 3, 1],
    ]) {
      const page = await open(browser, homeTeam(), { width, script });
      const s = await state(page);
      assert.equal(
        s.ctaIndex - s.rows[0],
        before,
        `${width}px: ${before} cards before it in its row`
      );
      assert.equal(s.rows[1], perRow);
      await page.context().close();
    }
  });

  it('tones people by index modulo 3, counted without the CTA', async () => {
    const page = await open(browser, homeTeam(), { width: 1440, script });
    const s = await state(page);
    assert.deepEqual(
      s.tones,
      Array.from({ length: 12 }, (_, i) => String(i % 3))
    );
    assert.equal(s.ctaTone, null);
    await page.context().close();
  });

  it('removes the Finsweet attributes from the list and the CTA', async () => {
    const page = await open(browser, homeTeam(), { script });
    assert.equal((await state(page)).fsOnList, 0);
    await page.context().close();
  });

  it('shuffles on every load and keeps every person', async () => {
    const orders = [];
    for (let i = 0; i < 3; i += 1) {
      const page = await open(browser, homeTeam(), { width: 1440, script });
      orders.push((await state(page)).people.join('|'));
      await page.context().close();
    }
    assert.ok(new Set(orders).size > 1, 'orders differ between loads');
  });

  it('keeps one order across resizes', async () => {
    const page = await open(browser, homeTeam(), { width: 1440, script });
    const large = (await state(page)).people;
    await resize(page, 900);
    const medium = (await state(page)).people;
    await resize(page, 375);
    const small = (await state(page)).people;
    assert.deepEqual(medium, large.slice(0, 6));
    assert.deepEqual(small, large.slice(0, 4));
    await resize(page, 1440);
    assert.deepEqual((await state(page)).people, large);
    await page.context().close();
  });

  it('shuffles without bias (Fisher–Yates)', async () => {
    const page = await open(browser, homeTeam({ n: 4 }), { width: 375, script });
    const counts = await page.evaluate(() => {
      const tally = {};
      for (let run = 0; run < 1200; run += 1) {
        const root = document.querySelector('[data-yx-home-team]');
        // Fresh DOM for each run: rebuild the list from the original names.
        root.removeAttribute('data-yx-ready');
        window.__starts.forEach((fn) => fn());
        const first =
          root.children[0] === document.querySelector('[data-yx-home-team-cta]')
            ? null
            : root.children[0].textContent.trim();
        tally[first] = (tally[first] ?? 0) + 1;
      }
      return tally;
    });
    // Slot 0 holds one of four people each run, so each should lead about 300 of 1200 runs.
    for (const name of ['Person 01', 'Person 02', 'Person 03', 'Person 04']) {
      assert.ok(counts[name] > 220 && counts[name] < 380, `${name} led ${counts[name]} of 1200`);
    }
    await page.context().close();
  });

  it('is idempotent', async () => {
    const page = await open(browser, homeTeam(), { script });
    const before = await page.content();
    await restart(page);
    assert.equal(await page.content(), before);
    await page.context().close();
  });

  it('warns without a CTA and still lays out the people', async () => {
    const page = await open(browser, homeTeam({ cta: false }), { width: 1440, script });
    const s = await state(page);
    assert.equal(s.visible, 13);
    assert.equal(page.warnings.length, 1);
    assert.match(page.warnings[0], /^\[yx\] home-team/);
    await page.context().close();
  });

  it('shows no more than 7 cards and no CTA before the script runs', async () => {
    const page = await open(browser, homeTeam(), { width: 1440, script, start: false });
    const visible = await page.evaluate(
      () =>
        [...document.querySelector('[data-yx-home-team]').children].filter(
          (c) => getComputedStyle(c).display !== 'none'
        ).length
    );
    const cta = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-yx-home-team-cta]')).display
    );
    assert.equal(visible, 7);
    assert.equal(cta, 'none');
    await page.context().close();
  });

  it('does nothing without the attribute', async () => {
    const page = await open(browser, '<p>nothing here</p>', { script });
    assert.deepEqual(page.warnings, []);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
});
