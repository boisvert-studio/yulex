import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { date } from './fixtures.mjs';
import { bundle, launch, open, restart } from './harness.mjs';

let browser;
let script;
before(async () => {
  [browser, script] = [await launch(), await bundle()];
});
after(() => browser.close());

const read = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-yx-date]');
    return { text: el.textContent, ready: el.getAttribute('data-yx-ready') };
  });

describe('dates', () => {
  it('prints French month names on a French page', async () => {
    const page = await open(browser, date({ lang: 'fr-CA', text: 'October 22, 2021' }), { script });
    assert.deepEqual(await read(page), { text: '22 octobre 2021', ready: 'true' });
    assert.deepEqual(page.warnings, []);
    await page.context().close();
  });

  it('covers every month, including the ones that differ most (February, August, December)', async () => {
    const expected = {
      January: 'janvier',
      February: 'février',
      March: 'mars',
      April: 'avril',
      May: 'mai',
      June: 'juin',
      July: 'juillet',
      August: 'août',
      September: 'septembre',
      October: 'octobre',
      November: 'novembre',
      December: 'décembre',
    };
    for (const [english, french] of Object.entries(expected)) {
      const page = await open(browser, date({ text: `${english} 5, 2020` }), { script });
      assert.equal((await read(page)).text, `5 ${french} 2020`);
      await page.context().close();
    }
  });

  it('keeps Webflow\'s text on an English page', async () => {
    const page = await open(browser, date({ lang: 'en-CA', text: 'October 22, 2021' }), { script });
    assert.deepEqual(await read(page), { text: 'October 22, 2021', ready: 'true' });
    await page.context().close();
  });

  it('warns and leaves a date it cannot read', async () => {
    const page = await open(browser, date({ text: '2021-10-22' }), { script });
    assert.deepEqual(await read(page), { text: '2021-10-22', ready: null });
    assert.equal(page.warnings.length, 1);
    assert.match(page.warnings[0], /^\[yx\] data-yx-date/);
    await page.context().close();
  });

  it('is idempotent on a second start', async () => {
    const page = await open(browser, date(), { script });
    await restart(page);
    assert.equal((await read(page)).text, '22 octobre 2021');
    assert.deepEqual(page.warnings, []);
    await page.context().close();
  });
});
