# Rebuilt skin and explorer outfits

The skin is an original surface built from measured cross-sections around the posed bones and muscles. The sections use an outward offset with smoothing between adjacent stations. Sippy's revised shoulders, hips, trousers and shoes follow his measured male rig. Roma's jacket, waist, cargo rise and trouser seat follow her female rig. Her breast tissue, gluteal pads and hip and upper-thigh pads appear as three separate Axon layers. The source anatomy stays separate from the deforming skin and clothes.

Roma's authored waist measures **34.30 in** and her maximum hip section measures **46.23 in**, giving a **0.742 waist-to-hip ratio**. These are 24-sided cross-section measurements around the authored shell in its upright bind. The broader silhouette guide came from the same donor’s published HuBMAP female skin mesh. The generated shell draws from that silhouette and the character's preserved anatomy. [HuBMAP female skin](https://doi.org/10.48539/HBM453.MVPL.398)

## Skin coverage in Axon View

Six orthographic projections at 512 px compare the nearest anatomical triangles with the visible skin. A sample counts if the anatomy is more than 0.04 in in front of the skin or extends past its projected silhouette. The dressed figures add the clothes and accessories to the exterior comparison. Roma's breast and fat layers count as interior for this check.

| Character and tier | Interior samples | Beyond bare skin | Beyond dressed exterior | Beyond dressed silhouette |
|---|---:|---:|---:|---:|
| Sippy Mobile | 138,103 | 282 | 11 | 0 |
| Sippy High | 138,509 | 289 | 15 | 0 |
| Roma Mobile | 146,959 | 84 | 0 | 0 |
| Roma High | 147,063 | 92 | 0 | 0 |

The remaining bare-skin samples are concentrated at the lower fibula, toes and fingertip margins. Sippy’s dressed residual is at exposed fingertips. These are checks of the six sampled projections in Axon's measured upright pose. The actual walk, run, jump and roll use the same rig lengths and were verified with the production outer models. [Per-view and per-part coverage](exterior-coverage.json) · [Pose and movement checks](rig.md) · [Matched-angle review plates](media.md)

Run the check from the repository root with Node.js 24 and the repository's pinned Three.js version.

```sh
THREE_ROOT=/path/to/three node tools/check-source-shell.mjs
```
