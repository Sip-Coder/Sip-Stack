export const femaleMuscleFile = 'vhf-muscles-source-meshopt.glb';

export function sourceAssetFiles(name, tier) {
  if (name === 'hummin') return [];
  if (name === 'roma') return [
    'skeleton-female-' + tier + '.glb',
    'roma-adapted-bp3d-' + tier + '-meshopt.glb',
    'roma-adapted-zanatomy-' + tier + '-meshopt.glb',
    femaleMuscleFile,
  ];
  return [
    'skeleton-male-' + tier + '.glb',
    'bp3d-muscles-' + tier + '-meshopt.glb',
    'bp3d-missing-muscles-' + tier + '-meshopt.glb',
    'zanatomy-lats-rectus-' + tier + '-meshopt.glb',
  ];
}
