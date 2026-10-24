import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { DIFF_THRESHOLD } from './config.mjs';

const read = (p) => PNG.sync.read(fs.readFileSync(p));

function crop(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    png.data.copy(out.data, y * w * 4, y * png.width * 4, y * png.width * 4 + w * 4);
  }
  return out;
}

/**
 * Pixel diff of two screenshots. If sizes differ, the overlapping top-left area is compared
 * and the size deltas are reported (a / b are the two images' sizes in device px).
 */
export function diffImages(refPath, curPath, outPath) {
  const a = read(refPath);
  const b = read(curPath);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const A = crop(a, w, h);
  const B = crop(b, w, h);
  const out = new PNG({ width: w, height: h });
  const mismatched = pixelmatch(A.data, B.data, out.data, w, h, { threshold: DIFF_THRESHOLD });
  const result = {
    ref: { w: a.width, h: a.height },
    cur: { w: b.width, h: b.height },
    compared: { w, h },
    heightDelta: b.height - a.height,
    widthDelta: b.width - a.width,
    mismatched,
    mismatchPct: +((mismatched / (w * h)) * 100).toFixed(3),
    diffPath: null,
  };
  if (mismatched > 0 && outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, PNG.sync.write(out));
    result.diffPath = outPath;
  }
  return result;
}

/** Small base64 PNG preview (top of the page) so the HTML report is self-contained. */
export function thumbnail(pngPath, maxW = 150, maxH = 240) {
  const src = read(pngPath);
  const scale = Math.max(1, src.width / maxW);
  const ow = Math.max(1, Math.round(src.width / scale));
  const oh = Math.min(maxH, Math.max(1, Math.round(src.height / scale)));
  const out = new PNG({ width: ow, height: oh });
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const x0 = Math.floor(x * scale), x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor((x + 1) * scale)));
      const y0 = Math.floor(y * scale), y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor((y + 1) * scale)));
      let r = 0, g = 0, bl = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i]; g += src.data[i + 1]; bl += src.data[i + 2]; n++;
        }
      }
      const o = (y * ow + x) * 4;
      out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = bl / n; out.data[o + 3] = 255;
    }
  }
  return 'data:image/png;base64,' + PNG.sync.write(out, { colorType: 2, inputHasAlpha: false, deflateLevel: 9 }).toString('base64');
}
