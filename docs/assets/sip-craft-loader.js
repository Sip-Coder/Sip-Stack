// Separate lifecycle: no changes to the teaching Village or its routing.
const block = document.querySelector('.craft');
const stage = block.querySelector('.craft-stage');
let instance, loading, intersecting = false;
const active = () => intersecting && document.body.dataset.mode === 'village' && !document.hidden;
async function sync() {
  if (active() && !instance && !loading) {
    loading = true;
    try { const { mountCraft } = await import('./sip-craft.js'); instance = mountCraft(block); }
    catch (error) { block.querySelector('.craft-status').textContent = 'The coast could not load. WebGL and a connection are needed. Refresh to try again.'; console.warn('Craft demo:', error); }
  }
  instance?.setVisible(active());
}
new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; sync(); }, { threshold: .01 }).observe(stage);
new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
document.addEventListener('visibilitychange', sync);
