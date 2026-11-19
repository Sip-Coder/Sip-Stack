// GitHub Pages caches every file for ten minutes, so a phone can hold the page
// markup from one deploy and scripts from the next. When a scene fails to
// start, log the real reason, refetch this site's files past the cache, and
// reload once. A second failure within ten minutes is reported, not retried.
const KEY = 'sip-recovered-at';
let pending;
export function recover(label, error, extra = []) {
  console.error(`${label} failed to load:`, error);
  if (pending) return pending;
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch {}
  if (Date.now() - last < 600000) return Promise.resolve(false);
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { return Promise.resolve(false); }
  const urls = new Set([location.href.split('#')[0], ...extra.map(u => new URL(u, location.href).href)]);
  for (const entry of performance.getEntriesByType('resource'))
    if (entry.name.startsWith(location.origin)) urls.add(entry.name);
  pending = Promise.allSettled([...urls].map(url => fetch(url, { cache: 'reload' })))
    .then(() => { location.reload(); return true; });
  return pending;
}
