// Link status checker: HEAD (fallback GET), concurrency <= 4, polite delay, cached per run.
const UA = 'Mozilla/5.0 (compatible; YulexQA/1.0; read-only link check)';
const CONCURRENCY = 4;
const DELAY_MS = 250;
const TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function normalizeHref(abs) {
  try {
    const u = new URL(abs);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

async function request(url, method) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8', 'accept-language': 'fr-CA,fr;q=0.9,en;q=0.8' },
    });
    if (method === 'GET') await res.body?.cancel().catch(() => {});
    return { status: res.status, finalUrl: res.url };
  } finally {
    clearTimeout(timer);
  }
}

async function checkOne(url) {
  let r;
  try {
    r = await request(url, 'HEAD');
    if (r.status >= 400) r = { ...(await request(url, 'GET')), via: 'GET' };
    else r.via = 'HEAD';
  } catch (e) {
    try {
      r = { ...(await request(url, 'GET')), via: 'GET' };
    } catch (e2) {
      r = { status: 0, finalUrl: url, via: 'GET', error: String(e2.cause?.code || e2.name || e2.message) };
    }
  }
  return r;
}

/**
 * @param {Map<string,{foundOn:Set<string>}>} urls  unique url -> metadata
 * @param {Map<string,object>} cache  shared across targets within a run
 */
export async function checkLinks(urls, cache, onProgress = () => {}) {
  const queue = Array.from(urls.keys()).filter((u) => !cache.has(u));
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      cache.set(u, await checkOne(u));
      onProgress(++done, done + queue.length);
      await sleep(DELAY_MS);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}
