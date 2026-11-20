import * as T from 'three';
import { setModelDetail } from './material-detail.js';
import { createActor } from './rig.js';
import { FIXED_DT, createController } from './motion.js';
import { buildSippy } from './sippy.js';
import { buildRoma } from './roma.js';
import { buildHummin } from './hummin.js';
import { createStage, debugRig, contactShadows } from './stage.js';
import { createUI, heights, names } from './ui.js';
import { createInput } from './input.js';

export function mountCharacters(host) {
  const el = createUI(host),
    stage = createStage(el),
    loading = el.querySelector('.ct-loading');
  const builders = [buildSippy, buildRoma, buildHummin];
  const cast = names.map((name, i) => {
    const rig = createActor(name, heights[i]);
    const pose = builders[i](rig),
      ctrl = createController(rig);
    stage.scene.add(rig.root);
    return { rig, pose, ctrl, contactShadow: contactShadows(stage.scene, rig) };
  });
  const query = new URLSearchParams(location.search);
  const debug =
    query.get('debug') === 'heros' ? cast.map((a) => debugRig(stage.scene, a.rig, a.ctrl)) : null;
  const neutral = { x: 0, z: 0, run: false, jump: false, roll: false, emote: false };
  const steering = { ...neutral };
  const target = new T.Vector3(),
    desired = new T.Vector3();
  let selected = 0,
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
    const f = cast[selected].ctrl.frame;
    const state = view === 'lineup' ? 'Lineup' : f.emote >= 0 ? 'Emote' : f.state;
    if (stateText.textContent !== state) stateText.textContent = state;
    speedText.textContent = f.speed.toFixed(2) + ' m/s';
    rateText.textContent = rate + ' Hz physics';
  }
  function showCast() {
    for (let i = 0; i < cast.length; i++)
      cast[i].rig.root.visible = view === 'lineup' || party || i === selected;
    groupButton.setAttribute('aria-pressed', String(party));
    lineupButton.setAttribute('aria-pressed', String(view === 'lineup'));
    stage.scale.visible = view === 'lineup';
    for (let i = 0; i < picks.length; i++) picks[i].setAttribute('aria-pressed', String(i === selected));
    updateHUD();
  }
  function stepActor(actor, input) {
    actor.pose(actor.ctrl.step(FIXED_DT, input));
    actor.ctrl.finishPose();
  }
  function reset() {
    let follower = 0;
    for (let i = 0; i < 3; i++) {
      const a = cast[i];
      let x = 0,
        z = 0;
      if (view === 'lineup') x = (i - 1) * 1.04;
      else if (i !== selected) {
        x = follower++ === 0 ? -0.9 : 0.9;
        z = -0.85;
      }
      a.ctrl.reset(x, z);
      stepActor(a, neutral);
    }
    debt = 0;
    previous = null;
    snap = true;
    input.clear();
    showCast();
  }
  function choose(i) {
    if (i < 0 || i >= 3) return;
    selected = i;
    if (!party || view === 'lineup') {
      view = 'follow';
      reset();
    } else showCast();
    snap = true;
  }
  function setView(next) {
    if (!['front', 'side', 'back', 'lineup', 'follow'].includes(next)) return;
    const wasLineup = view === 'lineup';
    view = next;
    if (next === 'lineup' || wasLineup) {
      party = false;
      reset();
    }
    if (next === 'follow') yaw = cast[selected].ctrl.frame.heading + Math.PI;
    pitch = 0.13;
    snap = true;
    showCast();
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
    const auto = mobileDisplay.matches ? 'mobile' : 'high';
    actualTier = tierSelect.value === 'auto' ? auto : tierSelect.value;
    tierSelect.options[0].textContent = 'Auto · ' + (auto === 'high' ? 'High' : 'Mobile');
    for (const actor of cast) setModelDetail(actor.rig.root, actualTier);
    stage.quality(actualTier);
  }
  tierSelect.addEventListener('change', quality);
  mobileDisplay.addEventListener('change', () => {
    if (tierSelect.value === 'auto') quality();
  });
  find('[data-setting=light]').addEventListener('change', (e) =>
    stage.lighting(e.target.selectedIndex === 1),
  );
  function angle() {
    if (view === 'lineup') return 0.035;
    const heading = cast[selected].ctrl.frame.heading;
    if (view === 'front') return heading + 0.045;
    if (view === 'side') return heading + Math.PI / 2;
    if (view === 'back') return heading + Math.PI;
    return yaw;
  }
  function simulate(intent) {
    if (view === 'lineup') {
      for (const a of cast) stepActor(a, neutral);
      return;
    }
    const driver = cast[selected];
    stepActor(driver, intent);
    if (!party) return;
    const root = driver.rig.root.position,
      h = driver.ctrl.frame.heading,
      cs = Math.cos(h),
      sn = Math.sin(h);
    let slot = 0;
    for (let i = 0; i < 3; i++)
      if (i !== selected) {
        const a = cast[i],
          p = a.rig.root.position,
          side = slot++ === 0 ? -1 : 1;
        let x = root.x + side * 0.83 * cs - 0.86 * sn - p.x,
          z = root.z - side * 0.83 * sn - 0.86 * cs - p.z;
        for (const other of cast)
          if (other !== a) {
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
    if (!ready || lost || !visible || !stage.fit()) return;
    const actor = cast[selected],
      base = actor.rig.root.position;
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
    for (const a of cast) a.contactShadow();
    if (debug) {
      stage.scene.updateMatrixWorld(true);
      for (const draw of debug) draw();
    }
    stage.draw();
    snap = false;
    stage.canvas.style.visibility = 'visible';
    loading.hidden = true;
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
    windowTime += wallTime;
    while (debt >= FIXED_DT) {
      debt -= FIXED_DT;
      simulate(input.sample(angle(), FIXED_DT));
      windowSteps++;
    }
    if (windowTime >= 0.5) {
      rate = Math.round(windowSteps / windowTime);
      windowTime = windowSteps = 0;
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
      windowTime = windowSteps = 0;
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
    stage.warm().then(() => {
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
    warm();
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
    host.characterTest = {
      select(name) {
        choose(names.indexOf(name));
      },
      view: setView,
      tier(q) {
        tierSelect.value = q;
        quality();
      },
      reset,
      setManual(v) {
        manual = !!v;
        cancelAnimationFrame(raf);
        raf = 0;
        previous = null;
        debt = 0;
        sync();
      },
      tick(n, intent = neutral) {
        if (!manual || lost) return;
        const request = { ...neutral, ...intent };
        for (let i = 0; i < n; i++) {
          simulate(request);
          request.jump = request.roll = request.emote = false;
        }
        updateHUD();
      },
      render,
      snapshot() {
        const a = cast[selected],
          f = a.ctrl.frame,
          p = a.rig.root.position;
        return {
          name: names[selected],
          state: f.state,
          speed: f.speed,
          x: p.x,
          y: p.y,
          z: p.z,
          heading: f.heading,
          tier: actualTier,
          view,
          emote: f.emote,
          visible: active(),
        };
      },
    };
  }
  quality();
  reset();
  warm();
  return {
    setVisible(v) {
      visible = v;
      if (!v) for (const video of host.querySelectorAll('video')) video.pause();
      sync();
    },
  };
}
