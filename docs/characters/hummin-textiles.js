// Two periodic woven finishes. Knit loops travel over and under adjacent rows;
// denim has a brushed two-over, one-under diagonal twill.
import * as T from 'three';

const finishes = new Map();
function fiberMap(knit) {
  if (finishes.has(knit)) return finishes.get(knit);
  const size = 128;
  const fiber = new Uint8Array(size * size * 4);
  const fract = (v) => v - Math.floor(v);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x * 4) / size,
        v = (y * 4) / size;
      const column = fract(u) - 0.5,
        row = fract(v);
      const rib = Math.exp(-((Math.abs(column) - (0.09 + 0.31 * row)) ** 2) / 0.009);
      const twist = Math.cos((column * 18 + row * 8) * Math.PI);
      const twill = Math.cos(2 * Math.PI * (u * 3 - v * 3));
      const fleck = Math.sin(2 * Math.PI * u * 6) * Math.sin(2 * Math.PI * v * 6);
      const value = knit ? 174 + 65 * rib + 13 * twist * rib + 6 * fleck : 209 + 26 * twill + 13 * fleck;
      const index = 4 * (y * size + x);
      fiber[index] = fiber[index + 1] = fiber[index + 2] = value;
      fiber[index + 3] = 255;
    }
  }
  const tex = new T.DataTexture(fiber, size, size);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(knit ? 12 : 8, knit ? 5 : 9);
  tex.magFilter = T.LinearFilter;
  tex.generateMipmaps = true;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  finishes.set(knit, tex);
  return tex;
}
export function weave(material, knit) {
  const tex = fiberMap(knit);
  material.map = material.bumpMap = tex;
  material.bumpScale = knit ? 0.00036 : 0.00015;
  return material;
}
