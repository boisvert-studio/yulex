import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { video } from './fixtures.mjs';
import { bundle, launch, open, restart } from './harness.mjs';

let browser;
let script;
before(async () => {
  [browser, script] = [await launch(), await bundle()];
});
after(() => browser.close());

/** Open the fixture while recording every request host, and block YouTube so nothing real loads. */
const openVideo = async (html) => {
  const page = await open(browser, html, { script, start: false });
  page.hosts = [];
  await page.route('**/*', (route) => {
    const { host } = new URL(route.request().url());
    page.hosts.push(host);
    return host.includes('youtube') || host.includes('ytimg')
      ? route.fulfill({ status: 204, body: '' })
      : route.continue();
  });
  await page.addScriptTag({ content: script });
  return page;
};

describe('video', () => {
  it('shows a labelled play button and requests nothing from youtube.com before a click', async () => {
    const page = await openVideo(video());
    const state = await page.evaluate(() => {
      const root = document.querySelector('[data-yx-video]');
      const button = root.querySelector('button.yx-video_play');
      return {
        ready: root.getAttribute('data-yx-ready'),
        label: button?.getAttribute('aria-label'),
        thumb: button?.querySelector('img')?.getAttribute('src'),
        iframes: document.querySelectorAll('iframe').length,
        links: root.querySelectorAll('a').length,
      };
    });
    assert.deepEqual(state, {
      ready: 'true',
      label: 'Voir la vidéo sur YouTube',
      thumb: 'https://i.ytimg.com/vi/9sfH0e-2iuo/hqdefault.jpg',
      iframes: 0,
      links: 0,
    });
    assert.ok(
      !page.hosts.some((h) => h.endsWith('youtube.com') || h.endsWith('youtube-nocookie.com'))
    );
    assert.deepEqual(page.warnings, []);
    await page.context().close();
  });

  it('loads the youtube-nocookie player on click', async () => {
    const page = await openVideo(video());
    await page.click('button.yx-video_play');
    const src = await page.getAttribute('[data-yx-video] iframe', 'src');
    assert.equal(src, 'https://www.youtube-nocookie.com/embed/9sfH0e-2iuo?autoplay=1&rel=0');
    assert.equal(
      await page.getAttribute('[data-yx-video] iframe', 'title'),
      'Voir la vidéo sur YouTube'
    );
    await page.context().close();
  });

  it('reads watch, embed and shorts URLs', async () => {
    for (const url of [
      'https://www.youtube.com/watch?v=9sfH0e-2iuo&t=10',
      'https://www.youtube.com/embed/9sfH0e-2iuo',
      'https://youtube.com/shorts/9sfH0e-2iuo',
    ]) {
      const page = await openVideo(video({ url }));
      assert.equal(
        await page.getAttribute('button.yx-video_play img', 'src'),
        'https://i.ytimg.com/vi/9sfH0e-2iuo/hqdefault.jpg'
      );
      await page.context().close();
    }
  });

  it('keeps the fallback link and warns when the URL is not YouTube', async () => {
    const page = await openVideo(video({ url: 'https://vimeo.com/123' }));
    assert.equal(await page.locator('[data-yx-video] a').count(), 1);
    assert.equal(page.warnings.length, 1);
    assert.match(page.warnings[0], /^\[yx\] data-yx-video/);
    await page.context().close();
  });

  it('does nothing on a second start', async () => {
    const page = await openVideo(video());
    await restart(page);
    assert.equal(await page.locator('button.yx-video_play').count(), 1);
    assert.equal(await page.locator('#yx-video-style').count(), 1);
    await page.context().close();
  });
});
