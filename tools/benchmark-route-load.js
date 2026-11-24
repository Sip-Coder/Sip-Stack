// Observe the site's already-imported Three module. This adds no scene assets or
// imports to the cold start. The production quality and input handlers stay live.
async function observeRoute(tier) {
  const workers = new Set([
    "Harvester",
    "Porter",
    "Taster",
    "Cellar worker",
    "Stair walker",
    "Oarsman",
    "Cantina guest",
  ]);
  const run = (window.routeLoad = {});
  const host = document.querySelector(".vl-stage");
  const canvas = host.querySelector("canvas");
  const select = document.querySelector(".vl-quality");
  const spec = JSON.parse(
    document.querySelector("script[type=importmap]").textContent,
  ).imports.three;
  const T = await import(spec);
  run.observing = true;
  const source = T.Mesh.prototype.onAfterRender;
  const names = new Set();
  let queued = false,
    wantsKey = false,
    initial,
    keyAt;
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.code === "ArrowRight" && event.isTrusted) keyAt = performance.now();
    },
    true,
  );
  function snapshot() {
    return {
      names: [...names].sort(),
      width: canvas.width,
      height: canvas.height,
      tier: select.value,
    };
  }
  T.Mesh.prototype.onAfterRender = function (renderer, scene, camera, ...args) {
    source.call(this, renderer, scene, camera, ...args);
    if (
      run.done ||
      renderer.domElement !== canvas ||
      !camera.isPerspectiveCamera
    )
      return;
    let actor = this;
    while (actor && !workers.has(actor.name)) actor = actor.parent;
    if (!actor) return;
    if (!run.firstDrawMs) run.firstDrawMs = performance.now();
    names.add(actor.name);
    const transform = camera.matrixWorld.elements;
    if (queued) return;
    queued = true;
    const current = [transform[12], transform[13], transform[14]];
    requestAnimationFrame(() => {
      queued = false;
      const b = canvas.getBoundingClientRect();
      if (
        canvas.style.visibility === "hidden" ||
        !canvas.checkVisibility() ||
        b.top >= innerHeight ||
        b.bottom <= 0
      )
        return;
      const status = document.querySelector(".vl-loading");
      if (status && !status.hidden && status.checkVisibility()) return;
      if (!initial) {
        run.presentedMs = performance.now();
        run.proof = snapshot();
        console.debug("Route popped", "village", run.presentedMs);
        initial = current;
        host.focus({ preventScroll: true });
        wantsKey = true;
      } else if (
        wantsKey &&
        keyAt &&
        Math.hypot(...initial.map((v, i) => current[i] - v)) > 0.00001
      ) {
        run.interactiveMs = performance.now();
        run.inputMs = keyAt;
        run.positionBefore = initial;
        run.positionAfter = current;
        run.done = true;
        T.Mesh.prototype.onAfterRender = source;
      }
    });
  };
  select.value = tier[0].toUpperCase() + tier.slice(1);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
