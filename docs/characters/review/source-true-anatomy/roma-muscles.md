# Roma's adapted muscles

Roma's height is 66.14 in. Her hip, shoulder, elbow, wrist, knee and ankle pivots come from the BoneHub Visible Human Female skeleton. The alignment, proportions and motion report describes how the source meshes follow those pivots using a common uniform scale. [Rig and proportions](rig.md) · [Per-bone geometry verification](source-geometry.md)

## Method

The two separately licensed male-source packs contain 251 BodyParts3D surfaces and four Z-Anatomy surfaces per tier. Each part first takes its assigned joint's upright bind. The adaptation narrows its cross-section about its principal longitudinal axis and blends the displacement of local attachment points through a compact radial field. Named origins and insertions use the nearest source vertices and project onto specific female cortical triangles. Deep atlas parts without published attachment annotations use two inferred boundary sites and the nearest eligible cortex for that joint. The records distinguish those inferred sites from the named anchors.

The separate Andreassen female lower-limb pack takes precedence for represented anatomical names, including the gluteal and thigh groups. The male atlas transition parts, including the iliopsoas and abdominal sheets, have pelvic or femoral anchors. Placement follows the actual hip rather than averaging the width of male and female donors. The studio uses separately selectable breast tissue, gluteal pads and lateral hip and thigh pads. The authored skin references the same donor's HuBMAP silhouette and follows the character's proportions and wardrobe.

Muscle literature guided direction and relative magnitudes. These are adaptation parameters for Roma's character design. The output percentages come from measured triangles per part. [Anatomical anchors, muscles and breast and gluteal layer references](roma-attachment-method.md)

## Per-muscle measurements

Each file records the closest cortical target and residual for the real female triangles, the direction and amount of movement from the donor, and the before and after oriented-triangle volume estimates in cubic inches. The values compare the unchanged male donor after rigid placement and common character scale with the reshaped bind geometry. An open source or a hollow surface can have a less reliable oriented-triangle volume estimate. The output uses separate licensed GLBs for BodyParts3D and Z-Anatomy. [Mobile measurements](roma-muscle-adaptation-mobile.json) · [High measurements](roma-muscle-adaptation-high.json) · [Source credits and rebuild](../../assets/MUSCLE-SKIN-LICENSE.md)

The known limits are the gaps in the female CT elbow scans and the absence of a full-body female atlas. Nearest preserved cortex is used when a named anatomical attachment is missing from those scan slices. At a flexed joint, a part can separate from its other end as it follows its insertion bone. The stills show the unmodified female tissues beside the adapted upper torso and the authored soft-tissue layers.

The 76 Andreassen STL muscles are supplied by the pinned scientific mirror. Its mesh directory does not contain the publication's fat surfaces or a dermis mesh. The university archive's file endpoint returned HTTP 403 in the working environment. Roma's inspection fat layers are authored from the contour reference and identified as such. [Andreassen publication source](https://digitalcommons.du.edu/visiblehuman/1/) · [Original STL corner proof](andreassen-stl-proof.json) · [HuBMAP female organ](https://doi.org/10.48539/HBM453.MVPL.398)

## Reproduce

Run the bake from the repository root with Node.js 24, Three.js 0.170.0 and meshoptimizer 1.3.0. Set `THREE_ROOT` and `MESHOPT_ROOT` to their package directories if they are outside this checkout.

```sh
node tools/adapt-roma-muscles.mjs
```
