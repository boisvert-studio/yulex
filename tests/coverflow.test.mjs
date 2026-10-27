import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { coverflow } from './fixtures.mjs';
import { bundle, launch, open, resize, restart } from './harness.mjs';

let browser;
let script;
before(async () => {
  [browser, script] = [await launch(), await bundle()];
});
after(() => browser.close());

const state = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-yx-coverflow]');
    const rootBox = root.getBoundingClientRect();
    const visible = [...root.children].filter((c) => getComputedStyle(c).display !== 'none');
    return {
      ready: root.getAttribute('data-yx-ready'),
      slots: [...root.children]
        .filter((c) => c.hasAttribute('data-yx-slot'))
        .map((c) => Number(c.getAttribute('data-yx-slot'))),
      visible: visible.length,
      tones: [...root.children]
        .sort((a, b) => a.querySelector('img').alt.localeCompare(b.querySelector('img').alt))
        .map((c) => c.getAttribute('data-yx-tone')),
      names: visible.map((c) => c.querySelector('img').alt),
      centres: visible.map((c) => {
        const b = c.getBoundingClientRect();
        return b.left + b.width / 2;
      }),
      rootCentre: rootBox.left + rootBox.width / 2,
      rightEdge: Math.max(...visible.map((c) => c.getBoundingClientRect().right)),
      leftEdge: Math.min(...visible.map((c) => c.getBoundingClientRect().left)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      link: (() => {
        const l = root.querySelector('.w--current');
        return l && [l.getAttribute('aria-current'), l.getAttribute('tabindex')];
      })(),
    };
  });

describe('coverflow', () => {
  for (const [width, count] of [
    [1440, 5],
    [900, 5],
    [480, 5],
    [375, 3],
  ]) {
    it(`shows ${count} cards in slot order at ${width}px, centred, with no horizontal pan`, async () => {
      const page = await open(browser, coverflow({ n: 9, current: 4 }), { width, script });
      const s = await state(page);
      assert.equal(s.visible, count);
      assert.deepEqual(s.slots, count === 5 ? [-2, -1, 0, 1, 2] : [-1, 0, 1]);
      assert.deepEqual(
        s.names,
        (count === 5 ? [2, 3, 4, 5, 6] : [3, 4, 5]).map(
          (n) => `Person ${String(n + 1).padStart(2, '0')}`
        )
      );
      assert.ok(
        Math.abs(s.centres[(count - 1) / 2] - s.rootCentre) < 1.5,
        'current card is centred'
      );
      assert.ok(
        s.centres.every((c, i, a) => i === 0 || c > a[i - 1]),
        'cards run left to right'
      );
      assert.ok(s.leftEdge >= 0 && s.rightEdge <= width, 'row stays on screen');
      assert.equal(s.overflow, 0, 'page does not pan sideways');
      assert.deepEqual(page.warnings, []);
      assert.deepEqual(page.errors, []);
      await page.context().close();
    });
  }

  it('fits 343px of content at 375px and degrades without panning at 320px', async () => {
    for (const width of [375, 320]) {
      const page = await open(browser, coverflow({ n: 9, current: 0 }), { width, script });
      const s = await state(page);
      assert.equal(s.overflow, 0);
      assert.ok(s.rightEdge - s.leftEdge <= width - 32 + 1, `${width}px row fits its container`);
      await page.context().close();
    }
  });

  it('wraps around the ends of the list', async () => {
    const first = await open(browser, coverflow({ n: 9, current: 0 }), { script });
    assert.deepEqual((await state(first)).names, [
      'Person 08',
      'Person 09',
      'Person 01',
      'Person 02',
      'Person 03',
    ]);
    const last = await open(browser, coverflow({ n: 9, current: 8 }), { script });
    assert.deepEqual((await state(last)).names, [
      'Person 07',
      'Person 08',
      'Person 09',
      'Person 01',
      'Person 02',
    ]);
    await first.context().close();
    await last.context().close();
  });

  it('colours by list index modulo 3 and marks the current link', async () => {
    const page = await open(browser, coverflow({ n: 9, current: 4 }), { script });
    const s = await state(page);
    assert.deepEqual(s.tones, ['0', '1', '2', '0', '1', '2', '0', '1', '2']);
    assert.deepEqual(s.link, ['page', '-1']);
    assert.equal(s.ready, 'true');
    await page.context().close();
  });

  it('resolves tone to the theme colour', async () => {
    const page = await open(browser, coverflow({ n: 6, current: 0 }), { script });
    const colours = await page.evaluate(() =>
      [...document.querySelectorAll('[data-yx-coverflow] > [data-yx-slot]')].map(
        (c) => getComputedStyle(c.querySelector('.coverflow_background')).backgroundColor
      )
    );
    assert.equal(new Set(colours).size, 3);
    await page.context().close();
  });

  it('re-lays out when the viewport crosses 480px, keeping the same current card', async () => {
    const page = await open(browser, coverflow({ n: 9, current: 4 }), { width: 900, script });
    assert.equal((await state(page)).visible, 5);
    await resize(page, 375);
    const narrow = await state(page);
    assert.equal(narrow.visible, 3);
    assert.deepEqual(narrow.names, ['Person 04', 'Person 05', 'Person 06']);
    await resize(page, 1440);
    assert.equal((await state(page)).visible, 5);
    await page.context().close();
  });

  it('hides every other card before and after layout', async () => {
    const page = await open(browser, coverflow({ n: 21, current: 10 }), { script });
    assert.equal((await state(page)).visible, 5);
    await page.context().close();
  });

  it('is idempotent', async () => {
    const page = await open(browser, coverflow({ n: 9, current: 4 }), { script });
    const before = await page.content();
    await restart(page);
    assert.equal(await page.content(), before);
    await page.context().close();
  });

  it('warns and lays out from the first item when no link is current', async () => {
    const page = await open(browser, coverflow({ n: 9, current: -1 }), { script });
    const s = await state(page);
    assert.equal(s.ready, 'no-current');
    assert.equal(s.names[2], 'Person 01');
    assert.equal(page.warnings.length, 1);
    assert.match(page.warnings[0], /^\[yx\] coverflow/);
    await page.context().close();
  });

  it('shows a short list once each, with the current card in the middle slot', async () => {
    const page = await open(browser, coverflow({ n: 2, current: 1 }), { script });
    const s = await state(page);
    assert.deepEqual(s.names, ['Person 01', 'Person 02']);
    assert.deepEqual(s.slots, [-1, 0]);
    await page.context().close();
  });

  it('warns on an empty list and does nothing without the attribute', async () => {
    const empty = await open(browser, coverflow({ n: 0 }), { script });
    assert.equal(empty.warnings.length, 1);
    assert.deepEqual(empty.errors, []);
    const absent = await open(browser, '<p>nothing here</p>', { script });
    assert.deepEqual(absent.warnings, []);
    assert.deepEqual(absent.errors, []);
    await empty.context().close();
    await absent.context().close();
  });
});
