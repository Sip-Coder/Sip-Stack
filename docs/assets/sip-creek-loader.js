// Creek has priority over the other dioramas while its stage is in view.
const block = document.querySelector('.creek');
const stage = block.querySelector('.creek-stage');
let instance, loading = false, failed = false, intersecting = false, announced = false;
const active = () => intersecting && document.body.dataset.mode === 'village' && !document.hidden;

function announce(value) {
  if (value === announced) return;
  announced = value;
  document.body.dataset.creekVisible = String(value);
  document.dispatchEvent(new CustomEvent('sip:creek-visibility', { detail: { active: value } }));
}

async function sync() {
  if (!active() || failed) {
    // Release priority only after the renderer is stopped.
    instance?.setVisible(false);
    announce(false);
    return;
  }
  // Both other scenes stop synchronously before a third renderer is started.
  announce(true);
  if (!instance && !loading) {
    loading = true;
    try {
      const { mountCreek } = await import('./sip-creek.js');
      if (active()) instance = mountCreek(block);
    } catch (error) {
      failed = true;
      const status = block.querySelector('.creek-loading');
      status.hidden = false;
      status.textContent = 'The creek could not load. WebGL and a connection are needed. Refresh to try again.';
      console.warn('Creek demo:', error);
    } finally { loading = false; }
  }
  if (!active() || failed) {
    instance?.setVisible(false);
    announce(false);
  } else instance?.setVisible(true);
}

new IntersectionObserver(([entry]) => {
  intersecting = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
  sync();
}, { threshold: .01 }).observe(stage);
new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
document.addEventListener('visibilitychange', sync);
