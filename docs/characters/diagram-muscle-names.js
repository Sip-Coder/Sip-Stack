// Verified against DBCLS's IS-A element table. These source IDs identify
// individual muscles even when their GLB node names only name a compartment.
const elementNames = {
  FJ1429: 'plantaris',
  FJ1430: 'popliteus',
  FJ1437: 'soleus',
  FJ1487: 'brachioradialis',
  FJ1492: 'extensor digitorum',
  FJ1502: 'palmaris longus',
  FJ1505: 'supinator',
};

export function muscleDisplayName(source, fallback) {
  const element = source.userData.atlasCounterpart || source.userData.sourcePart;
  const match = /^(FJ\d+)(M?)(?:\.obj)?$/.exec(element);
  const name = match && elementNames[match[1]];
  return name ? (match[2] ? 'Left ' : 'Right ') + name : fallback;
}
