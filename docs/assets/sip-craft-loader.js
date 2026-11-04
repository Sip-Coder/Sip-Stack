// Coordinate the separate craft scene with the teaching Village's lifecycle.
const block = document.querySelector('.craft');
const stage = block.querySelector('.craft-stage');
let instance, loading, failed = false, intersecting = false, announced = false;
const active = () => intersecting && document.body.dataset.mode === 'village' && !document.hidden;
// Give the visible craft scene priority over the teaching Village's animation loop.
function announce(value) {
  if (value === announced) return;
  announced = value;
  document.body.dataset.craftVisible = String(value);
  document.dispatchEvent(new CustomEvent('sip:craft-visibility', { detail: { active: value } }));
}
async function sync() {
  if (!active() || failed) {
    instance?.setVisible(false);
    announce(false);
    return;
  }
  // Suspend the Village before creating or starting another WebGL renderer.
  announce(true);
  if (!instance && !loading) {
    loading = true;
    try {
      const { mountCraft } = await import('./sip-craft.js');
      if (active()) instance = mountCraft(block);
    } catch (error) {
      failed = true;
      block.querySelector('.craft-status').textContent = 'The coast could not load. WebGL and a connection are needed. Refresh to try again.';
      console.warn('Craft demo:', error);
    } finally { loading = false; }
  }
  if (!active() || failed) {
    instance?.setVisible(false);
    announce(false);
  } else instance?.setVisible(true);
}
new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; sync(); }, { threshold: .01 }).observe(stage);
new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
document.addEventListener('visibilitychange', sync);
