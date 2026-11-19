import * as T from 'three';
import { pointGap } from './nav.js';
import { palmEnvelope } from './physics.js';

// Sample the actual stave triangles once. A cooper works along a longitudinal
// stave, so interpolation between adjacent samples follows its tapered facets.
export function inspectCask(actor, barrel) {
  const caster = new T.Raycaster(),
    p = new T.Vector3(),
    normal = new T.Vector3();
  const stave = barrel.children[0],
    rails = [],
    sockets = [];
  barrel.updateWorldMatrix(true, true);
  for (let hand = 0; hand < 2; hand++) {
    const rail = [];
    for (let j = 0; j <= 8; j++) {
      // In barrel coordinates +Y runs along its length and +X faces the cooper.
      const axial = (0.21 + (hand - 0.5) * 0.29 + (j / 8 - 0.5) * 0.12) / barrel.scale.y;
      barrel.localToWorld(p.set(1.3, axial, -0.24));
      barrel.localToWorld(normal.set(0, axial, -0.24));
      normal.sub(p).normalize();
      caster.set(p, normal);
      const hit = caster.intersectObject(stave, false)[0];
      if (!hit) throw new Error('Cooper inspection ray missed the stave');
      rail.push(barrel.worldToLocal(hit.point).add(new T.Vector3(0.054, 0, 0)));
    }
    const socket = new T.Object3D();
    barrel.add(socket);
    sockets.push(socket);
    rails.push(rail);
  }
  return (t) => {
    for (let i = 0; i < 2; i++) {
      const u = 3.999 * (1 + Math.sin(t * 1.34 + 0.7 * i)),
        j = Math.floor(u);
      sockets[i].position.lerpVectors(rails[i][j], rails[i][j + 1], u - j);
    }
    // Roll the pad onto the stave. The centre of a palm sits a different
    // distance from timber as the wrist bends. Use the same tapered hand
    // envelope as the garment and scene collision solvers.
    const surface = barrel.userData.staveSurface;
    for (let iteration = 0; iteration < 3; iteration++) {
      actor.grasp(sockets);
      if (iteration === 2) break;
      let adjust = false;
      for (let i = 0; i < 2; i++) {
        let clearance = Infinity;
        for (let j = 0; j <= 4; j++) {
          const u = j / 4;
          p.set(0, T.MathUtils.lerp(palmEnvelope.y0, palmEnvelope.y1, u), 0);
          actor.hands[i].localToWorld(p);
          barrel.parent.worldToLocal(p);
          const radius = actor.g.scale.y * T.MathUtils.lerp(palmEnvelope.r0, palmEnvelope.r1, u);
          clearance = Math.min(clearance, pointGap(surface, p.x, p.y, p.z) - radius);
        }
        const correction = (0.001 - clearance) / (barrel.scale.x * 0.9);
        if (Math.abs(correction) > 0.0005) {
          sockets[i].position.x += correction;
          adjust = true;
        }
      }
      if (!adjust) break;
    }
  };
}

export function cellarRake(actor, shaft) {
  const stand = new T.Group();
  actor.g.add(stand);
  stand.add(shaft);
  shaft.position.set(0, -0.17, 0);
  stand.rotation.z = -0.45;
  const grips = [-1, 1].map((s) => {
    const socket = new T.Object3D();
    socket.position.set(s * 0.018, s * 0.13, 0);
    stand.add(socket);
    return socket;
  });
  return (t) => {
    const stroke = 0.5 - 0.5 * Math.cos(t * 1.65),
      lag = actor.dynamics.lag;
    stand.position.set(lag[0], 1.17 + 0.13 * stroke + lag[1], 0.31 + lag[2]);
    stand.rotation.x = -0.21 + 0.2 * stroke;
    actor.grasp(grips);
  };
}
