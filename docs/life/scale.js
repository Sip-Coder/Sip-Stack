// Scene units per metre. Wardrobe statures and the high-resolution rig use metres.
export const SCENE_M = Object.freeze({ village: 0.60, tidelight: 0.50, creek: 0.92 });

export function m(scene, metres) {
  return SCENE_M[scene] * metres;
}

// Attach a design dimension to render geometry. The audit measures its vertices
// through their actual world transforms. Null leaves an unspecified axis open.
export function scaleSpec(object, scene, kind, metres, name = object.name || kind) {
  object.userData.scaleRef = { scene, name, kind, metres };
  return object;
}
