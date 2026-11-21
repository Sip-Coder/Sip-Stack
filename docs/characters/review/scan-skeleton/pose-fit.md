# Human scan registration through movement

Both tier builds use the posed hero, the selected CT skeleton, the muscle atlas and the actual inspection skin. Each hero was sampled at rest, on three walk frames, three run frames, three roll frames and a raised left leg.

## Skin and joint clearance

For each of six orthographic views, the test compares the closest inner triangle and the closest skin triangle at every covered pixel on a 448 × 448 depth raster. It counts a sample when skin is absent along the ray or the inner surface projects more than 0.020 in in front of skin. Clothing, hair, brows and lashes are excluded. The two subjects have different skin surface areas, and a denser inner mesh changes the number of occupied samples.

| Hero and tier | Main exposed / sampled | Candidate exposed / sampled | Main femur exposures | Candidate femur exposures | Worst shoulder / hip joint ray gap |
|---|---:|---:|---:|---:|---:|
| Sippy Mobile | 5,315 / 671,694 | 0 / 834,097 | 4,301 | 0 | 0.162 / 0.156 in |
| Sippy High | 5,246 / 675,258 | 0 / 839,859 | 4,223 | 0 | 0.163 / 0.159 in |
| Roma Mobile | 0 / 754,219 | 0 / 1,033,149 | 0 | 0 | 0.148 / 0.177 in |
| Roma High | 0 / 756,781 | 0 / 1,040,774 | 0 | 0 | 0.159 / 0.169 in |

The joint measures use five rays through each fitted humeral-head/glenoid and femoral-head/acetabular pair. The joint column gives the largest absolute separation across the two sides and eleven poses. The independent bone-only test prevents overlying muscle from hiding a bone crossing. [Bone-only measurements](bone-containment.json)

## Muscle attachments and the female warp

Each explicitly registered source endpoint identifies an atlas vertex and a cortical structure. The test measures the shortest distance from the final, skin-fitted muscle vertex to any triangle on that posed bone. Ocular, oral and fascial attachments can terminate in soft tissue.

| Hero and tier | Muscles | Cortex-attached muscles | Distinct cortical endpoints | Worst endpoint gap | Resting iliac breadth / clavicular span | Resting Q-angle, left / right |
|---|---:|---:|---:|---:|---:|---:|
| Sippy Mobile | 323 | 270 | 637 | <0.001 in | 9.69 / 14.01 in | 12.46° / 11.29° |
| Sippy High | 323 | 270 | 640 | <0.001 in | 9.70 / 14.02 in | 12.85° / 11.30° |
| Roma Mobile | 339 | 286 | 667 | <0.001 in | 10.73 / 12.35 in | 17.04° / 16.50° |
| Roma High | 339 | 286 | 671 | <0.001 in | 10.74 / 12.36 in | 16.67° / 16.41° |

The Q-angle uses the coronal projection of the anterior superior iliac spine, patellar center and tibial tuberosity on the fitted CT. Roma uses the female iliac crest, socket and thigh axis, a dedicated posterior gluteal warp and a separate medial adductor warp. Her leg muscles include 76 surfaces from the female Visible Human subject. The torso, head and upper limbs retain the registered adult male atlas. [Source provenance and fit limits](tissue-registration.md)

## Reproduction

Run the command in each hero/tier combination with Node 24 and Three.js 0.170.0. To resample the before revision, set `AXON_BASELINE_ROOT` to a clean worktree of `85d3ad1`. The same pose and camera code is used for each revision.

```sh
THREE_ROOT=/path/to/three node tools/check-axon-skeleton.mjs sippy mobile rest walk run roll leg-raise
```

[Per-pose measurements](pose-fit.json) · [Sampler](../../../../tools/check-axon-skeleton.mjs)
