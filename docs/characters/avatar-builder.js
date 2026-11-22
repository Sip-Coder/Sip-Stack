const builders = {
  sippy: () => import('./sippy.js').then(m => m.buildSippy),
  roma: () => import('./roma.js').then(m => m.buildRoma),
  hummin: () => import('./hummin.js').then(m => m.buildHummin),
};
const grooms = new Map();

export function loadAvatarBuilder(name) {
  return builders[name]();
}

async function readGroom(url) {
  if (url.protocol === 'file:' && globalThis.process?.versions?.node) {
    const [{ readFile }, { gunzipSync }] = await Promise.all([
      import('node:fs/promises'), import('node:zlib'),
    ]);
    const bytes = gunzipSync(await readFile(url));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load hair (HTTP ' + response.status + ')');
  // Publish the gzip envelope as a file so binary transport works on hosts
  // that send GLB bodies without content compression.
  const glb = response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(glb).arrayBuffer();
}

export async function loadAvatarGroom(name, tier) {
  if (name === 'hummin') return;
  if (!builders[name] || !['mobile', 'high'].includes(tier)) throw new Error('Unknown hair asset');
  const key = name + '-' + tier;
  if (grooms.has(key)) return grooms.get(key);
  const url = new URL('./assets/hair/' + key + '.glb.gz', import.meta.url);
  const request = Promise.all([readGroom(url), import('./hair-groom.js')])
    .then(async ([buffer, { decodeHair, attachHair }]) => {
      const asset = await decodeHair(buffer, name, tier);
      return (head, groom) => attachHair(head, asset, groom);
    }).catch(error => {
      grooms.delete(key);
      if (!error.assetURL) error.assetURL = url.href;
      throw error;
    });
  grooms.set(key, request);
  return request;
}

export async function loadAvatar(name, tier) {
  const [build, groom] = await Promise.all([loadAvatarBuilder(name), loadAvatarGroom(name, tier)]);
  return rig => build(rig, groom);
}
