// Observe the production route. The app has already imported Three when its
// picker mounts. Observing Mesh here does not initiate a download or a warm-up.
(() => {
  const { tier } = window.heroBenchmarkOptions;
  const names = ['sippy', 'roma', 'hummin'];
  const tour = [...names, 'lineup'];
  const probe = (window.heroFirstFrame = { visits: [] });
  const observer = new MutationObserver(async () => {
    const host = document.querySelector('#character-test');
    const setting = host?.querySelector('[data-setting=tier]');
    if (!setting) return;
    observer.disconnect();
    try {
      setting.value = tier;
      setting.dispatchEvent(new Event('change', { bubbles: true }));
      const source = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports
        .three;
      const T = await import(source);
      const previous = T.Mesh.prototype.onAfterRender;
      let queued = false,
        started = 0;
      const drawn = new Set();
      T.Mesh.prototype.onAfterRender = function (renderer, scene, camera, ...rest) {
        previous.call(this, renderer, scene, camera, ...rest);
        const canvas = renderer.domElement;
        if (!camera.isPerspectiveCamera || !canvas.closest('#character-test')) return;
        let node = this;
        while (node && !names.includes(node.name)) node = node.parent;
        if (!node) return;
        drawn.add(node.name);
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const hero = tour[probe.visits.length];
          const needed = hero === 'lineup' ? names : [hero];
          if (
            canvas.style.visibility === 'visible' &&
            canvas.checkVisibility() &&
            document.querySelector('#heros.active') &&
            needed.every((name) => drawn.has(name))
          ) {
            const ms = performance.now();
            const resources = [
              performance.getEntriesByType('navigation')[0],
              ...performance.getEntriesByType('resource'),
            ].filter(
              (r) => r.responseEnd > 0 && r.responseEnd <= ms && r.name.startsWith(location.origin),
            );
            probe.visits.push({
              hero,
              ms,
              actionMs: ms - started,
              selected: [...drawn],
              width: canvas.width,
              height: canvas.height,
              resources: resources.map((r) => ({
                path: new URL(r.name).pathname,
                body: r.encodedBodySize,
                wire: r.transferSize,
                kind: r.initiatorType,
              })),
            });
            if (probe.visits.length === tour.length) {
              T.Mesh.prototype.onAfterRender = previous;
              probe.done = true;
              // Stop the completed tour while the driver retrieves its samples.
              document.querySelector('#heros').style.display = 'none';
            } else {
              const next = tour[probe.visits.length];
              started = performance.now();
              host
                .querySelector(next === 'lineup' ? '[data-action=lineup]' : `[data-pick=${next}]`)
                .click();
            }
          }
          drawn.clear();
        });
      };
    } catch (error) {
      probe.error = String(error.stack || error);
    }
  });
  observer.observe(document, { childList: true, subtree: true });
})();
