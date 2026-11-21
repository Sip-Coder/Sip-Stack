// Only the open inspector requests a selected character's interior.
export async function prepareInnerLayers(name, tier, signal) {
  if (name === 'hummin') {
    const { addRobotInterior } = await import('./diagram-robot.js');
    return (rig, parts) => addRobotInterior(rig, tier, parts);
  }
  const [{ addHumanInterior }, [scan, atlas]] = await Promise.all([
    import('./diagram-human.js'),
    import('./diagram-scan-source.js').then(({ loadSkeletonScan, loadCharacterMuscles }) =>
      Promise.all([loadSkeletonScan(name, tier, signal), loadCharacterMuscles(name, tier, signal)]),
    ),
  ]);
  return (rig, parts) => addHumanInterior(rig, name, tier, parts, scan, atlas);
}
