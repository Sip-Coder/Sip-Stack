// Anatomy is inspection-only. Each family loads its own interior on demand.
export async function addInnerLayers(rig, name, tier, parts) {
  rig.root.updateWorldMatrix(true, true);
  if (name === 'hummin') {
    const { addRobotInterior } = await import('./diagram-robot.js');
    return addRobotInterior(rig, tier, parts);
  }
  const { addHumanInterior } = await import('./diagram-human.js');
  return addHumanInterior(rig, name, tier, parts);
}
