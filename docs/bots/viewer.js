import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { warmShaders } from '../assets/sip-warm.js';

const asset = new URL('./hummin.glb', import.meta.url);
const keyOrbits = {
  ArrowLeft: [Math.PI / 12, 0],
  ArrowRight: [-Math.PI / 12, 0],
  ArrowUp: [0, -Math.PI / 20],
  ArrowDown: [0, Math.PI / 20],
};

export function mountBots(panel) {
  const stage = panel.querySelector('.bots-stage');
  const status = panel.querySelector('.bots-status');
  const buttons = panel.querySelectorAll('[data-bots-action]');
  const turnaroundButton = panel.querySelector('[data-bots-action="turnaround"]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 680px), (pointer: coarse)');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.03, 60);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  let load, renderer, controls, mixer, idle, expression, actions, model;
  let visible = false, inView = true, turning = false, lost = false;
  let pendingFrame = 0, lastFrame = 0, elapsed = 0, nextBlink = 4.6;
  let width = 0, height = 0, pixelRatio = 0, frames = 0;
  let warmup, warmed = false, contextVersion = 0;

  function setReady(ready, message) {
    stage.dataset.botsReady = String(ready);
    status.hidden = ready;
    if (message) status.textContent = message;
    if (renderer) renderer.domElement.style.visibility = ready ? 'visible' : 'hidden';
    for (const button of buttons) button.disabled = !ready;
  }

  function schedule() {
    if (!pendingFrame && renderer && visible && inView && !document.hidden && !lost) {
      pendingFrame = requestAnimationFrame(paint);
    }
  }

  function pause() {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
    lastFrame = 0;
  }

  function resetView() {
    if (!width || !height) return;
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const vertical = size.y * 0.54 / halfFov;
    const horizontal = Math.max(size.x, size.z) * 0.53 / (halfFov * camera.aspect);
    const distance = Math.max(vertical, horizontal) + size.z * 0.38;
    controls.target.copy(center);
    camera.position.copy(center);
    camera.position.y += size.y * 0.10;
    camera.position.z += distance;
    controls.minDistance = Math.min(distance * 0.62, size.y * 1.2);
    controls.maxDistance = distance * 2;
    controls.update();
    schedule();
  }

  function fit() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, phone.matches ? 1.5 : 2);
    if (!w || !h) return false;
    if (width !== w || height !== h || pixelRatio !== dpr) {
      const firstFit = !width;
      width = w;
      height = h;
      pixelRatio = dpr;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setDrawingBufferSize(w, h, dpr);
      if (firstFit) resetView();
    }
    return true;
  }

  function orbit(yaw, pitch = 0) {
    spherical.setFromVector3(offset.copy(camera.position).sub(controls.target));
    spherical.theta += yaw;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + pitch, controls.minPolarAngle, controls.maxPolarAngle);
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    controls.update();
    schedule();
  }

  function setTurning(next) {
    turning = next;
    turnaroundButton.setAttribute('aria-pressed', String(next));
    schedule();
  }

  function play(name) {
    expression?.stop();
    expression = actions.get(name).reset().setLoop(THREE.LoopOnce, 1).play();
    nextBlink = elapsed + 4.6;
    schedule();
  }

  function prepareShaders() {
    if (warmup) return;
    const version = contextVersion;
    warmup = warmShaders(renderer, [[scene, camera, null]]).then(() => {
      if (version !== contextVersion) return;
      warmup = undefined;
      warmed = true;
      schedule();
    });
  }

  function paint(now) {
    pendingFrame = 0;
    if (!warmed) {
      if (fit()) prepareShaders();
      return;
    }
    if (lastFrame && phone.matches && now - lastFrame < 31) {
      schedule();
      return;
    }
    const start = performance.now();
    if (!fit()) return;
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.08) : 0;
    lastFrame = now;
    elapsed += dt;
    if (turning) orbit(dt * 0.85);
    if (!reducedMotion.matches && !expression && elapsed >= nextBlink) play('Blink');
    mixer.update(dt);
    renderer.render(scene, camera);
    if (stage.dataset.botsReady !== 'true') setReady(true);
    stage.dataset.botsRender = String(++frames);
    stage.dataset.botsFrameMs = (performance.now() - start).toFixed(2);
    stage.dataset.botsDraws = String(renderer.info.render.calls);
    if (!reducedMotion.matches || turning || expression) schedule();
    else lastFrame = 0;
  }

  function initialize(gltf) {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.visibility = 'hidden';
    stage.append(canvas);
    scene.add(new THREE.HemisphereLight(0xf2f8ff, 0x96705b, 2.15));
    const key = new THREE.DirectionalLight(0xffead5, 2.75);
    key.position.set(-3, 5, 4);
    const fill = new THREE.DirectionalLight(0xc1d9ff, 1.1);
    fill.position.set(3, 2, 1);
    const rim = new THREE.DirectionalLight(0xe2edff, 2.1);
    rim.position.set(1, 3, -4);
    model = gltf.scene;
    scene.add(key, fill, rim, model);
    const bounds = new THREE.Box3().setFromObject(model);
    bounds.getCenter(center);
    bounds.getSize(size);
    controls = new OrbitControls(camera, stage);
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.17;
    controls.maxPolarAngle = Math.PI * 0.63;
    controls.addEventListener('change', schedule);
    controls.addEventListener('start', () => setTurning(false));

    mixer = new THREE.AnimationMixer(model);
    actions = new Map(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
    idle = actions.get('Idle');
    idle.play();
    idle.paused = reducedMotion.matches;
    mixer.addEventListener('finished', ({ action }) => {
      if (action === expression) expression = undefined;
    });

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      lost = true;
      warmed = false;
      warmup = undefined;
      contextVersion += 1;
      pause();
      setReady(false, 'Restoring Hummin…');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      lost = false;
      schedule();
    });
  }

  stage.addEventListener('keydown', event => {
    if (stage.dataset.botsReady !== 'true' || !Object.hasOwn(keyOrbits, event.key)) return;
    event.preventDefault();
    setTurning(false);
    orbit(...keyOrbits[event.key]);
  });
  panel.addEventListener('click', event => {
    const action = event.target.closest('[data-bots-action]')?.dataset.botsAction;
    if (!action || stage.dataset.botsReady !== 'true') return;
    if (action === 'turnaround') {
      if (reducedMotion.matches) orbit(Math.PI / 2);
      else setTurning(!turning);
    } else if (action === 'reset') {
      setTurning(false);
      resetView();
    } else {
      play(action === 'blink' ? 'Blink' : 'Smile');
    }
  });

  const resize = new ResizeObserver(schedule);
  resize.observe(stage);
  const intersection = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) schedule();
    else pause();
  });
  intersection.observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else schedule();
  });
  reducedMotion.addEventListener('change', () => {
    if (idle) {
      idle.paused = reducedMotion.matches;
      if (idle.paused) idle.time = 0;
    }
    if (reducedMotion.matches) setTurning(false);
    schedule();
  });

  return {
    async show() {
      visible = true;
      if (!renderer) {
        load ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(asset.href).then(gltf => {
          const clips = new Set(gltf.animations.map(clip => clip.name));
          if (!['Idle', 'Blink', 'Smile'].every(name => clips.has(name))) {
            throw new Error('Hummin GLB is missing an animation clip');
          }
          return gltf;
        }).catch(error => {
          load = undefined;
          throw error;
        });
        const gltf = await load;
        if (visible && !renderer) initialize(gltf);
      }
      schedule();
    },
    hide() {
      visible = false;
      setTurning(false);
      pause();
    },
  };
}
