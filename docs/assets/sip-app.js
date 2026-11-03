// Sip-Stack dual view router: World (isometric grid) <-> Outline (Mermaid charts).
// Deep links: #world  #world/03  #outline  #outline/03  (legacy #world-03, #outline-03, #chart-03 also work)
import { sceneSVG, ICONS } from './sip-world.js';

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
}

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

/* ---- Mermaid (lazy, per visible panel) ---- */
let mermaidP = null;
function getMermaid() {
  mermaidP ??= import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs').then(({ default: m }) => {
    m.initialize({
      startOnLoad: false, theme: 'base', securityLevel: 'strict',
      themeVariables: {
        primaryColor: '#fbf5ea', primaryTextColor: '#2a221d', primaryBorderColor: '#3a312b',
        lineColor: '#914C2C', secondaryColor: '#EDD4A8', tertiaryColor: '#D8E6DA',
        fontFamily: 'Inter, Segoe UI, system-ui, sans-serif', fontSize: '14px',
      },
      flowchart: { curve: 'basis', htmlLabels: true },
    });
    return m;
  });
  return mermaidP;
}
async function renderPanel(panel) {
  const nodes = $$('pre.mermaid:not([data-processed])', panel);
  if (!nodes.length) return;
  try { await (await getMermaid()).run({ nodes }); }
  catch (e) {
    // Keep the original journey readable if the diagram CDN is unavailable.
    nodes.forEach(node => { node.style.color = 'var(--ink)'; });
    console.warn('Mermaid failed', e);
  }
}

/* ---- view switching ---- */
const seg = $('.seg');
function setMode(mode) {
  seg.dataset.mode = mode;
  $$('.seg button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#world').classList.toggle('active', mode === 'world');
  $('#outline').classList.toggle('active', mode === 'outline');
  document.body.dataset.mode = mode;
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
  document.title = 'Sip-Stack · Nine ways water becomes a drink';
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
  const wasOutline = document.body.dataset.mode === 'outline';
  showWorld(wasOutline && h === 'world' ? lastOutline : null);
}
addEventListener('hashchange', route);

$$('.seg button').forEach(b => b.addEventListener('click', () => {
  location.hash = b.dataset.mode === 'world' ? `world/${lastOutline}` : `outline/${lastOutline}`;
  if (b.dataset.mode === 'outline') scrollTo({ top: 0 });
}));
$$('.tab').forEach(t => t.addEventListener('click', () => { location.hash = `outline/${t.dataset.id}`; }));

// camera-style zoom into a card, then open its Outline chart
$$('.card').forEach(card => card.addEventListener('click', e => {
  if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let modified clicks open a new tab
  e.preventDefault();
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
  const cards = $$('.card'), i = cards.indexOf(document.activeElement);
  if (i < 0) return;
  const cols = getComputedStyle($('.grid')).gridTemplateColumns.split(' ').length;
  const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (d && cards[i + d]) { e.preventDefault(); cards[i + d].focus(); }
});

route();
