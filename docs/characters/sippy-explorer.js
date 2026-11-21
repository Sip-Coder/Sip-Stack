// The explorer's field kit. All pattern coordinates are local standing-height units.
import * as T from 'three';
import { rearGrid } from './sippy-hips.js';
import { shell, torsoPoint } from './sippy-tailoring.js';
import { addVineEmbroidery } from './embroidery.js';

const tau = Math.PI * 2;
const mix = T.MathUtils.lerp;
const smooth = T.MathUtils.smoothstep;

export function quiltFinish(material) {
  material.onBeforeCompile = (s) => {
    s.vertexShader =
      'varying vec2 quiltUV;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nquiltUV=uv;');
    s.fragmentShader =
      'varying vec2 quiltUV;\n' +
      s.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
       vec2 q=vec2(quiltUV.x*17.,quiltUV.y*8.);
       vec2 quiltSeam=abs(fract(vec2(q.x+q.y,q.x-q.y)+.5)-.5);
       float seam=min(quiltSeam.x,quiltSeam.y);
       float line=1.-smoothstep(.015,.058+fwidth(seam),seam);
       float pad=smoothstep(.015,.31,seam);
       diffuseColor.rgb*=.80+.24*pad;
       diffuseColor.rgb+=.0035*line*(.65+.35*sin(345.*quiltUV.y));`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor+=.075*(1.-smoothstep(.01,.16,min(abs(fract(quiltUV.x*17.+quiltUV.y*8.+.5)-.5),abs(fract(quiltUV.x*17.-quiltUV.y*8.+.5)-.5))));',
        );
  };
  material.customProgramCacheKey = () => 'sippy-explorer-quilt';
}

export function outfitExplorer(rig, tailoring, m, h) {
  const { group, mesh, ellipsoid, rings, stroke, vec } = h;
  const chest = rig.chest,
    surfaces = tailoring.surfaces;
  const add = (id, obj) => {
    obj.userData.patternPiece = true;
    (surfaces[id] ??= []).push(obj);
    return obj;
  };
  const addShell = (id, parent, material, rows, cols, sample) => {
    const geometry = shell(rows, cols, sample);
    const piece = add(id, mesh(parent, geometry, material));
    piece.userData.mobileGeometry = geometry.userData.mobileGeometry;
    return piece;
  };
  const bead = (parent, mat, x, y, z, r) => ellipsoid(parent, mat, x, y, z, r, r, r);
  function path(parent, mat, pts, r) {
    return stroke(parent, mat, pts, r, 7);
  }
  function edgeRing(parent, mat, x, y, z, rx, ry, rz, axis = 'z') {
    const o = mesh(parent, new T.TorusGeometry(1, 0.078, 7, 36), mat, x, y, z);
    if (axis === 'x') o.rotation.y = Math.PI / 2;
    o.scale.set(rx, ry, rz);
    return o;
  }
  function vineDisk(parent, x, y, z, scale, side) {
    const motif = group(parent, x, y, z);
    motif.rotation.y = side * Math.PI * 0.5;
    motif.scale.setScalar(scale);
    for (const [x, y, r] of [
      [-0.26, 0.12, 0.132],
      [0.025, 0.14, 0.14],
      [0.27, 0.1, 0.12],
      [-0.13, -0.13, 0.13],
      [0.13, -0.14, 0.13],
      [0, -0.36, 0.12],
    ])
      ellipsoid(motif, m.gold, x, y, 0, r, r, 0.055);
    path(
      motif,
      m.gold,
      [
        [0, 0.23, 0],
        [0.025, 0.42, 0.005],
        [0.2, 0.52, 0],
      ],
      0.043,
    );
    path(
      motif,
      m.gold,
      [
        [0.04, 0.36, 0],
        [-0.16, 0.5, 0],
        [-0.32, 0.46, 0],
        [-0.18, 0.32, 0],
        [0.04, 0.36, 0],
      ],
      0.032,
    );
  }
  // The zipper tapes and two drawcords stay clearly legible through the open fronts.
  const drawcord = group(chest, 0, 0.135, 0.084);
  drawcord.name = 'Sippy hood drawcords';
  for (const side of [-1, 1]) {
    const sx = side * 0.012;
    const yEnd = side > 0 ? -0.083 : -0.071;
    path(
      drawcord,
      m.knit,
      [
        [sx, 0.01, -0.018],
        [sx * 1.12, -0.015, -0.006],
        [sx * 1.08, -0.04, 0.0005],
        [sx * 0.8, yEnd, 0.001],
      ],
      0.0019,
    );
    ellipsoid(drawcord, m.gold, sx * 0.8, yEnd - 0.003, 0.001, 0.0021, 0.0048, 0.0021);
  }
  const hoodShape = addShell('hood', chest, m.waistcoat, 11, 48, (v, u, inner) => {
    const a = mix(0.3, tau - 0.3, u),
      cs = Math.cos(a);
    const y = mix(0.163 + 0.001 * cs - 0.007 * Math.max(0, -cs), 0.178 + 0.001 * cs, v);
    return torsoPoint(y, a, 1.13, (inner ? 0.004 : 0.006) + 0.0035 * Math.sin(v * Math.PI));
  });
  hoodShape.name = 'Sippy folded burgundy hood';
  // Band curves behind the neck and forward at either end to the padded earcups.
  const headphones = group(chest, 0, 0.122, 0.082);
  headphones.scale.z = 0.81;
  headphones.name = 'Sippy burgundy studio headphones';
  const band = h.sweep(
    headphones,
    m.pad,
    [
      [-0.058, -0.005, 0.002],
      [-0.064, 0.009, -0.008],
      [-0.069, 0.036, -0.033],
      [-0.067, 0.047, -0.07],
      [-0.044, 0.046, -0.112],
      [0, 0.044, -0.139],
      [0.044, 0.046, -0.112],
      [0.067, 0.047, -0.07],
      [0.069, 0.036, -0.033],
      [0.064, 0.009, -0.008],
      [0.058, -0.005, 0.002],
    ],
    0.0042,
    0.004,
    0.85,
  );
  const bp = band.geometry.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const f = smooth(-bp.getZ(i), 0.004, 0.078);
    bp.setY(i, bp.getY(i) + 0.015 * f);
    bp.setZ(i, bp.getZ(i) - 0.014 * f);
  }
  band.geometry.computeVertexNormals();
  add('headphones', band);
  for (const side of [-1, 1]) {
    const cup = group(headphones, side * 0.064, 0.0, 0);
    cup.rotation.y = side * -0.18;
    cup.rotation.z = side * -0.32;
    cup.rotation.x = -0.26;
    add('headphones', ellipsoid(cup, m.pad, 0, 0, 0, 0.014, 0.023, 0.012));
    ellipsoid(cup, m.leather, side * 0.008, 0, 0.004, 0.014, 0.0255, 0.0192);
    edgeRing(cup, m.gold, side * 0.0177, 0, 0.004, 0.0158, 0.0213, 0.0131, 'x');
    ellipsoid(cup, m.knit, side * 0.018, 0, 0.004, 0.004, 0.0192, 0.0144);
    vineDisk(cup, side * 0.022, 0, 0.005, 0.02, side);
    path(
      cup,
      m.gold,
      [
        [side * 0.005, 0.021, -0.004],
        [side * 0.009, 0.03, -0.005],
        [side * 0.015, 0.031, -0.006],
      ],
      0.0014,
    );
  }
  // A domed vegetable-tanned leather pack: broad enough for a field notebook.
  const pack = group(chest, 0, 0.062, -0.078);
  pack.name = 'Sippy explorer backpack';
  const packEnvelope = rings(
    [
      [-0.167, 0.039, 0.018, -0.021],
      [-0.16, 0.062, 0.027, -0.024],
      [-0.145, 0.073, 0.035, -0.026],
      [-0.093, 0.077, 0.036, -0.027],
      [-0.027, 0.076, 0.034, -0.026],
      [0.018, 0.068, 0.031, -0.022],
      [0.041, 0.05, 0.024, -0.019],
      [0.051, 0.017, 0.013, -0.018],
    ],
    48,
  );
  const bx = packEnvelope.attributes.position;
  for (let i = 0; i < bx.count; i++) {
    const x = bx.getX(i),
      y = bx.getY(i),
      z = bx.getZ(i);
    const v = smooth(y, -0.16, 0.047);
    bx.setXYZ(
      i,
      x * 1.09,
      y * 1.04,
      z +
        0.002 +
        0.004 * (x / 0.077) ** 2 * (0.55 + 0.45 * v) +
        smooth(z, -0.028, 0.006) *
          (0.008 * Math.exp(-(((Math.abs(x) - 0.056) / 0.017) ** 2)) - 0.023 * Math.exp(-((x / 0.042) ** 2))),
    );
  }
  packEnvelope.computeVertexNormals();
  add('backpack', mesh(pack, packEnvelope, m.saddle));
  const lid = mesh(
    pack,
    rings(
      [
        [-0.066, 0.059, 0.009, -0.059],
        [-0.061, 0.071, 0.012, -0.058],
        [-0.028, 0.074, 0.012, -0.055],
        [0.007, 0.066, 0.014, -0.045],
        [0.035, 0.05, 0.011, -0.034],
        [0.045, 0.027, 0.009, -0.03],
      ],
      36,
    ),
    m.saddleEdge,
  );
  lid.name = 'Curved satchel flap';
  path(
    pack,
    m.saddleEdge,
    [
      [-0.054, -0.15, -0.046],
      [-0.068, -0.12, -0.05],
      [-0.07, -0.05, -0.051],
      [-0.065, 0.003, -0.044],
      [0, 0.044, -0.038],
      [0.065, 0.003, -0.044],
      [0.07, -0.05, -0.051],
      [0.068, -0.12, -0.05],
      [0.054, -0.15, -0.046],
    ],
    0.0015,
  );
  path(
    pack,
    m.saddle,
    [
      [-0.026, 0.035, -0.014],
      [-0.023, 0.062, -0.015],
      [0, 0.067, -0.017],
      [0.023, 0.062, -0.015],
      [0.026, 0.035, -0.014],
    ],
    0.005,
  );
  const fitStraps = [],
    strapAttachments = [];
  for (const sign of [-1, 1]) {
    const x = sign * 0.035;
    path(
      pack,
      m.saddle,
      [
        [x, 0.021, -0.055],
        [x, -0.022, -0.068],
        [x, -0.058, -0.071],
        [x, -0.105, -0.065],
      ],
      0.006,
    );
    const buckle = group(pack, x, -0.073, -0.073);
    path(
      buckle,
      m.gold,
      [
        [-0.007, -0.008, 0],
        [-0.009, 0, 0],
        [-0.007, 0.008, 0],
        [0.007, 0.008, 0],
        [0.009, 0, 0],
        [0.007, -0.008, 0],
        [-0.007, -0.008, 0],
      ],
      0.00135,
    );
    path(
      buckle,
      m.gold,
      [
        [0, 0.007, 0],
        [0, -0.001, -0.001],
        [0, -0.004, -0.001],
      ],
      0.00085,
    );
    bead(pack, m.gold, x, -0.105, -0.069, 0.0019);
    const points = [
      [sign * 0.08, 0.031, -0.06],
      [sign * 0.086, 0.081, -0.069],
      [sign * 0.087, 0.125, -0.078],
      [sign * 0.093, 0.16, -0.061],
      [sign * 0.088, 0.171, -0.012],
      [sign * 0.089, 0.158, 0.048],
      [sign * 0.086, 0.116, 0.07],
      [sign * 0.088, 0.065, 0.079],
      [sign * 0.08, 0.019, 0.091],
    ];
    const curve = new T.CatmullRomCurve3(points.map((p) => vec(...p)));
    const rows = 54,
      cols = 8,
      join = 0.64;
    const strap = addShell('backpack-straps', chest, m.saddle, rows, cols, (v, u, inner) => {
      const along = Math.min(1, v / join),
        p = curve.getPointAt(along),
        dir = curve.getTangentAt(along);
      const depthNormal = vec(0, dir.z, -dir.y).normalize(),
        width = vec().crossVectors(dir, depthNormal).normalize();
      p.addScaledVector(width, (2 * u - 1) * (0.008 + 0.0025 * Math.sin(along * Math.PI)));
      p.addScaledVector(depthNormal, inner ? -0.0007 : 0.0014);
      return p.toArray();
    });
    // Sew the lower webbing around the fitted vest. Tracing the actual live outer
    // surface keeps the flank clear of the elbow, seated thigh and sliding waistband.
    const bindings = [],
      g = strap.geometry,
      pts = g.attributes.position,
      n = g.attributes.normal;
    for (let h = 0; h < 2; h++)
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        if (v < join) continue;
        const f = (v - join) / (1 - join);
        for (let i = 0; i <= cols; i++) {
          const index = (h * (rows + 1) + j) * (cols + 1) + i,
            across = (2 * i) / cols - 1;
          const angle = 0.65 + 2.02 * f + 0.075 * across * (1 - smooth(f, 0, 0.22));
          const vv =
            0.4 -
            0.28 * smooth(f, 0, 0.58) +
            0.048 * smooth(f, 0.57, 1) +
            across * 0.024 * smooth(f, 0.02, 0.29);
          const open =
            0.205 + 0.185 * smooth(vv, 0.41, 0.9) + 0.076 * Math.exp(-(((vv - 0.985) / 0.12) ** 2));
          const normalized = ((sign > 0 ? angle : tau - angle) - open) / (tau - 2 * open);
          const row = vv * 44,
            col = normalized * 68,
            r0 = Math.floor(row),
            c0 = Math.floor(col);
          const rf = row - r0,
            cf = col - c0,
            mixAmount = smooth(f, 0, 0.19);
          bindings.push({
            index,
            ids: [r0 * 69 + c0, r0 * 69 + c0 + 1, (r0 + 1) * 69 + c0, (r0 + 1) * 69 + c0 + 1],
            weights: [(1 - rf) * (1 - cf), (1 - rf) * cf, rf * (1 - cf), rf * cf],
            mixAmount,
            x0: pts.getX(index),
            y0: pts.getY(index),
            z0: pts.getZ(index),
            dx: Math.sin(sign * angle),
            dz: Math.cos(angle),
            pad: h ? 0.0024 : 0.0039,
          });
        }
      }
    fitStraps.push(() => {
      const shell = surfaces['quilted-vest'][0].geometry.attributes.position;
      for (const { index, ids, weights, mixAmount, x0, y0, z0, dx, dz, pad } of bindings) {
        let x = 0,
          y = 0,
          z = 0;
        for (let k = 0; k < 4; k++) {
          const i = ids[k],
            w = weights[k];
          x += w * shell.getX(i);
          y += w * shell.getY(i);
          z += w * shell.getZ(i);
        }
        pts.setXYZ(
          index,
          mix(x0, x + pad * dx, mixAmount),
          mix(y0, y, mixAmount),
          mix(z0, z + pad * dz, mixAmount),
        );
        n.setXYZ(index, dx, 0, dz);
      }
      pts.needsUpdate = n.needsUpdate = true;
      g.computeBoundingSphere();
    });
    const rearWeb = [];
    for (let h = 0; h < 2; h++)
      for (let j = 0; j <= Math.ceil(rows * 0.18); j++)
        for (let i = 0; i <= cols; i++) {
          const index = (h * (rows + 1) + j) * (cols + 1) + i;
          rearWeb.push({
            index,
            x: pts.getX(index),
            y: pts.getY(index),
            z: pts.getZ(index),
            h,
            blend: 1 - smooth(j / rows, 0.028, 0.18),
          });
        }
    strapAttachments.push((grid) => {
      for (const { index, x, y, z, h, blend } of rearWeb) {
        const bound = -grid.support(x - 0.005, x + 0.005, y - 0.006, y + 0.006) + (h ? 0.0002 : 0.0017);
        const end = Number.isFinite(bound) ? mix(z, bound, blend) : z;
        pts.setZ(index, Math.max(end, Number.isFinite(bound) ? bound : -Infinity));
      }
      pts.needsUpdate = true;
    });
    strap.name = 'Sippy leather pack strap ' + sign;
  }
  const mobilePockets = [];
  for (const [side, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const upper = rig['upperArm' + side],
      fore = rig['forearm' + side],
      foot = rig['foot' + side];
    addVineEmbroidery(upper, {
      x: s * 0.042,
      y: -0.093,
      z: 0.003,
      width: 0.04,
      height: 0.054,
      side: s,
      style: 'gold',
      radius: 0.04,
      rotation: s * -0.32,
      materials: { leaf: m.gold, berry: m.saddleEdge, thread: m.gold },
    });
    // Construct trainers from continuous foot profiles. The outsole stays at the same tread plane as the controller.
    const trainer = group(foot, 0, 0.002, -0.006);
    trainer.scale.set(1.13, 1.045, 1.2);
    mesh(
      trainer,
      rings(
        [
          [-0.047, 0.029, 0.059, 0.025],
          [-0.044, 0.036, 0.068, 0.026],
          [-0.038, 0.037, 0.069, 0.027],
          [-0.028, 0.036, 0.067, 0.028],
        ],
        32,
      ),
      m.welt,
    );
    mesh(
      trainer,
      rings(
        [
          [-0.028, 0.035, 0.065, 0.026],
          [-0.018, 0.034, 0.061, 0.027],
          [-0.008, 0.032, 0.051, 0.019],
          [0.01, 0.029, 0.039, 0.007],
          [0.03, 0.026, 0.027, 0.001],
        ],
        32,
      ),
      m.leather,
    );
    const tongue = ellipsoid(trainer, m.leather, 0, 0.002, 0.043, 0.02, 0.006, 0.028);
    tongue.rotation.x = 0.46;
    ellipsoid(trainer, m.welt, 0, -0.021, 0.074, 0.026, 0.006, 0.019);
    path(
      trainer,
      m.welt,
      [
        [-0.032, -0.026, 0.058],
        [-0.021, -0.025, 0.078],
        [0, -0.024, 0.088],
        [0.021, -0.025, 0.078],
        [0.032, -0.026, 0.058],
      ],
      0.002,
    );
    mesh(
      trainer,
      rings(
        [
          [0.021, 0.023, 0.025, 0],
          [0.033, 0.024, 0.024, 0],
          [0.052, 0.022, 0.021, -0.001],
        ],
        28,
      ),
      m.white,
    );
    for (const sign of [-1, 1]) {
      path(
        trainer,
        m.welt,
        [
          [sign * 0.032, -0.021, 0.062],
          [sign * 0.034, -0.015, 0.04],
          [sign * 0.032, -0.008, 0.014],
          [sign * 0.029, 0.005, -0.013],
          [sign * 0.025, 0.01, -0.02],
        ],
        0.0022,
      );
    }
    for (let j = 0; j < 4; j++) {
      const y = 0.012 - j * 0.0055,
        z = 0.044 + j * 0.0063;
      for (const sign of [-1, 1])
        path(
          trainer,
          m.welt,
          [
            [sign * 0.014, y + 0.002, z],
            [sign * 0.002, y - 0.001, z + 0.005],
            [-sign * 0.014, y - 0.004, z + 0.007],
          ],
          0.00135,
        );
    }
    for (const item of trainer.children) {
      if (!item.isMesh) continue;
      const p = item.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i) + item.position.z,
          toe = smooth(z, 0.018, 0.086);
        p.setX(i, p.getX(i) * (1 + 0.29 * toe) - s * 0.0022 * toe);
      }
      item.geometry.computeVertexNormals();
    }
    // A rib-knit cuff continues the burgundy sleeve into the wrist.
    mesh(
      fore,
      rings(
        [
          [-0.145, 0.0235, 0.024, 0],
          [-0.141, 0.026, 0.0255, 0],
          [-0.119, 0.03, 0.031, 0],
          [-0.113, 0.029, 0.031, 0],
        ],
        28,
      ),
      m.knit,
    );
    for (const y of [-0.14, -0.133, -0.123])
      mesh(
        fore,
        rings(
          [
            [y - 0.0008, 0.027, 0.0285, 0],
            [y + 0.0008, 0.0271, 0.0286, 0],
          ],
          28,
        ),
        m.waistcoat,
      );
    if (side === 'L') {
      const watch = group(fore, 0, -0.143, 0);
      watch.rotation.y = 0.61;
      const strap = shell(
        3,
        32,
        (v, u, inward) => [
          (0.0335 - (inward ? 0.0012 : 0)) * Math.sin(u * tau),
          mix(-0.005, 0.006, v),
          (0.0335 - (inward ? 0.0012 : 0)) * Math.cos(u * tau),
        ],
        true,
      );
      add('watch', mesh(watch, strap, m.saddle));
      const wface = group(watch, 0.034, 0, 0.001);
      wface.rotation.y = Math.PI / 2;
      ellipsoid(wface, m.gold, 0, 0, 0, 0.0128, 0.0144, 0.0027);
      ellipsoid(wface, m.button, 0, 0, 0.0027, 0.0108, 0.0123, 0.0009);
      for (let i = 0; i < 12; i++) {
        const a = (tau * i) / 12;
        bead(wface, m.gold, Math.sin(a) * 0.0088, Math.cos(a) * 0.0104, 0.00365, 0.00058);
      }
      path(
        wface,
        m.white,
        [
          [-0.003, 0.005, 0.0038],
          [0, 0, 0.004],
          [0.006, 0.003, 0.004],
        ],
        0.00055,
      );
    }
    const pants = surfaces['trousers-' + side][0];
    const pocket = tailoring.add('cargo-pockets', pants.parent, shell(16, 18, () => [0, 0, 0]), m.trousers, true);
    pocket.name = 'Sippy gusseted cargo pocket ' + side;
    pocket.material = [m.trousers, m.cargoSeam];
    const tagStitch = (g) => {
      const p = g.attributes.uv,
        idx = g.index;
      let last = -1;
      for (let k = 0; k < idx.count; k += 3) {
        const n = idx.getX(k);
        const v = p.getY(n),
          u = p.getX(n);
        const tag = Number(Math.abs(v - 0.67) < 0.035 || u < 0.03 || u > 0.979 || v < 0.03);
        if (tag === last) g.groups.at(-1).count += 3;
        else {
          g.addGroup(k, 3, tag);
          last = tag;
        }
      }
    };
    tagStitch(pocket.geometry);
    tagStitch(pocket.userData.mobileGeometry ?? pocket.geometry.userData.mobileGeometry);
    // The stitched pocket is sampled from the moving jogger mesh. Both faces and the flap
    // follow the same deforming surface, including a bent knee and the seated hip.
    const segments = 56,
      ringCount = 44;
    const samples = [];
    for (let iu = 0; iu < 2; iu++)
      for (let j = 0; j <= 16; j++)
        for (let i = 0; i <= 18; i++) {
          const v = j / 16,
            u = i / 18;
          const a = s * (0.65 + 1.36 * u);
          const ra = (0.58 + 0.285 * v) * ringCount,
            col = (((a + tau) % tau) / tau) * segments;
          const c0 = Math.floor(col),
            r0 = Math.floor(ra);
          const weights = [
            (1 - col + c0) * (1 - ra + r0),
            (col - c0) * (1 - ra + r0),
            (1 - col + c0) * (ra - r0),
            (col - c0) * (ra - r0),
          ];
          const ids = [
            r0 * segments + c0,
            r0 * segments + ((c0 + 1) % segments),
            (r0 + 1) * segments + c0,
            (r0 + 1) * segments + ((c0 + 1) % segments),
          ];
          const flap = 0.0035 * smooth(v, 0.66, 0.7) * (1 - smooth(v, 0.87, 0.98));
          const belly = Math.sin(Math.PI * u) ** 0.6 * Math.sin(Math.PI * v) ** 0.6;
          samples.push({ ids, weights, d: (iu ? 0.0018 : 0.0033) + belly * 0.0035 + flap });
        }
    mobilePockets.push(() => {
      const p = pants.geometry.attributes.position,
        n = pants.geometry.attributes.normal,
        out = pocket.geometry.attributes.position,
        norm = pocket.geometry.attributes.normal;
      samples.forEach(({ ids, weights, d }, i) => {
        let x = 0,
          y = 0,
          z = 0,
          nx = 0,
          ny = 0,
          nz = 0;
        for (let k = 0; k < 4; k++) {
          const j = ids[k],
            w = weights[k];
          x += p.getX(j) * w;
          y += p.getY(j) * w;
          z += p.getZ(j) * w;
          nx += n.getX(j) * w;
          ny += n.getY(j) * w;
          nz += n.getZ(j) * w;
        }
        const f = 1 / (Math.hypot(nx, ny, nz) || 1);
        nx *= f;
        ny *= f;
        nz *= f;
        out.setXYZ(i, x + nx * d, y + ny * d, z + nz * d);
        norm.setXYZ(i, nx, ny, nz);
      });
      out.needsUpdate = norm.needsUpdate = true;
      pocket.geometry.computeBoundingSphere();
      tailoring.limbs['leg' + side].bind(pocket);
    });
    mesh(
      foot,
      rings(
        [
          [0.02, 0.029, 0.029, -0.001],
          [0.03, 0.031, 0.031, -0.001],
          [0.041, 0.032, 0.032, -0.001],
        ],
        32,
      ),
      m.trousers,
    );
  }
  pack.scale.set(1.175, 1.115, 1.005);
  let packSupport, packFront;
  const packMatrix = new T.Matrix4(),
    packProbe = new T.Vector3();
  const packPoints = packEnvelope.attributes.position,
    packRest = packPoints.array.slice();
  const padding = Array.from({ length: packPoints.count }, (_, i) => {
    const x = packRest[i * 3],
      y = packRest[i * 3 + 1],
      z = packRest[i * 3 + 2];
    return (
      Math.exp(-(((Math.abs(x) - 0.043) / 0.024) ** 4)) *
      smooth(z, -0.028, 0.001) *
      smooth(y, -0.168, -0.143) *
      (1 - smooth(y, 0.022, 0.05))
    );
  });
  function backSupport(x0, x1, y0, y1) {
    return Math.min(tailoring.lowerBackSupport.support(x0, x1, y0, y1), packSupport.support(x0, x1, y0, y1));
  }
  function fitPack() {
    if (!packSupport) {
      packSupport = rearGrid([surfaces['quilted-vest'][0], ...surfaces['split-back']], chest);
      packFront = rearGrid(surfaces.backpack, chest, -1);
    }
    packSupport.update();
    packPoints.array.set(packRest);
    pack.position.z = -0.077;
    pack.updateMatrix();
    let displace = 0;
    for (let i = 0; i < packPoints.count; i += 2) {
      packProbe.fromBufferAttribute(packPoints, i).applyMatrix4(pack.matrix);
      const { x, y, z } = packProbe;
      displace = Math.min(displace, backSupport(x - 0.011, x + 0.011, y - 0.018, y + 0.018) - z - 0.0007);
    }
    pack.position.z += displace;
    pack.updateMatrix();
    packMatrix.copy(pack.matrix).invert();
    // Raised back padding rests against the moving vest at either side of the
    // spinal channel. Shortening the foam against the live contact plane preserves
    // the empty vent while keeping the pack visibly seated from the side.
    for (let i = 0; i < packPoints.count; i++) {
      const k = padding[i];
      if (k < 0.001) continue;
      packProbe.fromBufferAttribute(packPoints, i).applyMatrix4(pack.matrix);
      const { x, y, z } = packProbe,
        support = backSupport(x - 0.013, x + 0.013, y - 0.026, y + 0.026);
      packProbe.z += k * Math.min(0.03, Math.max(0, support - z - 0.001));
      packProbe.applyMatrix4(packMatrix);
      packPoints.setXYZ(i, packProbe.x, packProbe.y, packProbe.z);
    }
    packPoints.needsUpdate = true;
    packEnvelope.computeVertexNormals();
    packFront.update();
    for (const attach of strapAttachments) attach(packFront);
  }
  function step(f, lag) {
    const pace = Math.min(1, f.speed / 4);
    pack.rotation.x = 0.18 * lag + 0.012 * pace * Math.sin(f.phase * 2);
    pack.rotation.z = 0.018 * Math.tanh(f.turn * 0.3);
    pack.position.y = 0.072 + 0.0041 * pace * Math.sin(f.phase * 2 - 0.38);
    drawcord.rotation.z = lag * 0.31 + 0.035 * pace * Math.sin(f.phase - 0.32);
    drawcord.rotation.x = -0.7 * lag;
  }
  return {
    pack,
    drawcord,
    step,
    bakeFit: () => {
      for (const fit of mobilePockets) fit();
      for (const fit of fitStraps) fit();
      fitPack();
    },
  };
}
