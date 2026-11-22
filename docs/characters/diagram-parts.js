// Only an open Axon View creates its selected actor and native anatomy layers.
export async function buildDiagramModel(name, tier, signal, onPartial) {
  const { buildDiagramModel: build } = await import('./diagram-model.js');
  return build(name, tier, signal, onPartial);
}
