import { Box3, BufferAttribute, BufferGeometry, Mesh, Vector3 } from 'three';
import { restoreAxonMaterial } from './diagram-baked-material.js';

function unpack({ name, finishes, parts, partial }) {
  const materials = finishes.map(restoreAxonMaterial);
  const geometries = [];
  const attribute = ({ array, size, normalized }) => new BufferAttribute(array, size, normalized);
  function dispose() {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }
  try {
    return {
      name, fitPath: 'worker', partial, dispose,
      parts: parts.map(({ name, layer, source, scanNode, muscleNode, atlasNode, region,
        attributes, index, groups, bounds, material, renderOrder }) => {
        const g = new BufferGeometry();
        geometries.push(g);
        for (const [k, attr] of Object.entries(attributes)) g.setAttribute(k, attribute(attr));
        if (index) g.setIndex(attribute(index));
        g.groups = groups;
        g.boundingBox = new Box3(new Vector3(...bounds[0]), new Vector3(...bounds[1]));
        const mesh = new Mesh(g, Array.isArray(material) ? material.map((id) => materials[id]) : materials[material]);
        mesh.name = name;
        mesh.renderOrder = renderOrder;
        return { id: layer + '/' + name, name, layer, source, scanNode, muscleNode, atlasNode, region, mesh };
      }),
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function fitInWorker(name, tier, signal, onPartial) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./diagram-fit-worker.js', import.meta.url), {
      type: 'module', name: 'Axon fit ' + name + ' ' + tier,
    });
    function close() {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    }
    function fail(error) {
      close();
      reject(error);
    }
    const abort = () => fail(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    let preview;
    worker.onmessage = async ({ data }) => {
      try {
        if (data.error) {
          const error = new Error(data.error);
          error.assetURL = data.assetURL;
          throw error;
        }
        if (data.partial && !onPartial) return;
        if (data.partial) {
          preview = onPartial(unpack(data));
        } else {
          await preview;
          signal?.throwIfAborted();
          const model = unpack(data);
          close();
          resolve(model);
        }
      } catch (error) {
        fail(error);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(new Error(event.message || 'Could not start the Axon fitting worker'));
    };
    worker.onmessageerror = () => fail(new Error('Could not read the fitted anatomy'));
    try {
      worker.postMessage({ name, tier, threeUrl: import.meta.resolve('three') });
    } catch (error) {
      fail(error);
    }
  });
}
