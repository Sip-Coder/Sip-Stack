// The shared router runs first. Its fallback releases Village and the two
// dioramas when entering #heros. Keep this fourth view local to the tab.
const panel = document.querySelector('#heros');
const host = document.querySelector('#character-test');
const status = document.querySelector('#character-status');
const tab = document.querySelector('#heros-tab');
const switcher = tab.closest('[role="tablist"]');
let instance;
let loading = false;
let failed = false;

function active() {
  return location.hash === '#heros' && !document.hidden;
}

function loadStyles() {
  return new Promise((resolve, reject) => {
    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = new URL('./characters.css', import.meta.url);
    sheet.onload = resolve;
    sheet.onerror = () => reject(new Error('Character controls stylesheet could not load.'));
    document.head.append(sheet);
  });
}

let styles;
async function syncScene() {
  if (instance) {
    instance.setVisible(active());
    return;
  }
  if (!active() || loading || failed) return;
  loading = true;
  try {
    styles ??= loadStyles();
    const [{ mountCharacters }] = await Promise.all([import('./main.js'), styles]);
    if (active()) {
      instance = await mountCharacters(host);
      instance.setVisible(active());
      status.hidden = true;
    }
  } catch (error) {
    failed = true;
    status.hidden = false;
    status.textContent = 'Updating Heros…';
    // recover() also reloads every same-origin dependency in Resource Timing,
    // including nested imports and failed requests from an earlier deployment.
    try {
      const { recover } = await import('../assets/sip-recover.js');
      const assets = ['./characters/route.js', './characters/main.js', './characters/characters.css'];
      if (await recover('Heros', error, assets)) return;
    } catch {
      // A network outage may also make the shared recovery module unavailable.
    }
    status.textContent = 'Heros could not load. Refresh the page to try again.';
  } finally {
    loading = false;
  }
}

function route() {
  const url = new URL(location.href);
  for (const key of ['debug', 'review']) {
    if (url.searchParams.get(key) === 'characters') url.searchParams.set(key, 'heros');
  }
  if (url.hash === '#characters' || (!url.hash && url.searchParams.get('debug') === 'heros')) {
    url.hash = 'heros';
  }
  // Replace the old bookmark in place so Back and Forward visit one entry
  // for this view. Keep unrelated query parameters and the host page path.
  if (url.href !== location.href) history.replaceState(history.state, '', url);
  const selected = location.hash === '#heros';
  panel.classList.toggle('active', selected);
  if (selected) {
    document.querySelector('.view.active:not(#heros)')?.classList.remove('active');
    document.body.dataset.mode = switcher.dataset.mode = 'heros';
    for (const button of switcher.querySelectorAll('[role="tab"]')) {
      button.setAttribute('aria-selected', String(button === tab));
    }
    document.title = 'Heros · Sip-Stack';
    scrollTo({ top: 0, behavior: 'instant' });
  }
  syncScene();
}

// The legacy switcher's button listener maps unknown modes to Outline.
tab.addEventListener('click', event => {
  event.stopImmediatePropagation();
  location.hash = 'heros';
}, { capture: true });
addEventListener('hashchange', route);
document.addEventListener('visibilitychange', syncScene);
route();
