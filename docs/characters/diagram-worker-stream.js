// Executed in the human-only fitting Worker. Each message owns its geometry.
import { buildDiagramModel } from './diagram-fit-model.js';
import { describeAxonMaterial } from './diagram-baked-material.js';

function publish(name, parts, partial) {
  const transfer = new Set(), finishes = [], materialIds = new Map();
  function encodeAttribute(attr) {
    // The fitter still needs its bone positions to seat insertions after the
    // first message. Only that first skeleton snapshot needs copying.
    const array = partial ? attr.array.slice() : attr.array;
    transfer.add(array.buffer);
    return { array, size: attr.itemSize, normalized: attr.normalized };
  }
  function materialId(material) {
    if (!materialIds.has(material)) {
      materialIds.set(material, finishes.length);
      finishes.push(describeAxonMaterial(material));
    }
    return materialIds.get(material);
  }
  const packet = parts.map(({ mesh, layer, name, source, scanNode, muscleNode, atlasNode, region }) => {
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    return {
      name, layer, source, scanNode, muscleNode, atlasNode, region,
      material: Array.isArray(mesh.material) ? mesh.material.map(materialId) : materialId(mesh.material),
      renderOrder: mesh.renderOrder, groups: g.groups,
      bounds: [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()],
      index: g.index && encodeAttribute(g.index),
      attributes: Object.fromEntries(Object.entries(g.attributes).map(([key, attr]) => [key, encodeAttribute(attr)])),
    };
  });
  self.postMessage({ name, parts: packet, finishes, partial }, [...transfer]);
}

export async function streamFit(name, tier) {
  const model = await buildDiagramModel(name, tier, undefined, (bones) => publish(name, bones, true));
  try {
    publish(name, model.parts, false);
  } finally {
    model.dispose();
  }
}
