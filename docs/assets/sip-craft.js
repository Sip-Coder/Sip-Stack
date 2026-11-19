import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildSky, sunDirection, seeded } from './sip-craft-sky.js';
import { buildHarbor } from './sip-craft-harbor.js';
import { buildLand, stoneTexture } from './sip-craft-land.js';
import { buildSea, hullWave } from './sip-craft-water.js';
import { makePipeline } from './sip-craft-render.js';
import { warmShaders } from './sip-warm.js';

const duration = 18;
const curve = (points) => new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
const course = curve([
  [-9, 0.71, 13.6],
  [-8.8, 0.86, 11.9],
  [-8.5, 1.21, 8.55],
  [-7.1, 1.8, 7.4],
  [-5.0, 2.75, 7.85],
  [-3.75, 3.87, 9.7],
  [-2.0, 4.45, 11.65],
]);
const gaze = curve([
  [-3.4, 1.4, -1.6],
  [-4.15, 1.34, -0.9],
  [-3.9, 1.92, -0.65],
  [-2.1, 2.15, -1.25],
  [0.4, 2.36, -1.6],
  [1.9, 2.05, -1.6],
  [2.2, 2.1, -1.65],
]);
const beatNames = ['The swell', 'The vineyard cliffs', 'The lighthouse'];
function pickTier(renderer) {
  const gl = renderer.getContext(),
    info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  if (matchMedia('(pointer:coarse)').matches || /Adreno|Mali|PowerVR|Apple A\d/i.test(gpu)) return 0;
  if (/llvmpipe|swiftshader|Intel.*(HD|UHD)/i.test(gpu) || devicePixelRatio > 2.5) return 1;
  return renderer.capabilities.maxTextureSize >= 8192 ? 2 : 1;
}

function lightning(scene) {
  const rng = seeded(42),
    vertices = [];
  function fork(x, y, z, n, length, width) {
    for (let i = 0; i < n; i++) {
      const nx = x + (rng() - 0.45) * width,
        ny = y - length / n,
        nz = z + (rng() - 0.48) * width * 0.54;
      vertices.push(x, y, z, nx, ny, nz);
      if (n > 8 && i % 4 === 2) fork(nx, ny, nz, 5, 2.2, 1.35);
      x = nx;
      y = ny;
      z = nz;
    }
  }
  fork(-14, 17, -47, 22, 13, 1.35);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  const lines = new T.LineSegments(
    g,
    new T.LineBasicMaterial({ color: new T.Color(2.0, 2.35, 3), transparent: true, depthWrite: false }),
  );
  const light = new T.DirectionalLight('#c8deff', 0);
  light.position.set(-14, 17, -47);
  scene.add(lines, light);
  return (strength) => {
    lines.visible = strength > 0.11;
    lines.material.opacity = strength * 0.88;
    light.intensity = strength * 3.3;
  };
}

// One synthesized roll per return-stroke pair. Sound is opt-in and suspends
// with the diorama, so a storm cannot follow the visitor down to Sip Creek.
function thunder(button) {
  let context,
    buffer,
    lastRoll = -1,
    enabled = false;
  const random = seeded(775);
  button.addEventListener('click', async () => {
    if (!context) {
      context = new AudioContext();
      buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let low = 0;
      for (let i = 0; i < samples.length; i++) {
        const t = i / context.sampleRate;
        low = 0.94 * low + 0.06 * (random() * 2 - 1);
        samples[i] = low * Math.exp(-1.35 * t) * Math.min(1, t * 12) * (0.54 + 0.46 * Math.cos(t * 7) ** 2);
      }
    }
    enabled = !enabled;
    button.setAttribute('aria-pressed', String(enabled));
    if (enabled) await context.resume();
    else await context.suspend();
  });
  if (!window.AudioContext) button.hidden = true;
  return {
    advance(t, w) {
      const cycle = Math.floor(t / 14.2),
        phase = t - cycle * 14.2;
      if (cycle === lastRoll || phase < 6.75 || phase > 7.4) return;
      lastRoll = cycle;
      if (!enabled || w < 0.68 || context.state !== 'running') return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 0.88 + random() * 0.19;
      source.connect(context.destination);
      source.start();
    },
    visible(active) {
      if (enabled) {
        if (active) context.resume();
        else context.suspend();
      }
    },
  };
}

export function mountCraft(root) {
  const $ = (name) => root.querySelector('.craft-' + name);
  const stage = $('stage'),
    status = $('status'),
    weatherInput = $('weather'),
    scrub = $('scrub');
  const play = $('play'),
    freeButton = $('orbit'),
    pause = $('pause'),
    quality = $('quality');
  const cycleButton = $('cycle'),
    beat = $('beat'),
    clock = $('clock');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new T.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.autoClear = false;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.style.visibility = 'hidden';
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    'Tidelight Coast. In Free orbit, drag or use the arrow keys to turn. Pinch or use plus and minus to zoom.',
  );
  stage.prepend(canvas);
  const land = new T.Scene(),
    water = new T.Scene(),
    camera = new T.PerspectiveCamera(46, 1, 0.085, 205);
  const look = new T.Vector3(),
    orbit = new OrbitControls(camera, canvas);
  Object.assign(orbit, {
    enabled: false,
    enablePan: false,
    enableDamping: false,
    minDistance: 2.15,
    maxDistance: 39,
    maxPolarAngle: Math.PI * 0.48,
  });
  const u = {
    seaTime: { value: 0 },
    storm: { value: 0.15 },
    sunDir: { value: sunDirection },
    flash: { value: 0 },
    afterglow: { value: 0 },
  };
  const sky = buildSky(renderer, land, u, camera);
  land.fog = new T.FogExp2('#c9bab0', 0.011);
  const skyLight = new T.HemisphereLight('#d8e7f4', '#8b7b66', 1.24);
  const sun = new T.DirectionalLight('#ffdfae', 2.8);
  sun.position.copy(sunDirection).multiplyScalar(28);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, bottom: -6, top: 7, near: 12, far: 46 });
  sun.shadow.normalBias = 0.018;
  sun.shadow.bias = -0.00025;
  land.add(skyLight, sun);
  const grain = stoneTexture();
  const landTier = buildLand(land, u, grain),
    harbor = buildHarbor(land, u, grain),
    strike = lightning(land);
  const opaque = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: true });
  opaque.depthTexture = new T.DepthTexture(1, 1, T.UnsignedIntType);
  const sea = buildSea(water, u, sky.texture, opaque, camera);
  const pipeline = makePipeline(renderer, land, water, camera, opaque, u);
  const fairFog = new T.Color('#cfb9a7'),
    rainFog = new T.Color('#596b7c');
  const autoTier = pickTier(renderer),
    sound = thunder($('thunder'));
  let tier = autoTier,
    visible = false,
    lost = false,
    frameId = 0,
    last = null,
    elapsed = 0,
    playing = !reduced.matches;
  let motion = !reduced.matches,
    free = false,
    cycle = false,
    weather = 0.15,
    target = 0.15,
    cyclePhase = 0,
    t = 0,
    dirty = true;
  let width = 0,
    height = 0,
    beatIndex = -1,
    second = -1,
    shadowTime = -Infinity;
  const timeLabels = Array.from({ length: duration + 1 }, (_, i) => '00:' + String(i).padStart(2, '0'));
  function controlsUI() {
    play.textContent = playing ? 'Pause' : 'Play';
    play.disabled = free;
    scrub.disabled = free;
    freeButton.setAttribute('aria-pressed', String(free));
    pause.setAttribute('aria-pressed', String(!motion));
    pause.textContent = motion ? 'Pause motion' : 'Resume motion';
    cycleButton.setAttribute('aria-pressed', String(cycle));
  }
  function applyTier() {
    tier = quality.value === 'auto' ? autoTier : Number(quality.value);
    const mobile = tier === 0;
    renderer.shadowMap.enabled = !mobile;
    sun.castShadow = !mobile;
    const size = tier === 2 ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.set(size, size);
    }
    renderer.shadowMap.needsUpdate = true;
    landTier(mobile);
    sea.tier(tier);
    width = 0;
    dirty = true;
  }
  function resize() {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    const ratio = Math.min(
      devicePixelRatio,
      [1.25, 1.4, 1.7][tier],
      Math.sqrt([440000, 850000, 1720000][tier] / (w * h)),
    );
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(sea.size);
    pipeline.size(sea.size.x, sea.size.y, tier === 0);
    sky.size(sea.size.x, sea.size.y, tier === 0);
    camera.aspect = w / h;
    camera.fov = w / h < 0.85 ? 62 : 48;
    camera.updateProjectionMatrix();
  }
  function pose() {
    const p = elapsed / duration,
      ease = p * (0.36 + 0.64 * p * (3 - 2 * p));
    course.getPoint(ease, camera.position);
    gaze.getPoint(ease, look);
    if (camera.aspect < 1) {
      const pull = (1 - camera.aspect) * 0.48;
      camera.position
        .sub(look)
        .multiplyScalar(1 + pull)
        .add(look);
    }
    camera.lookAt(look);
  }
  function draw(dt) {
    resize();
    if (playing && !free) {
      elapsed = Math.min(duration, elapsed + dt);
      if (elapsed === duration) {
        playing = false;
        controlsUI();
      }
    }
    if (motion) {
      t += dt;
      if (cycle) {
        cyclePhase += dt * 0.23;
        target = 0.5 - 0.5 * Math.cos(cyclePhase);
        weatherInput.valueAsNumber = Math.round(100 * target);
      }
      weather = T.MathUtils.damp(weather, target, 2.7, dt);
    } else weather = target;
    if (!free) pose();
    // Two return strokes share a storm clock with the delayed, diffuse cloud response.
    // Reduced motion suppresses the flash even during user-requested playback.
    const phase = t % 14.2,
      strength = reduced.matches ? 0 : T.MathUtils.smoothstep(weather, 0.64, 0.96);
    u.flash.value =
      strength * (Math.exp(-((phase - 5.3) ** 2) / 0.024) + 0.58 * Math.exp(-((phase - 5.65) ** 2) / 0.018));
    u.afterglow.value = strength * Math.exp(-((phase - 6.75) ** 2) / 0.32);
    u.seaTime.value = t;
    u.storm.value = weather;
    strike(u.flash.value);
    sound.advance(t, weather);
    sky.update();
    land.fog.color.copy(fairFog).lerp(rainFog, weather);
    land.fog.density = 0.009 + weather * 0.023;
    land.environmentIntensity = 0.64 - weather * 0.24;
    sun.intensity = 2.87 * (1 - weather * 0.94);
    skyLight.intensity = 0.95 - weather * 0.48 + u.flash.value * 0.66;
    const heave = hullWave(3, 4.2, t, weather);
    harbor(t, weather, heave, (hullWave(3.08, 4.2, t, weather) - heave) / 0.08);
    if (dirty || Math.abs(t - shadowTime) > 0.18) {
      renderer.shadowMap.needsUpdate = true;
      shadowTime = t;
    }
    pipeline.draw(dt);
    canvas.style.visibility = 'visible';
    status.hidden = true;
    dirty = false;
    const b = free ? 3 : elapsed < 6 ? 0 : elapsed < 12 ? 1 : 2;
    if (b !== beatIndex) {
      beat.textContent = free ? 'Drag to explore · pinch to zoom' : beatNames[b];
      beatIndex = b;
    }
    if (!free) scrub.valueAsNumber = elapsed;
    const stamp = Math.floor(elapsed);
    if (stamp !== second) {
      clock.textContent = timeLabels[stamp] + ' / 00:18';
      second = stamp;
    }
  }
  function frame(now) {
    frameId = 0;
    if (!warmed || !visible || lost || document.hidden) return;
    const dt = last === null ? 0 : (now - last) / 1000;
    last = now;
    draw(dt);
    if (playing || motion) requestDraw();
    else last = null;
  }
  function requestDraw() {
    if (visible && !lost && !document.hidden && !frameId) frameId = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    last = null;
  }
  function guide(at, run) {
    free = false;
    orbit.enabled = false;
    elapsed = at;
    playing = run;
    last = null;
    controlsUI();
    requestDraw();
  }
  play.addEventListener('click', () => guide(elapsed === duration ? 0 : elapsed, !playing));
  $('replay').addEventListener('click', () => guide(0, true));
  scrub.addEventListener('input', () => guide(scrub.valueAsNumber, false));
  freeButton.addEventListener('click', () => {
    if (free) return guide(elapsed, false);
    free = true;
    playing = false;
    orbit.enabled = true;
    orbit.target.copy(look);
    orbit.update();
    controlsUI();
    requestDraw();
  });
  orbit.addEventListener('change', requestDraw);
  $('reset').addEventListener('click', () => guide(0, false));
  pause.addEventListener('click', () => {
    motion = !motion;
    if (!motion) playing = false;
    last = null;
    controlsUI();
    requestDraw();
  });
  weatherInput.addEventListener('input', () => {
    target = weatherInput.valueAsNumber / 100;
    cycle = false;
    controlsUI();
    requestDraw();
  });
  cycleButton.addEventListener('click', () => {
    cycle = !cycle;
    if (cycle) {
      motion = true;
      cyclePhase = Math.acos(1 - 2 * weather);
    }
    controlsUI();
    requestDraw();
  });
  quality.addEventListener('change', () => {
    applyTier();
    requestDraw();
  });
  reduced.addEventListener('change', () => {
    motion = !reduced.matches;
    playing = false;
    cycle = false;
    controlsUI();
    requestDraw();
  });
  canvas.addEventListener('keydown', (e) => {
    if (!free) return;
    const step = 0.12,
      s = new T.Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
    switch (e.key) {
      case 'ArrowLeft':
        s.theta -= step;
        break;
      case 'ArrowRight':
        s.theta += step;
        break;
      case 'ArrowUp':
        s.phi = Math.max(0.05, s.phi - step);
        break;
      case 'ArrowDown':
        s.phi = Math.min(orbit.maxPolarAngle, s.phi + step);
        break;
      case '+':
      case '=':
        s.radius = Math.max(orbit.minDistance, s.radius * 0.9);
        break;
      case '-':
        s.radius = Math.min(orbit.maxDistance, s.radius * 1.1);
        break;
      default:
        return;
    }
    e.preventDefault();
    camera.position.setFromSpherical(s).add(orbit.target);
    orbit.update();
    requestDraw();
  });
  new ResizeObserver(requestDraw).observe(stage);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    stop();
    canvas.style.visibility = 'hidden';
    status.hidden = false;
    status.textContent = 'Restoring the coast…';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    sky.invalidate();
    applyTier();
    requestDraw();
  });
  applyTier();
  controlsUI();
  // Hold the first frame until the shaders are linked; the canvas stays hidden meanwhile.
  let warmed = false;
  sky.update(); // scene.environment is part of every lit shader's key
  warmShaders(renderer, [[land, camera, opaque], [water, camera, opaque]]).then((ms) => {
    warmed = true;
    console.info(`Tidelight shaders ready in ${Math.round(ms)} ms (tier ${tier})`);
    requestDraw();
  });
  return {
    setVisible(value) {
      if (visible === value) return;
      visible = value;
      sound.visible(value);
      if (value) requestDraw();
      else stop();
    },
  };
}
