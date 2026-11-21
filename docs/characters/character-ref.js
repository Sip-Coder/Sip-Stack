// A sheet is a collection of photographs of the current models. The simulator
// owns the only WebGL renderer. Each tile keeps its last complete pixels in 2D.
import { names, labels } from './ui.js';
import { sheetFor } from './ref-panels.js';
import { buildRefModel } from './ref-model.js';
import { createRefRenderer } from './ref-renderer.js';

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('./character-ref.css', import.meta.url);
const styled = new Promise((resolve, reject) => {
  stylesheet.onload = resolve;
  stylesheet.onerror = () => reject(new Error('Character Ref stylesheet could not load.'));
});
document.head.append(stylesheet);
styled.catch(() => {
  /* The first visible refresh reports stylesheet failures. */
});

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

export function mountStudy(section, stage, chooseHero) {
  const body = section.querySelector('[data-study-body]');
  section.querySelector('[data-open-study]').hidden = true;
  body.innerHTML = `
    <div class="ref-controls"><label>Character <select data-ref-hero></select></label>
      <div><span data-ref-progress></span><button type="button" data-ref-refresh>Refresh</button></div></div>
    <article class="ref-sheet" aria-label="Live character reference sheet"></article>
    <p class="ref-notice" role="status"></p>`;
  const picker = body.querySelector('[data-ref-hero]'),
    refresh = body.querySelector('[data-ref-refresh]');
  const article = body.querySelector('article'),
    progress = body.querySelector('[data-ref-progress]');
  const notice = body.querySelector('[role=status]');
  names.forEach((n, i) => picker.add(new Option(labels[i], n)));
  picker.onchange = () => chooseHero(picker.value);
  const renderer = createRefRenderer(stage);
  const counts = { submissions: 0, cacheHits: 0, revalidations: 0 };
  const cache = new Map(),
    byteLimit = 24 * 1024 * 1024;
  let bytes = 0,
    hero,
    tier,
    active = false,
    version = 0,
    model,
    rendering,
    loading = false;
  let raf = 0,
    idle = 0,
    cards = [],
    palette,
    refreshRequested = false;
  const retired = new Set();
  function release(old) {
    renderer.releaseModel(old);
    old.dispose();
  }
  function retire(old) {
    if (!old) return;
    if (old === rendering) retired.add(old);
    else release(old);
  }
  const inside = (r) =>
    r.width > 0 &&
    r.height > 0 &&
    r.bottom > 0 &&
    r.top < innerHeight &&
    r.right > 0 &&
    r.left < innerWidth;
  const observers = new Map();
  const intersection = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const card = observers.get(e.target);
      if (card) card.visible = e.isIntersecting;
    }
    schedule();
  });
  const resize = new ResizeObserver((entries) => {
    for (const e of entries) {
      const card = observers.get(e.target);
      if (card && card.width !== Math.round(e.contentRect.width)) {
        card.width = Math.round(e.contentRect.width);
        card.check = true;
      }
    }
    schedule();
  });
  function figure(panel) {
    const fig = element('figure');
    fig.dataset.panel = fig.dataset.refPanel = panel.id;
    if (panel.available === false) {
      fig.dataset.status = 'missing';
      fig.className = 'ref-missing';
      fig.append(element('figcaption', panel.label), element('small', 'Not yet built'));
      return fig;
    }
    const frame = element('div', undefined, 'ref-image');
    const canvas = element('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', labels[names.indexOf(hero)] + ' · ' + panel.label);
    frame.append(canvas);
    const caption = element('figcaption', panel.label);
    fig.dataset.status = 'pending';
    fig.append(frame, caption);
    const card = { panel, fig, frame, canvas, caption, check: true, visible: false };
    cards.push(card);
    observers.set(frame, card);
    intersection.observe(frame);
    resize.observe(frame);
    return fig;
  }
  function layout() {
    intersection.disconnect();
    resize.disconnect();
    cards = [];
    observers.clear();
    const sheet = sheetFor(hero);
    article.replaceChildren();
    const identity = element('header', undefined, 'ref-identity');
    const name = element('h4', sheet.label);
    const portrait = figure(sheet.portrait);
    portrait.className = 'ref-portrait';
    const info = element('div', undefined, 'ref-bio');
    info.append(name, element('p', sheet.profile.role, 'ref-role'));
    const facts = element('dl');
    for (const [k, title] of [
      ['age', 'Age'],
      ['height', 'Height'],
      ['build', 'Build'],
      ['personality', 'Personality'],
    ]) {
      const row = element('div');
      row.append(element('dt', title), element('dd', sheet.profile[k]));
      facts.append(row);
    }
    palette = element('ul', undefined, 'ref-palette');
    palette.setAttribute('aria-label', 'Key material palette');
    info.append(facts, palette);
    identity.append(portrait, info);
    article.append(identity);
    for (const group of sheet.groups) {
      const zone = element('section');
      zone.dataset.refGroup = group.id;
      zone.className = 'ref-group';
      const heading = element('h5', group.title);
      const grid = element('div', undefined, 'ref-grid');
      group.panels.forEach((panel) => grid.append(figure(panel)));
      zone.append(heading, grid);
      article.append(zone);
    }
  }
  function updateProfile() {
    palette.replaceChildren();
    for (const swatch of model.palette) {
      const item = element('li'),
        color = element('i'),
        hex = element('span', swatch.hex);
      color.style.backgroundColor = swatch.hex;
      item.title = (swatch.name ?? swatch.label) + ' · ' + swatch.hex;
      item.append(color, element('b', swatch.name ?? swatch.label), hex);
      palette.append(item);
    }
    for (const c of cards)
      if (c.panel.showTriangles)
        c.caption.textContent = c.panel.label + ' · ' + model.triangles.toLocaleString() + ' tris';
  }
  function report() {
    const painted = cards.filter((c) => c.fig.dataset.status === 'ready').length;
    progress.textContent = loading ? 'Reading model…' : painted + ' / ' + cards.length + ' views';
    return painted;
  }
  function keep(key, pixels) {
    cache.set(key, pixels);
    bytes += pixels.data.byteLength;
    while (bytes > byteLimit && cache.size > 1) {
      const oldest = cache.keys().next().value;
      bytes -= cache.get(oldest).data.byteLength;
      cache.delete(oldest);
    }
  }
  async function failure(error) {
    notice.textContent = 'Could not update the sheet. Use Refresh to retry.';
    if (
      await import('../assets/sip-recover.js')
        .then((m) => m.recover('Character Ref', error, [stylesheet.href]))
        .catch(() => false)
    )
      return;
  }
  function cancel() {
    cancelAnimationFrame(raf);
    if (idle) window.cancelIdleCallback?.(idle);
    raf = idle = 0;
  }
  function schedule() {
    if (
      raf ||
      idle ||
      rendering ||
      loading ||
      !active ||
      document.hidden ||
      !model ||
      !cards.some((c) => c.visible && c.check)
    )
      return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (window.requestIdleCallback) idle = requestIdleCallback(work, { timeout: 180 });
      else work();
    });
  }
  async function work() {
    idle = 0;
    if (!active || !model || loading || rendering || document.hidden) return;
    const card = cards.find((c) => c.visible && c.check && inside(c.frame.getBoundingClientRect()));
    if (!card) return;
    const snap = model,
      id = version;
    const valid = () =>
      active &&
      !document.hidden &&
      snap === model &&
      id === version &&
      card.visible &&
      inside(card.frame.getBoundingClientRect());
    const rect = card.frame.getBoundingClientRect();
    const scale = Math.min(
      window.devicePixelRatio || 1,
      tier === 'high' ? 1.5 : 1.1,
      (tier === 'high' ? 520 : 310) / Math.max(rect.width, rect.height),
    );
    const width = Math.max(1, Math.round(rect.width * scale)),
      height = Math.max(1, Math.round(rect.height * scale));
    rendering = snap;
    try {
      const key = JSON.stringify([
        hero,
        tier,
        card.panel,
        width,
        height,
        snap.signature(card.panel, width, height),
      ]);
      let pixels = cache.get(key);
      if (card.key === key || pixels) {
        counts.cacheHits++;
        if (pixels) {
          cache.delete(key);
          cache.set(key, pixels);
        }
      } else {
        counts.submissions++;
        pixels = await renderer.render(snap, card.panel, width, height, valid);
        if (!pixels || !valid()) return;
        keep(key, pixels);
      }
      if (!valid()) return;
      if (card.key !== key) {
        card.canvas.width = width;
        card.canvas.height = height;
        card.canvas.getContext('2d', { alpha: false }).putImageData(pixels, 0, 0);
      }
      card.key = key;
      card.check = false;
      card.fig.dataset.status = 'ready';
      card.fig.dataset.validated = String(counts.revalidations);
      report();
    } catch (error) {
      if (valid()) {
        card.check = false;
        card.fig.dataset.status = 'error';
        failure(error);
      }
    } finally {
      rendering = null;
      if (retired.delete(snap)) release(snap);
      schedule();
    }
  }
  async function readModel() {
    const id = ++version;
    loading = true;
    refresh.disabled = true;
    report();
    try {
      await styled;
      if (id !== version || !active) return;
      const next = await buildRefModel(hero, tier, () => id === version && active);
      if (id !== version || !active) {
        next.dispose();
        return;
      }
      retire(model);
      model = next;
      updateProfile();
      counts.revalidations++;
      for (const c of cards) c.check = true;
      section.dataset.ready = hero + '-' + tier;
      notice.textContent = refreshRequested ? 'Reference sheet refreshed.' : '';
      refreshRequested = false;
    } catch (error) {
      if (id === version) failure(error);
    } finally {
      if (id === version) {
        loading = false;
        refresh.disabled = false;
        report();
        schedule();
      }
    }
  }
  refresh.onclick = () => {
    if (active) {
      refreshRequested = true;
      readModel();
    }
  };
  function sync(name, quality, visible) {
    const changed = name !== hero || quality !== tier;
    if (!changed && active === visible) return;
    active = visible;
    version++;
    loading = false;
    cancel();
    if (changed) {
      hero = name;
      tier = quality;
      picker.value = name;
      refreshRequested = false;
      retire(model);
      model = null;
      delete section.dataset.ready;
      layout();
      notice.textContent = '';
    }
    // Re-entering the sheet is a fresh read of the same production builder.
    // Finished 2D tiles stay in place until a different signature needs painting.
    if (active) readModel();
  }
  section.characterRef = {
    stats: () => {
      const ready = cards.filter((c) => c.fig.dataset.status === 'ready').length;
      return {
        ...counts,
        hero,
        tier,
        active,
        ready,
        painted: ready,
        pending: cards.length - ready,
        busy: loading || !!rendering,
        draws: renderer.stats.lastDraws,
        renderer: { ...renderer.stats },
        cacheBytes: bytes,
      };
    },
  };
  return { sync };
}
