// Preserve each subject's orbital plane while adapting the vertical proportions
// of the adult skull to the illustrated face. The mandible uses the same map
// so that the bite and temporomandibular articulation remain registered.
export function fitSkull(atlas, head, roma) {
  const [centerX, eyeY, eyeZ] = atlas.orbital;
  const eyeSeparation = (roma ? 0.454 : 0.43) / atlas.orbitalSpacing;
  const upper = ((roma ? 0.961 : 0.97) - head.eye) / (atlas.crown - eyeY);
  const lower = (head.eye - (roma ? 0.084 : 0.065)) / (eyeY - atlas.chin);
  return (p) => {
    const across = (p.x - centerX) * eyeSeparation;
    // The broad illustrated eyes need a modest lateral correction only at the
    // anterior orbital rim. Preserve the adult vault's narrower silhouette and
    // the taper from zygoma to jaw everywhere else.
    const depth = p.z - eyeZ;
    const orbital = Math.exp(-((p.y - eyeY) ** 2 / 0.0012 + (depth / 0.053) ** 2));
    const span = roma ? 0.79 : 0.71;
    const width = span + (1 - span) * orbital;
    const x = across * width;
    const orbitalCenter = roma ? 0.454 : 0.43;
    const lateral = Math.max(0, Math.abs(x) - orbitalCenter);
    // Ease the broad lateral cranial vault into the narrower temple; the
    // transition has unit slope where it meets the interorbital region.
    const temple = (lateral * lateral) / (lateral + 0.12);
    const y = head.eye + (p.y - eyeY) * (p.y < eyeY ? lower : upper);
    const z = 0.7 + depth * (depth < 0 ? (roma ? 10.7 : 9.8) : 5.8);
    return head.place(x - Math.sign(x) * (roma ? 0.19 : 0.22) * temple, y, z);
  };
}
