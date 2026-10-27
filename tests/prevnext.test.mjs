import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prevNext } from './fixtures.mjs';
import { bundle, launch, open, restart } from './harness.mjs';

let browser;
let script;
before(async () => {
  [browser, script] = [await launch(), await bundle()];
});
after(() => browser.close());

const bar = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-yx-prevnext]');
    const side = (name) => {
      const link = root.querySelector(`[data-yx-prevnext-link="${name}"]`);
      return {
        href: link.getAttribute('href'),
        label: link.querySelector('[data-yx-prevnext-label]').textContent,
      };
    };
    return {
      hidden: root.hidden,
      shown: getComputedStyle(root).display !== 'none',
      ready: root.getAttribute('data-yx-ready'),
      prev: side('prev'),
      next: side('next'),
    };
  });

describe('prev/next', () => {
  for (const width of [375, 900, 1440]) {
    it(`points at the neighbours at ${width}px`, async () => {
      const page = await open(browser, prevNext({ n: 5, current: 2 }), { width, script });
      const s = await bar(page);
      assert.deepEqual(s.prev, { href: '/item-2', label: 'Item title 2' });
      assert.deepEqual(s.next, { href: '/item-4', label: 'Item title 4' });
      assert.equal(s.shown, true);
      assert.equal(s.ready, 'true');
      assert.deepEqual(page.warnings, []);
      await page.context().close();
    });
  }

  it('wraps from the first item back to the last', async () => {
    const page = await open(browser, prevNext({ n: 5, current: 0 }), { script });
    const s = await bar(page);
    assert.equal(s.prev.href, '/item-5');
    assert.equal(s.next.href, '/item-2');
    await page.context().close();
  });

  it('wraps from the last item on to the first', async () => {
    const page = await open(browser, prevNext({ n: 5, current: 4 }), { script });
    const s = await bar(page);
    assert.equal(s.prev.href, '/item-4');
    assert.equal(s.next.href, '/item-1');
    await page.context().close();
  });

  it('points both ways at the other item in a list of two', async () => {
    const page = await open(browser, prevNext({ n: 2, current: 0 }), { script });
    const s = await bar(page);
    assert.equal(s.prev.href, '/item-2');
    assert.equal(s.next.href, '/item-2');
    await page.context().close();
  });

  it('hides the bar when the list has fewer than 2 items', async () => {
    for (const n of [1, 0]) {
      const page = await open(browser, prevNext({ n, current: 0 }), { script });
      const s = await bar(page);
      assert.equal(s.hidden, true);
      assert.equal(s.shown, false);
      assert.deepEqual(page.errors, []);
      await page.context().close();
    }
  });

  it('warns and hides the bar when the current page is not in the list', async () => {
    const page = await open(browser, prevNext({ n: 5, current: -1 }), { script });
    const s = await bar(page);
    assert.equal(s.hidden, true);
    assert.equal(page.warnings.length, 1);
    assert.match(page.warnings[0], /^\[yx\] prevnext/);
    await page.context().close();
  });

  it('warns and hides the bar without a list', async () => {
    const html = prevNext({ n: 5 }).replaceAll('data-yx-prevnext-list', 'data-x');
    const page = await open(browser, html, { script });
    assert.equal((await bar(page)).hidden, true);
    assert.equal(page.warnings.length, 1);
    await page.context().close();
  });

  it('waits for Finsweet to load the rest of the list, then points at the real neighbours', async () => {
    const page = await open(browser, prevNext({ n: 3, current: -1, loadMore: true }), { script });
    // Background loading appends the remaining items, the current one among them.
    await page.evaluate(() => {
      const list = document.querySelector('[data-yx-prevnext-list]');
      for (let i = 4; i <= 6; i += 1) {
        const item = list.children[0].cloneNode(true);
        const link = item.querySelector('a');
        link.setAttribute('href', `/item-${i}`);
        link.classList.toggle('w--current', i === 5);
        item.querySelector('[data-yx-prevnext-title]').textContent = ` Item title ${i} `;
        setTimeout(() => list.append(item), 50 * i);
      }
    });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-yx-prevnext-link="next"]').getAttribute('href') === '/item-6'
    );
    const s = await bar(page);
    assert.equal(s.prev.href, '/item-4');
    assert.equal(s.hidden, false);
    assert.deepEqual(page.warnings, []);
    await page.context().close();
  });

  it('is idempotent', async () => {
    const page = await open(browser, prevNext({ n: 5, current: 2 }), { script });
    const before = await page.content();
    await restart(page);
    assert.equal(await page.content(), before);
    await page.context().close();
  });

  it('does nothing without the attribute', async () => {
    const page = await open(browser, '<p>nothing here</p>', { script });
    assert.deepEqual(page.warnings, []);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
});
