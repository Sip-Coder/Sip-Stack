// Workers do not inherit the document import map. The caller supplies the
// page's pinned Three module URL, including its deployment or test mirror.
self.onmessage = async ({ data: { name, tier, threeUrl } }) => {
  try {
    self.axonThree = await import(threeUrl);
    const { streamFit } = await import('./diagram-worker.generated.js');
    await streamFit(name, tier);
  } catch (error) {
    self.postMessage({ error: error?.message || String(error), assetURL: error?.assetURL });
  }
};
