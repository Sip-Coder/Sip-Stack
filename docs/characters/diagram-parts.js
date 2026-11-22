// Entry point for an open Axon View. Human inspection geometry is already in
// its posed coordinate frame; the raw atlases are a missing-file fallback.
export async function buildDiagramModel(name, tier, signal, onPartial) {
  if (!['sippy', 'roma', 'hummin'].includes(name) || !['mobile', 'high'].includes(tier))
    throw new Error('Unknown character or geometry tier');
  signal?.throwIfAborted();
  if (name === 'hummin') {
    const raw = await import('./diagram-fit-model.js');
    return raw.buildDiagramModel(name, tier, signal);
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const packs = ['', '-sa'].map((suffix) =>
    new URL('./assets/axon-' + name + '-' + tier + suffix + '.glb', import.meta.url));
  let missing = false;
  async function read(url) {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 404 || response.status === 410) missing = true;
    if (!response.ok) throw new Error('Could not load ' + url.pathname + ' (HTTP ' + response.status + ')');
    return response.arrayBuffer();
  }
  try {
    const [{ decodeAxonPack }, primary, shareAlike] = await Promise.all([
      import('./diagram-baked-pack.js'), ...packs.map(read),
    ]);
    signal?.throwIfAborted();
    const materials = new Map();
    const settled = await Promise.allSettled([primary, shareAlike].map((buffer, i) =>
      decodeAxonPack(buffer, { name, tier, materials, license: i ? 'CC BY-SA 4.0' : 'CC BY 4.0' })));
    const decoded = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const dispose = () => decoded.forEach((pack) => pack.dispose());
    const failed = settled.find((r) => r.status === 'rejected');
    if (failed || signal?.aborted) {
      dispose();
      signal?.throwIfAborted();
      throw failed.reason;
    }
    return {
      name, fitPath: 'baked', dispose,
      parts: decoded.flatMap((p) => p.parts).sort((a, b) => a.order - b.order),
      batches: decoded.flatMap((p) => p.batches),
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (!missing) throw error;
  } finally {
    controller.abort();
    signal?.removeEventListener('abort', abort);
  }
  const { fitInWorker } = await import('./diagram-worker-client.js');
  signal?.throwIfAborted();
  return fitInWorker(name, tier, signal, onPartial);
}
