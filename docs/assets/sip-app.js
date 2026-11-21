// Activate the selected view before requesting any of its scene modules.
const all = selector => document.querySelectorAll(selector);
const seg = document.querySelector('.seg');
const chartStatus = document.querySelector('#chart-status');
let charts, village, villagePromise, dioramaLoad;
let lastOutline = '01';
let navigation = 0;

function setMode(mode) {
  document.body.dataset.mode = seg.dataset.mode = mode;
  for (const view of all('section.view')) view.classList.toggle('active', view.id === mode);
  for (const button of seg.querySelectorAll('[role=tab]')) {
    button.setAttribute('aria-selected', String(button.dataset.mode === mode));
  }
  if (mode !== 'village') village?.hide();
  if (chartStatus) chartStatus.hidden = true;
}

async function loadFailed(label, error, resources, status) {
  if (status) {
    status.hidden = false;
    status.textContent = `Updating ${label}…`;
  }
  const { recover } = await import('./sip-recover.js').catch(() => ({}));
  if (recover && await recover(label, error, resources)) return;
  if (status) status.textContent = `${label} could not load. Refresh to try again.`;
}

function villageStyle(path) {
  const href = new URL(path, import.meta.url).href;
  const existing = Array.from(document.querySelectorAll('link[rel=stylesheet]')).find(link => link.href === href);
  if (existing?.sheet) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = existing || document.createElement('link');
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => {
      link.remove();
      reject(new Error('Could not load ' + href));
    }, { once: true });
    if (!existing) {
      link.rel = 'stylesheet';
      link.href = href;
      document.head.append(link);
    }
  });
}

function prepareDioramas() {
  dioramaLoad ??= Promise.all([
    villageStyle('./sip-craft.css').then(() => import('./sip-craft-loader.js')),
    villageStyle('./sip-creek.css').then(() => import('./sip-creek-loader.js')),
  ]).catch(error => {
    dioramaLoad = undefined;
    if (document.body.dataset.mode === 'village') {
      return loadFailed('Coastal scenes', error, [
        './assets/sip-craft.css', './assets/sip-creek.css',
        './assets/sip-craft-loader.js', './assets/sip-creek-loader.js',
      ], document.querySelector('.craft-status'));
    }
  });
}

async function showVillage(pin, visit) {
  setMode('village');
  document.title = 'Village · Sip-Stack · wine-coast diorama';
  const ready = villagePromise ??= Promise.all([import('./sip-village.js'), villageStyle('../village/controls.css')]);
  prepareDioramas();
  try {
    const [scene] = await ready;
    if (visit !== navigation) return;
    village ??= scene.mountVillage(document.querySelector('#village'), {
      onPin: id => history.replaceState(null, '', id ? `#village/${id}` : '#village'),
    });
    village.show(pin);
  } catch (error) {
    villagePromise = undefined;
    if (visit === navigation) {
      await loadFailed('Village', error, ['./assets/sip-village.js', './village/controls.css'],
        document.querySelector('.vl-loading'));
    }
  }
}

async function showChart(mode, id, pin, visit) {
  setMode(mode);
  try {
    const views = await (charts ??= import('./sip-charts.js'));
    if (visit !== navigation) return;
    if (mode === 'world') views.showWorld(id, pin);
    else views.showOutline(id);
  } catch (error) {
    charts = undefined;
    if (visit === navigation) {
      await loadFailed(mode === 'outline' ? 'Outline' : 'World', error,
        ['./assets/sip-charts.js', './assets/sip-world.js'], chartStatus);
    }
  }
}

function route() {
  const visit = ++navigation;
  const hash = location.hash.slice(1);
  // The character router replaces old bookmarks in place and mounts the actor.
  const debug = !hash && new URLSearchParams(location.search).get('debug');
  if (hash === 'heros' || hash === 'characters' || debug === 'heros' || debug === 'characters') {
    setMode('heros');
    return;
  }
  const place = hash.match(/^village(?:\/([a-z-]+))?$/);
  if (place) return showVillage(place[1], visit);
  const chart = hash.match(/^(?:outline|chart)[-/](0[1-9])(?:\/[a-z0-9-]+)?$/);
  if (chart || hash === 'outline') {
    if (chart) lastOutline = chart[1];
    return showChart('outline', lastOutline, null, visit);
  }
  const world = hash.match(/^world[-/](0[1-9])(?:\/([a-z0-9.-]+))?$/);
  if (world && world[2] && document.body.dataset.mode === 'world' &&
      document.querySelector(`.card[data-id="${world[1]}"]`)?.dataset.pin === world[2]) return;
  const returning = document.body.dataset.mode === 'outline' && hash === 'world';
  return showChart('world', world?.[1] || (returning ? lastOutline : null), world?.[2], visit);
}

for (const button of seg.querySelectorAll('[role=tab]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    location.hash = mode === 'world' || mode === 'outline' ? `${mode}/${lastOutline}` : mode;
    if (mode !== 'world') scrollTo({ top: 0 });
  });
}
for (const button of all('.tab')) {
  button.addEventListener('click', () => { location.hash = `outline/${button.dataset.id}`; });
}
addEventListener('hashchange', route);
route();
