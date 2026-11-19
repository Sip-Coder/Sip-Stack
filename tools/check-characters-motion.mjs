// Node 22+, Chromium and three@0.170.0. Example:
// THREE_ROOT=/path/to/three CHROME=/usr/bin/chromium node tools/check-characters-motion.mjs
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

// Executed as an ES module inside Chromium so procedural CanvasTextures and
// BufferGeometry are identical to the production models. WebGL is unnecessary.
async function measure() {
  const T = await import('three');
  const { createActor } = await import('/characters/rig.js');
  const { createController, FIXED_DT, PROPS } = await import('/characters/motion.js');
  const { buildSippy } = await import('/characters/sippy.js');
  const { buildRoma } = await import('/characters/roma.js');
  const { buildHummin } = await import('/characters/hummin.js');
  const failures = [],
    results = {};
  const point = new T.Vector3(),
    chestInverse = new T.Matrix4(),
    toChest = new T.Matrix4();
  for (const [name, height, build] of [
    ['sippy', 1.78, buildSippy],
    ['roma', 1.68, buildRoma],
    ['hummin', 1.85, buildHummin],
  ]) {
    const rig = createActor(name, height),
      animate = build(rig),
      controller = createController(rig);
    const input = { x: 0, z: 0, run: false, roll: false, jump: false, emote: false };
    // Extract actual toe and heel vertices in ankle-local coordinates. Monitoring
    // both picks up rotation/skating around a stationary IK anchor.
    rig.root.updateMatrixWorld(true);
    const soles = controller.contacts.map((contact) => {
      const samples = [],
        inverse = contact.ankle.matrixWorld.clone().invert();
      let bottom = Infinity;
      contact.ankle.traverse((node) => {
        if (!node.isMesh) return;
        const m = new T.Matrix4().multiplyMatrices(inverse, node.matrixWorld),
          verts = node.geometry.getAttribute('position');
        for (let i = 0; i < verts.count; i++) {
          const p = new T.Vector3().fromBufferAttribute(verts, i).applyMatrix4(m);
          samples.push(p);
          bottom = Math.min(bottom, p.y);
        }
      });
      const tread = samples.filter((p) => p.y <= bottom + 0.002).sort((a, b) => a.z - b.z);
      if (tread.length < 2) throw Error('Missing foot tread ' + name + ' ' + contact.side);
      return { locked: false, points: [tread[0], tread.at(-1)], starts: [new T.Vector3(), new T.Vector3()] };
    });
    const meshes = [],
      limbs = [];
    const torsos = [];
    const bones = new Set(rig.joints);
    function findChestShell(node) {
      if (bones.has(node)) return;
      if (node.isMesh) {
        const g = node.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        const box = g.boundingBox;
        if (box.min.x < -0.065 && box.max.x > 0.065 && box.max.y - box.min.y > 0.15) torsos.push(node);
      }
      node.children.forEach(findChestShell);
    }
    rig.chest.children.forEach(findChestShell);
    if (!torsos.length) throw Error('No chest surface selected for ' + name);
    const ray = new T.Raycaster(),
      start = new T.Vector3(),
      end = new T.Vector3(),
      ab = new T.Vector3();
    rig.root.traverse((node) => {
      if (node.isMesh) meshes.push(node);
    });
    for (const side of ['L', 'R'])
      for (const joint of ['forearm', 'hand', 'shin', 'foot']) {
        // Direct geometry on distal joints excludes intentionally held props.
        for (const node of rig[joint + side].children) if (node.isMesh) limbs.push(node);
      }
    function pose() {
      const frame = controller.step(FIXED_DT, input);
      animate(frame);
      controller.finishPose();
      rig.root.updateMatrixWorld(true);
      return frame;
    }
    function bounds() {
      let min = Infinity,
        max = -Infinity;
      for (const mesh of meshes) {
        if (!mesh.visible) continue;
        const m = mesh.matrixWorld.elements,
          vertices = mesh.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          const y = m[1] * vertices.getX(i) + m[5] * vertices.getY(i) + m[9] * vertices.getZ(i) + m[13];
          min = Math.min(min, y);
          max = Math.max(max, y);
        }
      }
      return { min, max };
    }
    // A conservative ellipsoid strictly inside the ribcage. A distal limb
    // vertex inside it establishes a collision, even through a moving coat.
    // This probe does not claim exhaustive triangle/triangle clearance.
    function coreIntersections() {
      chestInverse.copy(rig.chest.matrixWorld).invert();
      for (const mesh of limbs) {
        if (!mesh.visible) continue;
        toChest.multiplyMatrices(chestInverse, mesh.matrixWorld);
        const vertices = mesh.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          point.fromBufferAttribute(vertices, i).applyMatrix4(toChest);
          if ((point.x / 0.068) ** 2 + ((point.y - 0.045) / 0.093) ** 2 + (point.z / 0.039) ** 2 < 1)
            return true;
        }
      }
      return false;
    }

    // Index central chest panels in chest-local space; dynamic jacket hems
    // are reindexed after posing so tests follow the rendered cloth.
    const cells = new Map(),
      cellSize = 0.022,
      chestBox = new T.Box3();
    const key = (x, y, z) => (x + 64) * 16384 + (y + 64) * 128 + z + 64;
    function indexShells() {
      cells.clear();
      chestBox.makeEmpty();
      chestInverse.copy(rig.chest.matrixWorld).invert();
      for (const mesh of torsos) {
        toChest.multiplyMatrices(chestInverse, mesh.matrixWorld);
        const g = mesh.geometry,
          p = g.getAttribute('position'),
          count = g.index?.count ?? p.count;
        for (let i = 0; i < count; i += 3) {
          const vertices = [0, 1, 2].map((d) =>
            new T.Vector3()
              .fromBufferAttribute(p, g.index ? g.index.getX(i + d) : i + d)
              .applyMatrix4(toChest),
          );
          vertices.shell = mesh.material.color.getHexString();
          const box = new T.Box3().setFromPoints(vertices);
          chestBox.union(box);
          for (let x = Math.floor(box.min.x / cellSize); x <= Math.floor(box.max.x / cellSize); x++)
            for (let y = Math.floor(box.min.y / cellSize); y <= Math.floor(box.max.y / cellSize); y++)
              for (let z = Math.floor(box.min.z / cellSize); z <= Math.floor(box.max.z / cellSize); z++) {
                const id = key(x, y, z);
                if (!cells.has(id)) cells.set(id, []);
                cells.get(id).push(vertices);
              }
        }
      }
    }
    indexShells();
    const cloth = torsos.some((m) => m.geometry.getAttribute('position').usage === T.DynamicDrawUsage);
    const edgeRay = new T.Ray(),
      box = new T.Box3(),
      hit = new T.Vector3(),
      dir = new T.Vector3();
    function piercingEdge(a, b) {
      box.setFromPoints([a, b]);
      if (!box.intersectsBox(chestBox)) return false;
      dir.subVectors(b, a);
      const length = dir.length();
      if (length < 1e-8) return false;
      edgeRay.set(a, dir.divideScalar(length));
      for (let x = Math.floor(box.min.x / cellSize); x <= Math.floor(box.max.x / cellSize); x++)
        for (let y = Math.floor(box.min.y / cellSize); y <= Math.floor(box.max.y / cellSize); y++)
          for (let z = Math.floor(box.min.z / cellSize); z <= Math.floor(box.max.z / cellSize); z++) {
            const bucket = cells.get(key(x, y, z));
            if (!bucket) continue;
            for (const tri of bucket) {
              if (!edgeRay.intersectTriangle(tri[0], tri[1], tri[2], false, hit)) continue;
              const distance = hit.distanceTo(a);
              if (distance > 1e-6 && distance < length - 1e-6) return tri.shell;
            }
          }
      return false;
    }
    const a = new T.Vector3(),
      b = new T.Vector3(),
      d = new T.Vector3();
    function piercedShell() {
      if (cloth) indexShells();
      for (const mesh of limbs) {
        // Handheld props hang from separate subgroups. Check skin, glove,
        // articulated fingers and cuffs attached directly to these joints.
        if (!mesh.visible || !/^(hand|forearm)/.test(mesh.parent.name)) continue;
        toChest.multiplyMatrices(chestInverse, mesh.matrixWorld);
        const g = mesh.geometry,
          p = g.getAttribute('position');
        if (!g.boundingBox) g.computeBoundingBox();
        if (!box.copy(g.boundingBox).applyMatrix4(toChest).intersectsBox(chestBox)) continue;
        const count = g.index?.count ?? p.count;
        for (let i = 0; i < count; i += 3) {
          a.fromBufferAttribute(p, g.index ? g.index.getX(i) : i).applyMatrix4(toChest);
          b.fromBufferAttribute(p, g.index ? g.index.getX(i + 1) : i + 1).applyMatrix4(toChest);
          d.fromBufferAttribute(p, g.index ? g.index.getX(i + 2) : i + 2).applyMatrix4(toChest);
          const shell = piercingEdge(a, b) || piercingEdge(b, d) || piercingEdge(d, a);
          if (shell) return mesh.parent.name + ' / ' + shell;
        }
      }
      return null;
    }

    function segmentCrossings() {
      for (const side of ['L', 'R'])
        for (const [a, b] of [
          ['forearm', 'hand'],
          ['shin', 'foot'],
        ]) {
          start.setFromMatrixPosition(rig[a + side].matrixWorld);
          end.setFromMatrixPosition(rig[b + side].matrixWorld);
          ab.subVectors(end, start);
          ray.near = 0;
          const abLength = ab.length();
          ray.far = abLength * 0.9;
          start.addScaledVector(ab, 0.05);
          const direction = ab.normalize();
          ray.set(start, direction);
          if (ray.intersectObjects(torsos, false).length) return true;
          end.addScaledVector(direction, -abLength * 0.05);
          ray.set(end, direction.negate());
          if (ray.intersectObjects(torsos, false).length) return true;
        }
      return false;
    }
    controller.reset(0, 0);
    pose();
    const lineup = bounds();
    const result = (results[name] = { heightM: lineup.max - lineup.min, phases: {} });
    function check(ok, message) {
      if (!ok) failures.push(name + ' ' + message);
    }
    check(Math.abs(result.heightM - height) / height < 0.02, 'lineup height');

    for (const action of ['walk', 'run', 'turn', 'jump', 'roll', 'emote']) {
      controller.reset(-10, 0); // Keep the level-floor trial clear of all props.
      for (const sole of soles) sole.locked = false;
      Object.assign(input, { x: 0, z: 0, run: false, jump: false, roll: false, emote: false });
      if (['walk', 'run', 'turn', 'roll'].includes(action)) input.z = 1;
      input.run = ['run', 'turn', 'roll'].includes(action);
      let worstSlip = 0,
        plantedFrames = 0,
        min = Infinity,
        max = -Infinity,
        torsoFrames = 0,
        crossingFrames = 0,
        speed = 0,
        samples = 0,
        actionFrames = 0,
        landFrames = 0,
        apex = 0;
      const shellHits = {};
      const frames = action === 'emote' ? 130 : action === 'jump' ? 100 : 150;
      for (let f = 0; f < frames; f++) {
        input.jump = action === 'jump' && f === 8;
        input.roll = action === 'roll' && f === 44;
        input.emote = action === 'emote' && f === 0;
        if (action === 'turn' && f > 45) {
          const a = (f - 45) * 0.048;
          input.x = Math.sin(a);
          input.z = Math.cos(a);
        }
        const oldX = rig.root.position.x,
          oldZ = rig.root.position.z;
        const state = pose();
        if (action === 'jump') {
          if (state.state === 'land') landFrames++;
          apex = Math.max(apex, rig.root.position.y);
        }
        if (action === 'roll' && state.state === 'roll') actionFrames++;
        if ((action === 'walk' || action === 'run') && f >= 60) {
          speed += Math.hypot(rig.root.position.x - oldX, rig.root.position.z - oldZ) / FIXED_DT;
          samples++;
        }
        for (let k = 0; k < 2; k++) {
          const c = controller.contacts[k],
            s = soles[k];
          if (c.planted) {
            for (let j = 0; j < s.points.length; j++) {
              point.copy(s.points[j]).applyMatrix4(c.ankle.matrixWorld);
              if (s.locked) worstSlip = Math.max(worstSlip, s.starts[j].distanceTo(point));
              else s.starts[j].copy(point);
            }
            if (s.locked) plantedFrames++;
          }
          s.locked = c.planted;
        }
        const extent = bounds();
        min = Math.min(min, extent.min);
        // Airborne separation is expected. Every grounded phase, including
        // both landing absorption and the entire shoulder roll, needs support.
        if (state.state !== 'jump' || rig.root.position.y < 0.0001) max = Math.max(max, extent.min);
        if (coreIntersections()) torsoFrames++;
        if (segmentCrossings()) crossingFrames++;
        const joint = piercedShell();
        if (joint) (shellHits[joint] ??= []).push(f);
      }
      const phase = (result.phases[action] = {
        floorMinM: min,
        groundedMaxM: max,
        torsoCoreFrames: torsoFrames,
        axisCrossingFrames: crossingFrames,
        shellHits,
      });
      if (samples) {
        phase.measuredMps = speed / samples;
        const expected = action === 'walk' ? 1.13 : 3.89;
        check(Math.abs(phase.measuredMps - expected) < expected * 0.1, action + ' speed');
      }
      if (['walk', 'run', 'turn'].includes(action)) {
        phase.slipM = worstSlip;
        phase.plantedSamples = plantedFrames;
        check(plantedFrames > 25 && worstSlip < 0.02, action + ' planted drift');
      }
      if (action === 'jump') {
        Object.assign(phase, { landFrames, apex });
        check(landFrames > 1 && apex > 0.1, 'jump/land transition');
      }
      if (action === 'roll') {
        phase.rollFrames = actionFrames;
        check(actionFrames > 10, 'roll transition');
      }
      check(min >= -0.0001, action + ' ground penetration');
      check(max <= 0.01, action + ' ground separation');
      check(torsoFrames === 0, action + ' distal limb entered torso core');
      check(crossingFrames === 0, action + ' limb axis crossed a torso panel');
      check(Object.keys(shellHits).length === 0, action + ' hand/forearm geometry crossed a chest shell');
    }
    result.props = {};
    for (const prop of PROPS) {
      controller.reset(prop.x, prop.z - prop.depth / 2 - 1.0);
      Object.assign(input, { x: 0, z: 1, run: false, jump: false, roll: false, emote: false });
      let top = 0;
      for (let f = 0; f < 320; f++) {
        pose();
        top = Math.max(top, rig.root.position.y);
      }
      const endZ = rig.root.position.z;
      result.props[prop.kind] = { highestRootM: top, endZ };
      if (prop.kind === 'crate') {
        const faceZ = prop.z - prop.depth / 2 - controller.capsuleRadius;
        check(Math.abs(endZ - faceZ) < 0.01 && top < 0.01, 'blocked by crate');
      } else {
        check(endZ > prop.z + prop.depth / 2 && Math.abs(top - prop.height) < 0.01, 'traversed ' + prop.kind);
      }
    }
  }
  return { results, failures };
}

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const three =
  process.env.THREE_ROOT || resolve(dirname(createRequire(import.meta.url).resolve('three')), '..');
if (JSON.parse(await readFile(join(three, 'package.json'), 'utf8')).version !== '0.170.0')
  throw Error('Expected three@0.170.0');
const page = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">try{const result=await (${measure.toString()})();await fetch('/result',{method:'POST',body:JSON.stringify(result)});}
catch(e){await fetch('/result',{method:'POST',body:JSON.stringify({error:String(e.stack||e)})});}</script>`;
let finish;
const done = new Promise((resolve) => {
  finish = resolve;
});
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path === '/result' && req.method === 'POST') {
      let data = '';
      for await (const chunk of req) data += chunk;
      const value = JSON.parse(data);
      res.end();
      finish(value);
      return;
    }
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(page);
      return;
    }
    let file;
    if (path.startsWith('/three/')) file = join(three, path.slice(7));
    else if (path.startsWith('/characters/')) file = join(docs, path);
    else {
      res.writeHead(404).end();
      return;
    }
    const data = await readFile(file);
    res.setHeader('Content-Type', 'application/javascript');
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
const profile = await mkdtemp(join(tmpdir(), 'characters-motion-'));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const chrome = spawn(
  process.env.CHROME || '/usr/bin/chromium',
  [
    '--headless',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--user-data-dir=' + profile,
    'http://127.0.0.1:' + server.address().port + '/',
  ],
  { stdio: 'ignore' },
);
chrome.on('error', (e) => finish({ error: e.message }));
chrome.on('exit', (code) => finish({ error: 'Chrome exited before sending measurements (' + code + ')' }));
const timeout = setTimeout(() => finish({ error: 'Browser probe timeout' }), 180000);
try {
  const result = await done;
  console.log(JSON.stringify(result, null, 2));
  if (result.error || result.failures?.length) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  const closed = chrome.exitCode === null ? once(chrome, 'close') : Promise.resolve();
  chrome.kill();
  await closed;
  server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
