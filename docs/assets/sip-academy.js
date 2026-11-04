// Sip-Stack · Academy. The live lesson is the Wine adventure, drawn with World scenes.
import { sceneSVG, HOTSPOTS } from './sip-world.js';
import { GUIDES, WINE_STOPS, DIVES } from './sip-depth-data.js';
import { WINE_LESSON, DIVE_BEATS } from './sip-wine-lesson.js';
import { storyMarkup } from './sip-academy-layers.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const KEY = 'sip-stack:academy:v1';

const QUIET = [
  ['Wine', '22 stops. This is the lesson.'],
  ['Beer', 'Coming after the wine scenes are the standard.'],
  ['Spirits', 'Shelled. Pot and column stay a later lesson.'],
  ['Coffee, Tea, Kombucha, Water, Juice, Milk', 'Shelled.'],
  ['Health, Protein, Energy, Carbonated', 'Shelled.'],
  ['Fermented, Regional', 'No adventure list yet.'],
];

function loadProg() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { seen: {} }; }
  catch { return { seen: {} }; }
}
function saveProg(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private */ } }
function markSeen(n) {
  const p = loadProg();
  const set = new Set(p.seen.wine || []);
  set.add(n);
  p.seen.wine = [...set];
  p.last = { campus: 'wine', n };
  saveProg(p);
  return p;
}

function applyState(svg, st) {
  svg.dataset.state = st;
  $$('.st', svg).forEach(g => g.classList.toggle('on', g.dataset.when === st));
}
function applyFocus(svg, z) {
  svg.dataset.focus = z || '';
  $$('.zone', svg).forEach(g => g.classList.toggle('dim', !!z && g.dataset.zone !== z));
}
function applyOpt(svg, k, v) {
  svg.setAttribute(`data-o-${k}`, v);
  $$(`.op[data-k="${k}"]`, svg).forEach(g => g.classList.toggle('on', g.dataset.v === v));
}
function applyFx(svg, fx = {}) {
  if (!svg || !fx) return;
  if (fx.state) applyState(svg, fx.state);
  if (fx.opt) for (const [k, v] of Object.entries(fx.opt)) applyOpt(svg, k, v);
  if ('explode' in fx) svg.classList.toggle('exploded', !!fx.explode);
  if ('focus' in fx) applyFocus(svg, fx.focus);
}

export function mountAcademy(root) {
  root.innerHTML = `<div class="ac-player"></div>`;
  const player = $('.ac-player', root);
  const state = { n: 1, beat: null, dive: null, chart: null };

  function lesson(stop) { return WINE_LESSON[stop.id]; }
  function activeBeat(stop) {
    const pack = lesson(stop);
    if (state.dive && DIVE_BEATS[stop.n]) {
      const tabs = DIVE_BEATS[stop.n].tabs;
      return tabs.find(t => t.id === state.dive) || tabs[0];
    }
    const beats = pack.beats;
    return beats.find(b => b.id === state.beat) || beats[0];
  }

  function renderDoor(which) {
    player.innerHTML = `
      <div class="ac-door">
        <p class="eyebrow">Academy</p>
        <h2>Wine is the lesson.</h2>
        <p>The other campuses stay on the shelf. Beer is next only after this wine path feels like the World scenes.</p>
        <button type="button" data-wine>Open wine · stop 1</button>
        <ul>${QUIET.map(([name, line]) => `<li><b>${name}.</b> ${line}</li>`).join('')}</ul>
        ${which && which !== 'campuses' && !which.startsWith('guild-') ? `<p class="muted">“${which}” is not a live scene.</p>` : ''}
      </div>`;
  }

  function renderWine() {
    const stop = WINE_STOPS[state.n - 1];
    const pack = lesson(stop);
    const beat = activeBeat(stop);
    const guide = GUIDES[stop.guide];
    const diving = !!(state.dive && DIVE_BEATS[stop.n]);
    const divePack = diving ? DIVE_BEATS[stop.n] : null;
    const chart = (diving && beat.chart) || stop.chart;
    markSeen(stop.n);
    const skills = WINE_STOPS.slice(0, stop.n).map(s => WINE_LESSON[s.id].skill);
    const learn = beat.learn || (diving ? beat.why : pack.learn);
    if (state.chart !== chart) state.chart = chart;

    player.innerHTML = `
      <div class="ac-playhead">
        <button type="button" class="ac-back" data-door>Other campuses</button>
        <div class="ac-stopn"><b>Stop ${stop.n} of 22</b><span>${stop.title}</span></div>
        <div class="ac-nav">
          <button type="button" data-dir="-1" ${stop.n <= 1 ? 'disabled' : ''}>Previous</button>
          <button type="button" data-dir="1" ${stop.n >= 22 ? 'disabled' : ''}>Next</button>
        </div>
      </div>
      <p class="ac-learn"><b>You are learning:</b> ${learn.replace(/^You are learning:?\s*/i, '')}</p>
      <div class="ac-stage-wrap">
        <div class="ac-stage" data-chart="${chart}" data-dive="${diving ? '1' : '0'}" data-beat="${beat.id}">
          <div class="ac-scene-slot"></div>
          <div class="ac-beats" role="group" aria-label="${diving ? 'Deep dive checks' : 'Scene changes'}">
            ${(diving ? divePack.tabs : pack.beats).map(item => `<button type="button" data-beat="${item.id}" aria-pressed="${item.id === beat.id}">${item.label}</button>`).join('')}
          </div>
        </div>
        <aside class="ac-note sip-note">
          <p class="k">${stop.guide} · ${guide.role}${diving ? ' · deep dive' : ''}</p>
          <h3>${diving ? divePack.title : stop.title}</h3>
          <p class="ac-story">${diving ? divePack.lede : pack.story}</p>
          ${beat.body ? `<p>${beat.body}</p>` : ''}
          <p class="act"><b>What changed</b> ${beat.changed}</p>
          <p class="why"><b>Why it matters</b> ${beat.why}</p>
          <div class="row">
            <a href="#world/${stop.chart}/arc-${stop.id}">World ${stop.chart} →</a>
            <a href="#outline/${stop.chart}/${stop.id}">Outline →</a>
            ${stop.dive ? `<button type="button" data-dive="${diving ? 'off' : 'on'}">${diving ? 'Close deep dive' : 'Deep dive'}</button>` : ''}
          </div>
        </aside>
      </div>
      <div class="ac-sofar">
        <p><b>So far you can</b></p>
        <ol>${skills.map(s => `<li>${s}</li>`).join('')}</ol>
      </div>
      <ol class="ac-rail">${WINE_STOPS.map(s => `<li><button type="button" data-n="${s.n}" aria-current="${s.n === stop.n}"><b>${s.n}</b>${s.title}</button></li>`).join('')}</ol>`;

    const slot = $('.ac-scene-slot', player);
    slot.innerHTML = sceneSVG(chart, { title: stop.title });
    const svg = $('svg.scene', slot);
    applyFx(svg, beat.fx);
    svg.insertAdjacentHTML('beforeend', storyMarkup(stop.id, beat.id, diving));
    if (beat.pin) $(`.tag[data-hs="${beat.pin}"]`, svg)?.classList.add('active');
    player.querySelector(`[data-n="${stop.n}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function show(id, n) {
    if (!id || id === 'wine') {
      const next = n || (loadProg().last?.campus === 'wine' ? loadProg().last.n : 1);
      if (state.n !== next) { state.beat = null; state.dive = null; }
      state.n = Math.min(22, Math.max(1, next));
      renderWine();
      return;
    }
    renderDoor(id);
  }

  player.addEventListener('click', e => {
    if (e.target.closest('[data-door]')) { location.hash = 'academy/campuses'; return; }
    if (e.target.closest('[data-wine]')) { location.hash = 'academy/wine/1'; return; }
    const dir = e.target.closest('[data-dir]');
    if (dir && !dir.disabled) {
      location.hash = `academy/wine/${state.n + Number(dir.dataset.dir)}`;
      return;
    }
    const jump = e.target.closest('[data-n]');
    if (jump) { location.hash = `academy/wine/${jump.dataset.n}`; return; }
    const beatBtn = e.target.closest('[data-beat]');
    if (beatBtn) {
      if (state.dive) state.dive = beatBtn.dataset.beat;
      else state.beat = beatBtn.dataset.beat;
      renderWine();
      return;
    }
    const diveBtn = e.target.closest('[data-dive]');
    if (diveBtn) {
      state.dive = diveBtn.dataset.dive === 'on' ? (DIVE_BEATS[state.n]?.tabs[0].id || null) : null;
      renderWine();
      return;
    }
    const tag = e.target.closest('svg.scene .tag');
    if (tag) {
      const key = tag.dataset.hs;
      const stop = WINE_STOPS[state.n - 1];
      const pack = state.dive ? DIVE_BEATS[stop.n] : lesson(stop);
      const beats = state.dive ? pack.tabs : pack.beats;
      const hit = beats.find(item => item.pin === key);
      if (hit) {
        if (state.dive) state.dive = hit.id; else state.beat = hit.id;
        renderWine();
        return;
      }
      const note = HOTSPOTS[state.chart]?.[key];
      if (!note) return;
      const svg = tag.closest('svg.scene');
      if (note.state) applyState(svg, note.state);
      if (note.opt) Object.entries(note.opt).forEach(([k, v]) => applyOpt(svg, k, v));
      if (note.explode === 'open') svg.classList.add('exploded');
      else if (note.explode) svg.classList.toggle('exploded');
      if (note.focus) applyFocus(svg, svg.dataset.focus === note.focus ? '' : note.focus);
      $$('.tag.active', svg).forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      const learn = $('.ac-learn', player);
      const why = $('.why', player);
      const act = $('.act', player);
      if (learn) learn.innerHTML = `<b>You are learning:</b> ${note.t}. ${note.b}`;
      if (act) act.innerHTML = `<b>What changed</b> The scene moved to ${note.t}.`;
      if (why) why.innerHTML = `<b>Why it matters</b> ${note.b}`;
    }
  });

  document.addEventListener('keydown', e => {
    if (document.body.dataset.mode !== 'academy') return;
    if (e.target.closest('input, textarea, select')) return;
    if (document.body.classList.contains('dive-open')) return;
    if (e.key === 'ArrowRight') { const b = $('[data-dir="1"]', player); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
    else if (e.key === 'ArrowLeft') { const b = $('[data-dir="-1"]', player); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
  });

  return { show, get state() { return state; } };
}

export { DIVES };
