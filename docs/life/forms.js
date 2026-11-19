// Closed section lofts. Ring coordinates are [height, half width, half depth, x, z].
// Shared indexed streams keep seams, material tint and bone weights aligned.
import * as T from 'three';

export const tau = Math.PI * 2;
export const sat = (x) => Math.max(0, Math.min(1, x));
export const smooth = (x) => {
  x = sat(x);
  return x * x * (3 - 2 * x);
};
export function wind(t, x, z) {
  return 0.68 * Math.sin(t * 1.23 + x * 0.48 + z * 0.31) + 0.32 * Math.sin(t * 2.17 - z * 0.63);
}
export function seed(n) {
  return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
}
export class Sections {
  constructor() {
    this.p = [];
    this.c = [];
    this.uv = [];
    this.i = [];
    this.j = [];
    this.w = [];
  }
  loft(rings, color, count = 16, joint = 0, shape = null) {
    const start = this.p.length / 3,
      tint = new T.Color(color);
    for (let r = 0; r < rings.length; r++) {
      const [y, rx, rz, x = 0, z = 0, bone = joint, other = bone, blend = 0] = rings[r];
      for (let s = 0; s < count; s++) {
        const a = (tau * s) / count,
          sn = Math.sin(a),
          cs = Math.cos(a);
        let pt = [x + rx * sn, y, z + rz * cs];
        if (shape) pt = shape(pt, a, r);
        this.p.push(...pt);
        this.c.push(tint.r, tint.g, tint.b);
        this.uv.push(s / count, r / (rings.length - 1));
        this.j.push(bone, other, 0, 0);
        this.w.push(1 - blend, blend, 0, 0);
        if (r) {
          const c = start + r * count + s,
            d = start + r * count + ((s + 1) % count);
          this.i.push(c - count, d - count, c, c, d - count, d);
        }
      }
    }
    for (let s = 1; s < count - 1; s++) {
      const end = start + (rings.length - 1) * count;
      this.i.push(start, start + s + 1, start + s, end, end + s, end + s + 1);
    }
  }
  geometry(skinned = false) {
    const g = new T.BufferGeometry();
    for (const [name, stream, size] of [
      ['position', this.p, 3],
      ['color', this.c, 3],
      ['uv', this.uv, 2],
    ]) {
      g.setAttribute(name, new T.Float32BufferAttribute(stream, size));
    }
    if (skinned) {
      g.setAttribute('skinIndex', new T.Uint16BufferAttribute(this.j, 4));
      g.setAttribute('skinWeight', new T.Float32BufferAttribute(this.w, 4));
    }
    g.setIndex(this.i);
    g.computeVertexNormals();
    return g;
  }
}
export function mesh(parent, geo, material, name = '') {
  const m = new T.Mesh(geo, material);
  m.castShadow = m.receiveShadow = true;
  m.name = name;
  parent.add(m);
  return m;
}
export function tube(parent, points, radius, material, steps = 24) {
  const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  return mesh(parent, new T.TubeGeometry(curve, steps, radius, 6, false), material);
}
// Tangent-space thread crossings and polished paint grain, generated once.
const surfaces = new Map();
export function finish(kind) {
  if (surfaces.has(kind)) return surfaces.get(kind);
  const m = new T.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: kind === 'skin' ? 0.61 : 0.79,
    sheen: kind === 'cloth' ? 0.56 : 0.18,
    sheenColor: kind === 'skin' ? 0xffad91 : 0xe1d8be,
    side: T.DoubleSide,
  });
  if (kind === 'wood' || kind === 'cloth') {
    const size = 64,
      data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4,
          a = (x * tau) / 8,
          b = (y * tau) / 8;
        data[i] =
          128 +
          (kind === 'cloth' ? 38 * Math.cos(a) * Math.sin(b) : 26 * Math.sin(a + 0.23 * Math.cos(b / 4)));
        data[i + 1] = 128 + (kind === 'cloth' ? 38 * Math.sin(a) * Math.cos(b) : 8 * Math.cos(b));
        data[i + 2] = 244;
        data[i + 3] = 255;
      }
    const tex = new T.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = T.LinearMipmapLinearFilter;
    tex.magFilter = T.LinearFilter;
    tex.repeat.set(kind === 'cloth' ? 7 : 2, kind === 'cloth' ? 4 : 1);
    tex.needsUpdate = true;
    m.normalMap = tex;
    m.normalScale.setScalar(0.44);
    m.roughnessMap = tex;
  }
  if (kind === 'skin') {
    m.onBeforeCompile = (s) => {
      s.vertexShader =
        'varying vec3 skinPoint;\n' +
        s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nskinPoint=position;');
      s.fragmentShader =
        'varying vec3 skinPoint;\n' +
        s.fragmentShader
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
        vec3 f=skinPoint-vec3(0.,1.54,0.);
        float cheek=exp(-dot((vec2(abs(f.x),f.y)-vec2(.056,.078))*vec2(34.,63.),(vec2(abs(f.x),f.y)-vec2(.056,.078))*vec2(34.,63.)));
        float eye=exp(-dot((vec2(abs(f.x),f.y)-vec2(.037,.114))*vec2(49.,97.),(vec2(abs(f.x),f.y)-vec2(.037,.114))*vec2(49.,97.)));
        diffuseColor.rgb*=mix(vec3(1.),vec3(1.08,.88,.84),cheek*smoothstep(.02,.06,f.z));
        diffuseColor.rgb*=1.-.22*eye*smoothstep(.03,.075,f.z);
        float pore=fract(sin(dot(floor(skinPoint.xy*930.),vec2(17.31,92.16)))*8413.);
        diffuseColor.rgb*=1.-.04*pore*(1.-smoothstep(.0007,.002,fwidth(f.y)));
      `,
          )
          .replace(
            '#include <lights_fragment_end>',
            '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(.065,.023,.014) * (1.0 - max(dot(normal,geometryViewDir),0.0));',
          );
    };
  }
  surfaces.set(kind, m);
  return m;
}
