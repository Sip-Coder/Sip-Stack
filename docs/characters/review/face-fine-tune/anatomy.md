# Skull and facial muscle registration

The High BoneHub scans supplied the cortical landmarks for both tiers. The face measurements use the head joint as origin, with anatomical left, superior and anterior as positive directions. The orbital centers are midpoints derived from the four recorded rim points. The scalp and skull bounds come from the indexed source surfaces. [Face landmark block](../../source-face-landmarks.js)

## Mandible closure

The paired condyles define a single hinge per actor. The mandible rotates about that line while the cranium and maxilla keep their bind pose. Both tiers reuse the acquired meshes. The check divides out the common standing-height scale and measures each edge before and after posing, with residuals below 0.000001 in. Both condyles remain fixed to within 0.000001 in. [Per-mesh proof](face-anatomy-proof.json)

| Hero | Jaw rotation | Open central incisor gap | Posed central incisor gap | Posed CT skull W × H × D |
|---|---:|---:|---:|---:|
| Sippy | −1.01° | 0.068 in | 0.014 in | 5.35 × 8.59 × 7.96 in |
| Roma | −13.97° | 0.793 in | 0.014 in | 5.63 × 7.72 × 7.73 in |

The gap is the vertical separation at the selected central incisor landmarks. Their front-to-back alignment still follows the acquired dental arch and the rigid hinge. [Verification tool](../../../../tools/check-face-anatomy.mjs)

## Facial muscles

The 35 named meshes come from BodyParts3D v3. Registration uses the supraorbital rim for orbital tissues, the zygoma and hinge for temporal and jaw tissues, and nasal and dental landmarks for the central facial muscles. Sippy’s face pack preserves every source coordinate and oriented triangle from the mirrored STL. One positive uniform atlas scale and per-region rigid placement bring the surfaces into his head frame. Roma’s face pack bakes regional adjustments to her smaller jaw, orbital proportions and cheekbone position while preserving the source topology. The face shapes and placement consume the same atlas triangles as Axon. [License and pack links](../../assets/MUSCLE-SKIN-LICENSE.md) · [Placement matrices and source hashes](face-muscle-registration.json)

The packing script verifies the pinned STL hashes and decodes every compressed buffer to check positions and oriented triangles. To reproduce, fetch the pinned BodyParts3D mirror, then run the following with the same meshoptimizer dependency used for the original Andreassen source pack. [Packing script](../../../../tools/pack-face-muscles.mjs)

```sh
git clone --filter=blob:none --no-checkout https://github.com/Kevin-Mattheus-Moerman/BodyParts3D.git /tmp/bodyparts3d-v3
git -C /tmp/bodyparts3d-v3 checkout 2c83c698788cff57f6317bddcf712e7acfbea7d8 -- assets/BodyParts3D_data/stl
npm install --prefix /tmp/axon-tools meshoptimizer@1.3.0
MESHOPT_ROOT=/tmp/axon-tools/node_modules/meshoptimizer node tools/pack-face-muscles.mjs /tmp/bodyparts3d-v3/assets/BodyParts3D_data/stl docs/characters/assets
```
