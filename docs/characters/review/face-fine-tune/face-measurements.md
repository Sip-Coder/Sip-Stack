# Heros face measurements

Baseline is main at `94deb9d`, the PR #27 merge. The rebuilt skin and registered face atlas are measured in the same neutral Axon View pose on Mobile and High. All dimensions and distances are in inches.

## Head dimensions

Width × height × depth of the main face shell and the combined BoneHub cranium, maxilla and mandible. Ears, hair, separately modeled lips and the neck join are outside the shell bounds. The skull measurement includes the posed jaw. Closing it changes the overall height and may change depth while preserving the original skull mesh and scale.

| Hero | Tier | Skin before | Skin after | Skull before | Skull after |
| --- | --- | --- | --- | --- | --- |
| Sippy | Mobile | 8.970 × 10.389 × 11.190 | 5.904 × 9.196 × 8.463 | 5.345 × 8.634 × 7.960 | 5.345 × 8.589 × 7.960 |
| Sippy | High | 8.970 × 10.389 × 11.190 | 5.904 × 9.196 × 8.463 | 5.348 × 8.638 × 7.964 | 5.348 × 8.594 × 7.964 |
| Roma | Mobile | 9.286 × 9.981 × 10.347 | 6.147 × 8.286 × 8.478 | 5.629 × 8.312 × 7.584 | 5.629 × 7.716 × 7.723 |
| Roma | High | 9.286 × 9.981 × 10.347 | 6.147 × 8.286 × 8.478 | 5.634 × 8.327 × 7.591 | 5.634 × 7.716 × 7.730 |

## Landmark depths

High tier. Probe origins use the head bind frame, with +X to the character’s left, +Y up and +Z forward. The BoneHub landmarks are digitized on the source surfaces and the lower landmarks use the rigidly closed jaw pose.

Directional probes report the distance from the indicated skull landmark to the skin along the outward ray. Oblique bony surfaces, recessed landmark positions and the exterior folds can make these readings larger than the nearest-support numbers below. A negative directional result indicates that the sampled skin is behind its anchor along the ray. Mid-cheek uses the nearest masseter or buccinator triangle from the skin contact. The lip depths project forward to the center lip crest from each incisor plane. The ear depths use the first lateral contact from the meatus.

Coordinates for both orbits, nasal bones, piriform opening, zygomatic arches, mastoids and TMJ condyles are in the [source landmark block](../../source-face-landmarks.js).

| Probe | BoneHub landmark or sampling origin | Target | Sippy depth | Roma depth | Sippy origin (X, Y, Z) | Roma origin (X, Y, Z) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Crown | Superior cranium extremum | 0.2–0.3 | 0.204 | 0.174 | (0.123, 5.597, 0.244) | (0.365, 5.845, -0.082) |
| Back of scalp | Posterior cranium extremum | 0.2–0.3 | 0.215 | 0.199 | (0.190, 2.127, -3.522) | (0.015, 2.137, -3.480) |
| Forehead | Glabella | 0.2–0.25 | 0.243 | 0.351 | (0.334, 2.309, 3.905) | (0.021, 2.485, 3.299) |
| Nasion | Nasion | ≈ 0.25 | 0.396 | 0.266 | (0.272, 1.950, 3.599) | (0.247, 1.976, 3.514) |
| Chin | Pogonion | 0.4–0.45 | 0.324 | 0.319 | (0.185, -2.298, 3.452) | (0.220, -1.018, 4.063) |
| Under-chin | Menton | ≈ 0.3 | 0.117 | 0.230 | (0.240, -2.996, 3.246) | (0.118, -1.622, 4.130) |
| Upper lip | Upper incisor | 0.45–0.55 | 0.365 | 0.962 | (0.320, -1.145, 3.795) | (0.205, -0.460, 3.563) |
| Lower lip | Lower incisor | 0.45–0.55 | 0.333 | 0.590 | (0.281, -1.159, 3.814) | (0.271, -0.474, 3.963) |
| Brow ridge, left | Superior orbital rim | 0.2–0.25 | 0.985 | 1.021 | (1.337, 2.481, 2.979) | (1.289, 2.343, 2.644) |
| Cheekbone, left | Malar point | 0.2–0.3 | 0.413 | 0.152 | (2.160, 0.915, 2.530) | (2.296, 0.667, 2.414) |
| Mid-cheek, left | Probe between malar and gonion | 0.45–0.6 | 0.314 | 0.400 | (1.974, -0.531, 1.615) | (2.030, -0.446, 1.884) |
| Jaw angle, left | Gonion | ≈ 0.4 | 0.467 | 0.434 | (1.815, -1.763, 0.835) | (1.803, -1.394, 1.433) |
| Ear, left | External auditory meatus | 0.4–0.8 | 0.296 | 0.264 | (2.273, 0.244, -0.115) | (2.233, 0.100, -0.341) |
| Brow ridge, right | Superior orbital rim | 0.2–0.25 | 0.816 | 0.870 | (-0.802, 2.556, 3.160) | (-1.196, 2.319, 2.692) |
| Cheekbone, right | Malar point | 0.2–0.3 | 0.108 | 0.225 | (-1.829, 0.888, 2.904) | (-1.980, 0.794, 2.338) |
| Mid-cheek, right | Probe between malar and gonion | 0.45–0.6 | 0.337 | 0.393 | (-1.762, -0.465, 1.862) | (-1.873, -0.321, 1.986) |
| Jaw angle, right | Gonion | ≈ 0.4 | 0.342 | 0.271 | (-1.705, -1.618, 0.974) | (-1.781, -1.270, 1.686) |
| Ear, right | External auditory meatus | 0.4–0.8 | 0.296 | 0.264 | (-2.010, 0.174, -0.005) | (-2.150, 0.093, -0.121) |

## Region gaps

Each cell is area-weighted mean / largest sampled distance. Axon maps each measured skin vertex to the nearest triangle. Muscle uses the existing head and neck muscles before and adds the BodyParts3D facial muscles after. Support uses the closest of those muscle triangles and the skull or upper cervical bone triangles. Both are unsigned distances. Eyeballs, lashes, teeth, hair, clothing and the torso below the upper neck are outside the face sample. Landmark depths and per-region gaps use different measurements.

The face heatmap colors nearest-muscle distances up to 1.5 in, with larger values shown in the last color. The table retains the measured maxima. The scalp has areas where skull is the outer support and the nearest muscle is much farther away. The neck join includes the top of the intact PR #27 neck shell.

### Sippy · Mobile

| Region | Before muscle | After muscle | Before support | After support |
| --- | ---: | ---: | ---: | ---: |
| Forehead | 2.608 / 3.554 | 0.381 / 1.602 | 1.270 / 1.775 | 0.162 / 0.391 |
| Orbit | 1.433 / 2.141 | 0.144 / 0.531 | 1.250 / 1.987 | 0.098 / 0.372 |
| Cheek | 2.039 / 2.871 | 0.373 / 0.685 | 1.720 / 2.203 | 0.285 / 0.662 |
| Nose | 1.894 / 3.347 | 0.259 / 1.009 | 1.636 / 2.975 | 0.206 / 0.945 |
| Lips | 1.318 / 1.913 | 0.202 / 0.311 | 1.161 / 1.447 | 0.192 / 0.297 |
| Jaw | 1.710 / 2.315 | 0.352 / 0.692 | 1.536 / 1.976 | 0.255 / 0.440 |
| Chin | 1.264 / 1.903 | 0.417 / 1.010 | 1.000 / 1.537 | 0.244 / 0.716 |
| Ears | 2.240 / 3.195 | 0.531 / 1.256 | 1.949 / 2.820 | 0.449 / 1.063 |
| Neck join | 0.903 / 2.961 | 0.387 / 1.660 | 0.781 / 2.185 | 0.312 / 1.660 |
| Scalp | 3.433 / 5.310 | 0.858 / 3.009 | 1.256 / 2.111 | 0.223 / 0.566 |
| **All measured skin** | **1.923 / 5.310** | **0.487 / 3.009** | **1.169 / 2.975** | **0.267 / 1.660** |

Measured vertices before and after were 3,936 and 8,980.

### Sippy · High

| Region | Before muscle | After muscle | Before support | After support |
| --- | ---: | ---: | ---: | ---: |
| Forehead | 2.606 / 3.548 | 0.381 / 1.602 | 1.266 / 1.766 | 0.159 / 0.391 |
| Orbit | 1.431 / 2.141 | 0.143 / 0.531 | 1.247 / 1.982 | 0.098 / 0.367 |
| Cheek | 2.037 / 2.871 | 0.373 / 0.685 | 1.716 / 2.198 | 0.284 / 0.662 |
| Nose | 1.892 / 3.346 | 0.259 / 1.009 | 1.634 / 2.975 | 0.204 / 0.945 |
| Lips | 1.317 / 1.913 | 0.202 / 0.311 | 1.151 / 1.434 | 0.190 / 0.296 |
| Jaw | 1.706 / 2.302 | 0.351 / 0.692 | 1.532 / 1.971 | 0.250 / 0.440 |
| Chin | 1.263 / 1.903 | 0.415 / 1.010 | 0.994 / 1.529 | 0.239 / 0.716 |
| Ears | 2.222 / 3.168 | 0.528 / 1.250 | 1.946 / 2.819 | 0.447 / 1.057 |
| Neck join | 0.902 / 2.949 | 0.387 / 1.660 | 0.780 / 2.175 | 0.311 / 1.660 |
| Scalp | 3.429 / 5.310 | 0.858 / 3.009 | 1.252 / 2.109 | 0.219 / 0.571 |
| **All measured skin** | **1.920 / 5.310** | **0.487 / 3.009** | **1.166 / 2.975** | **0.264 / 1.660** |

Measured vertices before and after were 3,936 and 8,980.

### Roma · Mobile

| Region | Before muscle | After muscle | Before support | After support |
| --- | ---: | ---: | ---: | ---: |
| Forehead | 2.723 / 4.058 | 0.430 / 1.823 | 1.593 / 2.028 | 0.205 / 0.298 |
| Orbit | 1.297 / 1.838 | 0.117 / 0.449 | 1.276 / 1.700 | 0.081 / 0.350 |
| Cheek | 1.939 / 2.694 | 0.368 / 0.615 | 1.727 / 2.298 | 0.290 / 0.584 |
| Nose | 1.791 / 2.989 | 0.213 / 0.860 | 1.749 / 2.902 | 0.194 / 0.860 |
| Lips | 1.705 / 1.925 | 0.227 / 0.392 | 1.661 / 1.885 | 0.227 / 0.392 |
| Jaw | 1.460 / 1.748 | 0.428 / 0.715 | 1.098 / 1.423 | 0.263 / 0.510 |
| Chin | 1.078 / 1.557 | 0.272 / 0.579 | 0.850 / 1.387 | 0.197 / 0.460 |
| Ears | 1.955 / 2.527 | 0.430 / 0.977 | 1.834 / 2.498 | 0.412 / 0.977 |
| Neck join | 0.834 / 2.743 | 0.470 / 2.107 | 0.721 / 2.358 | 0.384 / 2.107 |
| Scalp | 3.767 / 5.681 | 0.898 / 3.221 | 1.261 / 2.270 | 0.217 / 0.474 |
| **All measured skin** | **2.022 / 5.681** | **0.533 / 3.221** | **1.141 / 2.902** | **0.294 / 2.107** |

Measured vertices before and after were 5,467 and 9,319.

### Roma · High

| Region | Before muscle | After muscle | Before support | After support |
| --- | ---: | ---: | ---: | ---: |
| Forehead | 2.714 / 4.030 | 0.430 / 1.823 | 1.590 / 2.024 | 0.202 / 0.298 |
| Orbit | 1.299 / 1.840 | 0.118 / 0.449 | 1.277 / 1.695 | 0.082 / 0.381 |
| Cheek | 1.949 / 2.694 | 0.368 / 0.615 | 1.724 / 2.298 | 0.288 / 0.585 |
| Nose | 1.799 / 3.013 | 0.214 / 0.860 | 1.751 / 2.902 | 0.194 / 0.860 |
| Lips | 1.702 / 1.906 | 0.227 / 0.392 | 1.660 / 1.875 | 0.227 / 0.392 |
| Jaw | 1.446 / 1.722 | 0.427 / 0.705 | 1.093 / 1.423 | 0.261 / 0.510 |
| Chin | 1.059 / 1.555 | 0.278 / 0.579 | 0.844 / 1.391 | 0.197 / 0.495 |
| Ears | 1.965 / 2.553 | 0.461 / 1.058 | 1.838 / 2.517 | 0.430 / 1.019 |
| Neck join | 0.834 / 2.742 | 0.467 / 2.103 | 0.719 / 2.356 | 0.380 / 2.103 |
| Scalp | 3.754 / 5.677 | 0.898 / 3.221 | 1.258 / 2.260 | 0.215 / 0.472 |
| **All measured skin** | **2.018 / 5.677** | **0.533 / 3.221** | **1.139 / 2.902** | **0.292 / 2.103** |

Measured vertices before and after were 5,467 and 9,319.

## Reproduce

Run `node tools/build-skin-fit.mjs <checkout> <output> --face` from the face revision. Give `THREE_ROOT` and `MESH_BVH_ROOT` the locally unpacked Three r170 and three-mesh-bvh 0.8.3 paths when neither package is installed. Use separate output directories for `94deb9d` and the candidate. The bake reads the exact same posed triangle buffers as Axon and preserves all four body measurement records.
