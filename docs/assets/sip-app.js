// Sip-Stack view router: World (isometric grid) <-> Outline (Mermaid charts) <-> Village (3D diorama, lazy).
// Deep links: #world  #world/03  #outline  #outline/03  (legacy #world-03, #outline-03, #chart-03 also work)
import { sceneSVG, ICONS, HOTSPOTS } from './sip-world.js';

const IDS = ['01', '02', '03', '04', '05', '06', '07', '08', '09'];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const titleOf = id => $(`.card[data-id="${id}"] h3`)?.textContent || `Chart ${id}`;

/* ---- paint World scenes + icons ---- */
for (const card of $$('.card')) {
  const id = card.dataset.id;
  $('.scene-slot', card).outerHTML = sceneSVG(id, { title: `Isometric scene: ${titleOf(id)}` });
  $('.card-icon', card).innerHTML = ICONS[id];
  const n = $$('.scene .tag', card).length;
  if (n) $('.card-icon', card).insertAdjacentHTML('beforebegin', `<span class="hs-hint" title="Tap a numbered pin or a place in the scene">${n} pins · tap to explore</span>`);
}
if (reduced) $$('svg.scene').forEach(s => s.pauseAnimations?.());

/* ---- World pins: teach in place (state changes, focus, unfolding layers) ---- */
const STATE_NAMES = { wet: 'drip on', dry: 'drip off', ripe: 'ripe fruit', early: 'early pick', cork: 'cork', screw: 'screwcap', water: 'water poured', wine: 'wine poured' };
const applyState = (svg, st) => { svg.dataset.state = st; $$('.st', svg).forEach(g => g.classList.toggle('on', g.dataset.when === st)); };
const applyFocus = (svg, z) => { svg.dataset.focus = z || ''; $$('.zone', svg).forEach(g => g.classList.toggle('dim', !!z && g.dataset.zone !== z)); };
function closePop(card) {
  $('.hs-pop', card)?.remove();
  card.classList.remove('has-pop');
  $$('.tag.active', card).forEach(t => t.classList.remove('active'));
}
function openPin(card, el) {
  const id = card.dataset.id, key = el.dataset.hs, note = HOTSPOTS[id]?.[key];
  if (!note) return;
  const svg = el.closest('svg.scene');
  const reopen = card.dataset.pin === key && $('.hs-pop', card);
  let act = '';
  if (note.cycle) {
    const next = reopen || !note.cycle.includes(svg.dataset.state) ? note.cycle[(note.cycle.indexOf(svg.dataset.state) + 1) % note.cycle.length] : svg.dataset.state;
    applyState(svg, next); act = `Showing: ${STATE_NAMES[next] || next} · tap again`;
  } else if (note.state) applyState(svg, note.state);
  if (note.explode === 'open') svg.classList.add('exploded');
  else if (note.explode) svg.classList.toggle('exploded', !(reopen && svg.classList.contains('exploded')));
  if (note.explode) act ||= svg.classList.contains('exploded') ? 'Layers unfolded' : 'Layers folded';
  if (note.focus) { const off = reopen && svg.dataset.focus === note.focus; applyFocus(svg, off ? '' : note.focus); act ||= off ? 'Focus cleared' : 'Focused · tap again to clear'; }
  closePop(card);
  card.dataset.pin = key;
  const tagEl = el.classList.contains('tag') ? el : $(`.tag[data-hs="${key}"]`, svg);
  tagEl?.classList.add('active');
  const pin = tagEl ? $('.pin', tagEl) : el;
  const pinN = tagEl ? $('.pn', tagEl).textContent : '';
  const pop = document.createElement('div');
  pop.className = 'hs-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', note.t);
  pop.innerHTML = `<button class="x" type="button" aria-label="Close note">×</button><div class="k">${id} / 09${pinN ? ` · pin ${pinN}` : ''}</div><h4>${note.t}</h4><p>${note.b}</p>` +
    `<div class="row"><span class="act">${act || 'Tap another pin or place'}</span><a class="to-outline" href="#outline/${id}">Outline chart →</a></div>`;
  card.append(pop); card.classList.add('has-pop');
  const place = () => {
    const cr = card.getBoundingClientRect(), r = pin.getBoundingClientRect();
    const left = Math.max(6, Math.min(r.left - cr.left + r.width / 2 - pop.offsetWidth / 2, cr.width - pop.offsetWidth - 6));
    // dock the note under the scene so the change it teaches (focus, unfold, pour) stays in view
    const top = svg.getBoundingClientRect().bottom - cr.top - 18;
    pop.style.left = `${left}px`; pop.style.top = `${top}px`;
  };
  place();
  if (note.explode && !reduced) setTimeout(place, 760);
}
document.addEventListener('click', e => {
  if (!e.target.closest('.card')) $$('.card.has-pop').forEach(closePop);
});

/* ---- Outline: bridge bar + pager per panel ---- */
for (const panel of $$('.panel')) {
  const id = panel.dataset.id, i = IDS.indexOf(id);
  const give = $(`.card[data-id="${id}"] .give-chip`)?.textContent || '';
  const bar = document.createElement('div');
  bar.className = 'bridgebar';
  bar.innerHTML = sceneSVG(id, { labels: false, title: `World panel ${id}` }) +
    `<div class="bb-meta"><b>${Number(id)} / 9 · World panel</b><br>Give-Back · ${give}</div>` +
    `<a class="btn-world" href="#world/${id}" aria-label="Open chart ${id} in World view">` +
    `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>Open in World</a>`;
  const h2 = $('h2', panel);
  h2.after(bar);
  const prev = IDS[i - 1], next = IDS[i + 1];
  const pager = document.createElement('nav');
  pager.className = 'pager';
  pager.setAttribute('aria-label', 'Chart pager');
  pager.innerHTML = (prev ? `<a href="#outline/${prev}">← ${prev} · ${titleOf(prev)}</a>` : '<span></span>') +
    (next ? `<a href="#outline/${next}">${next} · ${titleOf(next)} →</a>` : `<a href="#world">Back to the World map ↺</a>`);
  panel.append(pager);
}

/* ---- Mermaid (lazy, per visible panel) ----
   Readability rules: charts always flow top-to-bottom (long LR chains shrink to unreadable
   text), render at natural size (no shrink-to-fit), 16px+ labels, generous spacing.
   Narrow screens get tighter label wrapping; anything still wider than the card scrolls
   sideways with a visible "swipe" hint instead of being scaled down. */
const narrowMQ = matchMedia('(max-width: 640px)');
let mermaidP = null, mermaidNarrow = null;
function mermaidConfig(narrow) {
  return {
    startOnLoad: false, theme: 'base', securityLevel: 'strict',
    themeVariables: {
      primaryColor: '#fffaf1', primaryTextColor: '#1f1914', primaryBorderColor: '#2f2721',
      lineColor: '#7a3d22', secondaryColor: '#EDD4A8', tertiaryColor: '#D8E6DA',
      edgeLabelBackground: '#f3e6cc', textColor: '#1f1914',
      fontFamily: 'Inter, Segoe UI, system-ui, sans-serif', fontSize: narrow ? '15px' : '17px',
    },
    flowchart: {
      curve: 'basis', htmlLabels: true, useMaxWidth: false,
      nodeSpacing: narrow ? 10 : 46, rankSpacing: narrow ? 38 : 54, padding: narrow ? 8 : 16,
      wrappingWidth: narrow ? 86 : 280, diagramPadding: narrow ? 2 : 8,
    },
  };
}
function getMermaid() {
  mermaidP ??= import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs').then(({ default: m }) => m);
  return mermaidP.then(m => {
    if (mermaidNarrow !== narrowMQ.matches) { mermaidNarrow = narrowMQ.matches; m.initialize(mermaidConfig(mermaidNarrow)); }
    return m;
  });
}
// break long edge labels onto two lines on phones so side-by-side lanes stay narrow
const wrapEdge = t => {
  if (t.length < 14) return t;
  const w = t.split(' '), half = t.length / 2;
  let n = 0, i = 0;
  while (i < w.length - 1 && n + w[i].length < half) n += w[i++].length + 1;
  return i ? `${w.slice(0, i).join(' ')}<br>${w.slice(i).join(' ')}` : t;
};
const NARROW_STEPS = [[210, 24], [130, 16], [86, 10]];
const prepSource = (src, narrow, step = 0) => {
  let out = src.replace(/^(\s*(?:flowchart|graph))\s+(LR|RL)\b/, '$1 TD');
  if (!narrow) return out;
  out = out.replace(/\|"([^"|]+)"\|/g, (_, t) => `|"${wrapEdge(t)}"|`);
  // phones: start with roomy boxes; renderPanel steps down to tighter wrapping only if it won't fit
  const [ww, ns] = NARROW_STEPS[step];
  return `%%{init: {"flowchart": {"wrappingWidth": ${ww}, "nodeSpacing": ${ns}}}}%%\n` + out;
};
// Natural size first. If a chart is only slightly wider than the card (>= 92% fits),
// shrink it to fit (labels stay ~14px). Otherwise keep full size and show a swipe hint.
function markOverflow(wrap) {
  const svg = $('svg', wrap);
  if (!svg) return;
  const natural = svg.dataset.w ??= String(svg.getBoundingClientRect().width);
  const avail = wrap.clientWidth - parseFloat(getComputedStyle(wrap).paddingLeft) - parseFloat(getComputedStyle(wrap).paddingRight);
  const scale = avail / Number(natural);
  svg.style.marginInline = 'auto';
  svg.style.width = scale < 1 && scale >= 0.92 ? `${avail}px` : '';
  wrap.classList.toggle('scrolls', scale < 0.92);
}
const rendering = new WeakMap();
function renderPanel(panel, force = false) {
  const prev = rendering.get(panel) || Promise.resolve();
  const job = prev.then(() => renderPanelNow(panel, force));
  rendering.set(panel, job.catch(() => {}));
  return job;
}
async function renderPanelNow(panel, force) {
  const pres = $$('pre.mermaid', panel);
  const narrow = narrowMQ.matches;
  panel.dataset.mmNarrow = String(narrow);
  for (const pre of pres) {
    pre.dataset.src ??= pre.textContent;
    if (pre.dataset.processed && !force) continue;
    const wrap = pre.closest('.mermaid-wrap');
    for (let step = 0; step < (narrow ? NARROW_STEPS.length : 1); step++) {
      pre.removeAttribute('data-processed');
      pre.textContent = prepSource(pre.dataset.src, narrow, step);
      try { await (await getMermaid()).run({ nodes: [pre] }); } catch (e) { console.warn('Mermaid failed', e); break; }
      const svg = $('svg', pre);
      if (!narrow || !svg || svg.getBoundingClientRect().width * 0.92 <= wrap.clientWidth) break;
    }
    markOverflow(wrap);
  }
}
// re-render the visible chart when crossing the phone breakpoint (rotation, resize)
narrowMQ.addEventListener('change', () => {
  const active = $('.panel.active');
  if (active) renderPanel(active, true);
  $$('.panel:not(.active) pre.mermaid[data-processed]').forEach(pre => { pre.removeAttribute('data-processed'); pre.textContent = pre.dataset.src; });
});
addEventListener('resize', () => $$('.panel.active .mermaid-wrap').forEach(markOverflow));

/* ---- view switching ---- */
const seg = $('.seg');
function setMode(mode) {
  seg.dataset.mode = mode;
  $$('.seg button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#world').classList.toggle('active', mode === 'world');
  $('#outline').classList.toggle('active', mode === 'outline');
  $('#village').classList.toggle('active', mode === 'village');
  document.body.dataset.mode = mode;
  if (mode !== 'village') village?.hide();
}
/* ---- Village: Three.js loads only the first time this tab opens ---- */
let village = null, villageP = null;
function showVillage(pin) {
  setMode('village');
  document.title = 'Village · Sip-Stack · wine-coast diorama';
  villageP ??= import('./sip-village.js').then(m => (village = m.mountVillage($('#village'), {
    onPin: id => history.replaceState(null, '', id ? `#village/${id}` : '#village'),
  }))).catch(err => {
    console.warn('Village failed to load', err);
    $('#village .vl-loading').textContent = 'The 3D village could not load. Check your connection and refresh.';
    villageP = null;
  });
  villageP.then(v => { if (v && document.body.dataset.mode === 'village') v.show(pin); });
}
let lastOutline = '01';
function showOutline(id) {
  lastOutline = id;
  setMode('outline');
  $$('.tab').forEach(t => { const on = t.dataset.id === id; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
  $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.id === id));
  $(`.tab[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  renderPanel($(`#chart-${id}`));
  document.title = `${id} · ${titleOf(id)} · Sip-Stack Outline`;
}
function showWorld(id) {
  const canvas = $('.canvas');
  canvas.classList.remove('zooming'); canvas.style.transform = ''; canvas.style.transformOrigin = '';
  setMode('world');
  document.title = 'Sip-Stack · Nine ways water becomes wine';
  if (id) {
    const card = $(`.card[data-id="${id}"]`);
    requestAnimationFrame(() => {
      card.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      card.classList.remove('spotlight'); void card.offsetWidth; card.classList.add('spotlight');
      card.focus({ preventScroll: true });
    });
  }
}
function route() {
  const h = location.hash.slice(1);
  let m;
  if ((m = h.match(/^(?:outline|chart)[-/](0[1-9])$/))) return showOutline(m[1]);
  if (h === 'outline') return showOutline(lastOutline);
  if ((m = h.match(/^world[-/](0[1-9])$/))) return showWorld(m[1]);
  if ((m = h.match(/^village(?:\/([a-z-]+))?$/))) return showVillage(m[1]);
  const wasOutline = document.body.dataset.mode === 'outline';
  showWorld(wasOutline && h === 'world' ? lastOutline : null);
}
addEventListener('hashchange', route);

$$('.seg button').forEach(b => b.addEventListener('click', () => {
  const mode = b.dataset.mode;
  location.hash = mode === 'village' ? 'village' : mode === 'world' ? `world/${lastOutline}` : `outline/${lastOutline}`;
  if (mode !== 'world') scrollTo({ top: 0 });
}));
$$('.tab').forEach(t => t.addEventListener('click', () => { location.hash = `outline/${t.dataset.id}`; }));

// camera-style zoom into a card, then open its Outline chart
$$('.card').forEach(card => card.addEventListener('click', e => {
  if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let modified clicks open a new tab
  e.preventDefault();
  const pop = e.target.closest('.hs-pop');
  if (pop) { // clicks inside a note never zoom away, except its own Outline link
    if (e.target.closest('.x')) closePop(card);
    if (!e.target.closest('.to-outline')) return;
  } else {
    const hs = e.target.closest('svg.scene .hs');
    if (hs) return openPin(card, hs);
  }
  const id = card.dataset.id, canvas = $('.canvas');
  const go = () => { location.hash = `outline/${id}`; scrollTo({ top: 0 }); };
  if (reduced) return go();
  const cr = canvas.getBoundingClientRect(), r = card.getBoundingClientRect();
  canvas.style.transformOrigin = `${r.left - cr.left + r.width / 2}px ${r.top - cr.top + r.height / 2}px`;
  canvas.style.transform = 'scale(2.4)';
  canvas.classList.add('zooming');
  setTimeout(go, 420);
}));

// keyboard: arrow keys move between cards in World
$('.grid').addEventListener('keydown', e => {
  const t = document.activeElement;
  if (t?.classList?.contains('tag') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); return openPin(t.closest('.card'), t); }
  if (e.key === 'Escape') { const c = t?.closest?.('.card'); if (c) { closePop(c); c.focus(); } return; }
  const cards = $$('.card'), i = cards.indexOf(document.activeElement);
  if (i < 0) return;
  const cols = getComputedStyle($('.grid')).gridTemplateColumns.split(' ').length;
  const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (d && cards[i + d]) { e.preventDefault(); cards[i + d].focus(); }
});

route();
