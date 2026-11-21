import * as T from 'three';
import { setModelDetail } from './model-tier.js';
import { createActor } from './rig.js';
import { FIXED_DT, createController } from './motion.js';
import { createStage, contactShadows } from './stage.js';
import { createUI, heights, labels, names } from './ui.js';
import { createInput } from './input.js';
import { optimizeCharacter } from './render-batches.js';

const loadBuilder = [
  () => import('./sippy.js').then(m => m.buildSippy),
  () => import('./roma.js').then(m => m.buildRoma),
  () => import('./hummin.js').then(m => m.buildHummin),
];

export function mountCharacters(host, initialHero = 'sippy', rememberHero) {
  const el = createUI(host),
    stage = createStage(el),
    loading = el.querySelector('.ct-loading');
  const cast = Array(3).fill(null);
  const pending = new Map();
  const query = new URLSearchParams(location.search);
  const debug = query.get('debug') === 'heros';
  let autoLimited = false, slowWindows = 0, stepCost = 0, windowCost = 0;
  let firstHeroPainted = false;
  const neutral = { x: 0, z: 0, run: false, jump: false, roll: false, emote: false };
  const steering = { ...neutral };
  const target = new T.Vector3(),
    desired = new T.Vector3();
  let selected = Math.max(0, names.indexOf(initialHero)),
    view = 'follow',
    party = false,
    slow = false,
    visible = false,
    onscreen = true,
    lost = false,
    manual = false;
  let yaw = 0.24,
    pitch = 0.13,
    ready = false,
    generation = 0,
    raf = 0,
    previous = null,
    debt = 0,
    snap = true;
  let actualTier = '',
    rate = 60,
    windowTime = 0,
    windowSteps = 0,
    hudTime = 0;
  const find = (s) => host.querySelector(s),
    picks = host.querySelectorAll('[data-pick]'),
    tierSelect = find('[data-setting=tier]');
  const stateText = find('[data-state]'),
    speedText = find('[data-speed]'),
    rateText = find('[data-rate]');
  const groupButton = find('[data-action=group]'),
    lineupButton = find('[data-action=lineup]'),
    slowCheck = find('[data-setting=slow]');
  function updateHUD() {
    const f = cast[selected]?.ctrl.frame;
    if (!f) return;
    const state = view === 'lineup' ? 'Lineup' : f.emote >= 0 ? 'Emote' : f.state;
    if (stateText.textContent !== state) stateText.textContent = state;
    speedText.textContent = (f.speed * 3600 / 1609.344).toFixed(2) + ' mph';
    rateText.textContent = `${rate} Hz physics · ${stepCost.toFixed(1)} / ${(FIXED_DT * 1000).toFixed(1)} ms`;
  }
  function showCast() {
    for (let i = 0; i < cast.length; i++)
      if (cast[i]) cast[i].rig.root.visible = view === 'lineup' || party || i === selected;
    groupButton.setAttribute('aria-pressed', String(party));
    lineupButton.setAttribute('aria-pressed', String(view === 'lineup'));
    stage.scale.visible = view === 'lineup';
    for (let i = 0; i < picks.length; i++) picks[i].setAttribute('aria-pressed', String(i === selected));
    stage.invalidateShadow();
    updateHUD();
  }
  function place(i) {
    const actor = cast[i];
    const side = i < selected ? i : i - 1;
    const follower = view !== 'lineup' && i !== selected;
    actor.ctrl.reset(view === 'lineup' ? (i - 1) * 1.04 : follower ? (side === 0 ? -0.9 : 0.9) : 0,
      follower ? -0.85 : 0);
    stepActor(actor, neutral);
  }
  function loadActor(i) {
    if (pending.has(i)) return pending.get(i);
    if (cast[i]) return Promise.resolve();
    const job = loadBuilder[i]().then(async build => {
      const rig = createActor(names[i], heights[i]);
      const pose = build(rig), ctrl = createController(rig);
      optimizeCharacter(rig);
      setModelDetail(rig.root, actualTier);
      const drawDebug = debug ? (await import('./debug-rig.js')).debugRig(stage.scene, rig, ctrl) : null;
      stage.scene.add(rig.root);
      cast[i] = { rig, pose, ctrl, drawDebug, contactShadow: contactShadows(stage.scene, rig) };
      place(i);
      showCast();
      if (!lost && rig.root.visible) await warm();
    }).finally(() => pending.delete(i));
    pending.set(i, job);
    return job;
  }
  function requestedCast() {
    const indices = party || view === 'lineup' ? [0, 1, 2] : [selected];
    const missing = indices.filter(i => !cast[i]);
    loading.hidden = !missing.length;
    if (missing.length) loading.textContent = 'Preparing ' + missing.map(i => labels[i]).join(' and ') + '…';
    return Promise.all(indices.map(loadActor)).catch(async error => {
      try {
        const { recover } = await import('../assets/sip-recover.js');
        if (await recover('Heros', error, indices.map(i => './characters/' + names[i] + '.js'))) return;
      } catch {
        // Recovery itself can be unavailable while the connection is down.
      }
      loading.hidden = false;
      loading.textContent = 'Could not load the character. Refresh the page to retry.';
    });
  }
  function stepActor(actor, input) {
    actor.pose(actor.ctrl.step(FIXED_DT, input));
    actor.ctrl.finishPose();
  }
  function reset() {
    for (let i = 0; i < cast.length; i++) if (cast[i]) place(i);
    debt = 0;
    previous = null;
    snap = true;
    input.clear();
    showCast();
  }
  function choose(i) {
    if (!Number.isInteger(i) || i < 0 || i >= names.length) return;
    selected = i;
    rememberHero?.(names[i]);
    if (!party || view === 'lineup') {
      view = 'follow';
      reset();
    } else showCast();
    snap = true;
    return requestedCast();
  }
  function setView(next) {
    if (!['front', 'side', 'back', 'lineup', 'follow'].includes(next)) return;
    const wasLineup = view === 'lineup';
    view = next;
    if (next === 'lineup' || wasLineup) {
      party = false;
      reset();
    }
    if (next === 'follow') yaw = (cast[selected]?.ctrl.frame.heading ?? 0) + Math.PI;
    pitch = 0.13;
    snap = true;
    showCast();
    return requestedCast();
  }
  function action(cmd, value) {
    if (cmd === 'select') choose(value);
    else if (cmd === 'next') choose((selected + 1) % 3);
    else if (cmd === 'reset') reset();
    else if (cmd === 'lineup') setView(view === 'lineup' ? 'follow' : 'lineup');
    else if (cmd === 'group') {
      if (view === 'lineup') view = 'follow';
      party = !party;
      reset();
      requestedCast();
    } else if (cmd === 'slow') {
      slow = !slow;
      slowCheck.checked = slow;
    } else if (cmd === 'emote') {
      if (view === 'lineup') setView('follow');
      input.emote();
    }
  }
  const input = createInput(host, stage.canvas, action, (dx, dy) => {
    if (view === 'lineup') return;
    if (view !== 'follow') {
      yaw = angle();
      view = 'follow';
    }
    yaw += dx;
    pitch = T.MathUtils.clamp(pitch + dy, -0.075, 0.79);
  });
  for (let i = 0; i < picks.length; i++) picks[i].addEventListener('click', () => choose(i));
  for (const b of host.querySelectorAll('[data-action]'))
    b.addEventListener('click', () => action(b.dataset.action));
  slowCheck.addEventListener('change', () => {
    slow = slowCheck.checked;
  });
  const mobileDisplay = matchMedia('(pointer:coarse), (max-width:739px)');
  function quality() {
    const auto = autoLimited || mobileDisplay.matches ? 'mobile' : stage.autoTier();
    actualTier = tierSelect.value === 'auto' ? auto : tierSelect.value;
    tierSelect.options[0].textContent = 'Auto · ' + (auto === 'high' ? 'High' : 'Mobile');
    for (const actor of cast) if (actor) setModelDetail(actor.rig.root, actualTier);
    stage.quality(actualTier);
  }
  tierSelect.addEventListener('change', () => {
    autoLimited = false;
    slowWindows = 0;
    quality();
  });
  mobileDisplay.addEventListener('change', () => {
    if (tierSelect.value === 'auto') quality();
  });
  find('[data-setting=light]').addEventListener('change', (e) =>
    stage.lighting(e.target.selectedIndex === 1),
  );
  function angle() {
    if (view === 'lineup') return 0.035;
    const heading = cast[selected]?.ctrl.frame.heading ?? 0;
    if (view === 'front') return heading + 0.045;
    if (view === 'side') return heading + Math.PI / 2;
    if (view === 'back') return heading + Math.PI;
    return yaw;
  }
  function simulate(intent) {
    if (view === 'lineup') {
      for (const a of cast) if (a) stepActor(a, neutral);
      return;
    }
    const driver = cast[selected];
    if (!driver) return;
    stepActor(driver, intent);
    if (!party) return;
    const root = driver.rig.root.position,
      h = driver.ctrl.frame.heading,
      cs = Math.cos(h),
      sn = Math.sin(h);
    let slot = 0;
    for (let i = 0; i < 3; i++)
      if (i !== selected && cast[i]) {
        const a = cast[i],
          p = a.rig.root.position,
          side = slot++ === 0 ? -1 : 1;
        let x = root.x + side * 0.83 * cs - 0.86 * sn - p.x,
          z = root.z - side * 0.83 * sn - 0.86 * cs - p.z;
        for (const other of cast)
          if (other && other !== a) {
            const dx = p.x - other.rig.root.position.x,
              dz = p.z - other.rig.root.position.z,
              d = Math.hypot(dx, dz);
            if (d > 0.001 && d < 0.64) {
              x += (dx * (0.64 - d) * 3) / d;
              z += (dz * (0.64 - d) * 3) / d;
            }
          }
        const distance = Math.hypot(x, z);
        steering.run = distance > 1.3 || driver.ctrl.frame.speed > 1.8;
        const pace = distance < 0.08 ? 0 : Math.min(1, distance * (steering.run ? 1.1 : 2.8));
        steering.x = (x * pace) / Math.max(0.001, distance);
        steering.z = (z * pace) / Math.max(0.001, distance);
        steering.jump = intent.jump;
        steering.roll = intent.roll;
        steering.emote = intent.emote;
        stepActor(a, steering);
      }
  }
  function render(dt = FIXED_DT) {
    const actor = cast[selected];
    // Keep the last complete frame while the newly selected model downloads.
    if (!ready || lost || !visible || !actor || !stage.fit()) return;
    const base = actor.rig.root.position;
    if (view === 'lineup') desired.set(0.16, 0.94, 0);
    else desired.set(base.x, base.y + actor.rig.height * 0.5, base.z);
    if (snap || manual) target.copy(desired);
    else target.lerp(desired, 1 - Math.exp(-dt * 13));
    const lineup = view === 'lineup',
      a = angle(),
      y = lineup ? 0.07 : pitch;
    const distance = lineup
      ? Math.max(3.95, 6.3 / stage.camera.aspect)
      : Math.max(party ? 4.25 : 3.55, (party ? 4.75 : 1.6) / stage.camera.aspect);
    stage.camera.position.set(
      target.x + Math.sin(a) * Math.cos(y) * distance,
      target.y + Math.sin(y) * distance,
      target.z + Math.cos(a) * Math.cos(y) * distance,
    );
    stage.camera.lookAt(target);
    stage.illuminate(target);
    for (const a of cast) if (a) a.contactShadow();
    if (debug) {
      stage.scene.updateMatrixWorld(true);
      for (const a of cast) if (a?.rig.root.visible) a.drawDebug();
    }
    stage.draw();
    snap = false;
    stage.canvas.style.visibility = 'visible';
    if (!firstHeroPainted) {
      firstHeroPainted = true;
      performance.mark('heros-first-hero-frame');
    }
    if (!(party || lineup) || cast.every(Boolean)) loading.hidden = true;
  }
  function active() {
    return visible && onscreen && !lost && !document.hidden && ready;
  }
  function frame(now) {
    raf = 0;
    if (!active() || manual) return;
    const wallTime = previous === null ? 0 : Math.max(0, (now - previous) * 0.001);
    const dt = Math.min(0.2, wallTime);
    previous = now;
    debt += dt * (slow ? 0.25 : 1);
    const due = Math.floor(debt / FIXED_DT);
    // Drop whole overdue ticks. Preserve the fractional tick for smooth cadence.
    debt -= due * FIXED_DT;
    const steps = Math.min(2, due);
    const start = performance.now();
    for (let i = 0; i < steps; i++) simulate(input.sample(angle(), FIXED_DT));
    windowCost += performance.now() - start;
    windowSteps += steps;
    windowTime += wallTime;
    if (windowTime >= 1) {
      rate = Math.round(windowSteps / windowTime);
      stepCost = windowSteps ? windowCost / windowSteps : 0;
      slowWindows = !slow && cast[selected] && rate < 50 ? slowWindows + 1 : 0;
      if (slowWindows >= 2 && actualTier === 'high' && tierSelect.value === 'auto') {
        autoLimited = true;
        quality();
      }
      windowTime = windowSteps = windowCost = 0;
    }
    hudTime += dt;
    if (hudTime >= 0.1) {
      updateHUD();
      hudTime = 0;
    }
    render(dt);
    schedule();
  }
  function schedule() {
    if (!raf && active() && !manual) raf = requestAnimationFrame(frame);
  }
  function sync() {
    if (!active()) {
      cancelAnimationFrame(raf);
      raf = 0;
      previous = null;
      debt = 0;
      windowTime = windowSteps = windowCost = slowWindows = 0;
      input.setEnabled(false);
    } else {
      input.setEnabled(!manual);
      if (manual) render();
      else schedule();
    }
  }
  function warm() {
    const id = ++generation;
    ready = false;
    previous = null;
    debt = 0;
    return stage.warm().then(() => {
      if (id !== generation || lost) return;
      ready = true;
      snap = true;
      sync();
    });
  }
  stage.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    ready = false;
    generation++;
    stage.canvas.style.visibility = 'hidden';
    stage.releaseTargets();
    loading.hidden = false;
    loading.textContent = 'Restoring the test floor…';
    sync();
  });
  stage.canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    quality();
    if (cast.some(Boolean)) warm();
  });
  new IntersectionObserver(([e]) => {
    onscreen = e.isIntersecting;
    sync();
  }).observe(el);
  new ResizeObserver(() => {
    snap = true;
    if (manual && active()) render();
  }).observe(el);
  if (debug || query.get('review') === 'heros') {
    import('./review-controls.js').then(({ reviewControls }) => {
      host.characterTest = reviewControls({
        choose, names, setView, tierSelect, quality, reset, neutral, render, simulate, updateHUD,
        manualMode(v) {
          manual = !!v;
          cancelAnimationFrame(raf);
          raf = 0;
          previous = null;
          debt = 0;
          sync();
        },
        primeSecondary: async () => {
          const visible = cast.filter(actor => actor?.rig.root.visible);
          return (await Promise.all(visible.map(actor => actor.rig.loadSecondary()))).every(Boolean);
        },
        canTick: () => manual && !lost,
        snapshot() {
          const actor = cast[selected], f = actor?.ctrl.frame, p = actor?.rig.root.position;
          return {
            name: names[selected], state: f?.state, speed: f?.speed ?? 0,
            x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0, heading: f?.heading ?? 0,
            tier: actualTier, view, emote: f?.emote ?? -1, visible: active(),
            built: cast.flatMap((a, i) => a ? [names[i]] : []), firstHeroPainted,
          };
        },
      });
    });
  }
  quality();
  reset();
  requestedCast();
  return {
    setVisible(v) {
      visible = v;
      if (!v) for (const video of host.querySelectorAll('video')) video.pause();
      sync();
    },
  };
}
