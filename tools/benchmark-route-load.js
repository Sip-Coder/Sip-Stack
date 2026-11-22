// Observe the site's already-imported Three module. This adds no scene assets or
// imports to the cold start. The production quality and input handlers stay live.
async function observeRoute(route, tier, hero, expectedGroom) {
  const village = route === "village";
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
  const host = document.querySelector(
    village ? ".vl-stage" : "#character-test",
  );
  const canvas = host.querySelector("canvas");
  const select = document.querySelector(
    village ? ".vl-quality" : "#character-test [data-setting=tier]",
  );
  const spec = JSON.parse(
    document.querySelector("script[type=importmap]").textContent,
  ).imports.three;
  const T = await import(spec);
  run.observing = true;
  const source = T.Mesh.prototype.onAfterRender;
  const names = new Set();
  const groomParts = new Map();
  let queued = false,
    wantsKey = false,
    initial,
    keyAt;
  const key = village ? "ArrowRight" : "KeyW";
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.code === key && event.isTrusted) keyAt = performance.now();
    },
    true,
  );
  function snapshot() {
    return {
      names: [...names].sort(),
      width: canvas.width,
      height: canvas.height,
      tier: select.value,
      ...(expectedGroom ? {
        groomMeshes: groomParts.size,
        groomTriangles: Array.from(groomParts.values()).reduce((sum, count) => sum + count, 0),
      } : {}),
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
    while (actor) {
      if (
        village ? workers.has(actor.name) : actor.name.toLowerCase() === hero
      )
        break;
      actor = actor.parent;
    }
    if (!actor) return;
    if (!run.firstDrawMs) run.firstDrawMs = performance.now();
    names.add(actor.name);
    if (expectedGroom && this.userData.hairPart && this.geometry) {
      const vertices = this.geometry.index?.count ?? this.geometry.attributes.position.count;
      groomParts.set(this.uuid, vertices / 3);
    }
    const obj = village ? camera : actor;
    const transform = obj.matrixWorld.elements;
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
      const status = document.querySelector(
        village ? ".vl-loading" : ".ct-loading",
      );
      if (status && !status.hidden && status.checkVisibility()) return;
      if (expectedGroom && !groomParts.size) return;
      if (!initial) {
        run.presentedMs = performance.now();
        run.proof = snapshot();
        console.debug("Route popped", route, run.presentedMs);
        initial = current;
        (village ? host : canvas).focus({ preventScroll: true });
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
  select.value = village ? tier[0].toUpperCase() + tier.slice(1) : tier;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
