# Facial fat and skin depth in PR #28 v3

The scaled BoneHub skull and registered BodyParts3D muscles sit under 16 baked facial pads per hero. The offline wrap samples the scaled bone and muscle surface, blends the local fat thickness into its remaining dermal allowance, and reserves at least 0.06 in between each pad and the sampled outer envelope. The nasal tip is an authored soft-tissue proxy. The forensic papers report total bone-to-skin depth, including the underlying muscle and fat. They set project floor inputs at the named sites. The shaded shape blends across those sites and the sheet proportions set the feature silhouettes. [Pooled adult depths, Table 3](https://doi.org/10.1007/s00414-023-03087-x) · [Young adults by age and BMI, Tables 2a and 3a](https://doi.org/10.1016/j.forsciint.2006.02.034)

## Directional tissue probes and authoring floors

All distances are in inches, using the native High pose. The older numbers are from the first PR #28 revision at `1009294`. Paired samples are left and right. A dash indicates that the published study landmark lacks a matching donor probe. The regional table below also measures those surfaces. Directional measurements and unsigned nearest-triangle distances answer different questions.

| Region | V2 target | Published mean used | Sippy v2 → v3 | Roma v2 → v3 | Site |
| --- | --- | --- | ---: | ---: | --- |
| Forehead | 0.20–0.25 | 0.217 | 0.243 → 0.192 | 0.351 → 0.221 | Glabella, pooled adults |
| Nasal bridge | ≈ 0.25 | 0.236 | 0.396 → 0.358 | 0.266 → 0.174 | Nasion, pooled adults |
| Brow side | 0.20–0.25 | 0.276 | 0.985 / 0.816 → 0.324 / 0.299 | 1.021 / 0.870 → 0.303 / 0.306 | Mid-supraorbital rim, pooled adults |
| Infraorbital and lower lid | 0.20–0.25 | 0.327 / 0.370 | — | — | De Greef suborbital young-adult means |
| Cheekbone | 0.20–0.30 | 0.295 | 0.413 / 0.108 → 0.304 / 0.306 | 0.152 / 0.225 → 0.311 / 0.309 | Zygion, pooled adults. Malar ray is its local proxy. |
| Apple of cheek | — | 0.638 / 0.705 | — | — | De Greef inferior malar young-adult means |
| Buccal or mid-cheek | 0.45–0.60 | 0.768 | 0.314 / 0.337 → 0.158 / 0.398 | 0.400 / 0.393 → 0.425 / 0.406 | Midramus proxy. Local probe below reports nearest cheek muscle. |
| Nasolabial ridge | — | 0.437 / 0.374 | — | — | De Greef young-adult means |
| Nasal ala and tip | — | 0.394 | — | — | Pooled ala anchor. The sheet sets the button tip. |
| Upper lip | 0.45–0.55 | 0.472 | 0.365 → 0.621 | 0.962 → 1.118 | Prosthion proxy from upper incisor |
| Lower lip | 0.45–0.55 | 0.531 | 0.333 → 0.529 | 0.590 → 0.699 | Infradentale proxy from lower incisor |
| Jaw angle | ≈ 0.40 | 0.492 | 0.467 / 0.342 → 0.505 / 0.491 | 0.434 / 0.271 → 0.542 / 0.499 | Gonion, pooled adults |
| Chin | 0.40–0.45 | 0.433 | 0.324 → 0.446 | 0.319 → 0.452 | Pogonion, pooled adults |
| Under-chin and neck transition | ≈ 0.30 | 0.276 | 0.117 → 0.166 | 0.230 → 0.316 | Menton, pooled adults |
| Temple | — | 0.386 / 0.378 | — | — | De Greef supraglenoid young-adult proxy |
| Ear root | 0.40–0.80 | — | 0.296 / 0.296 → 0.343 / 0.343 | 0.264 / 0.264 → 0.345 / 0.345 | First lateral contact from the meatus |

The bare-face soft-tissue distances are checked separately from the shot silhouette. Directional readings that miss the bony anchor or exceed its tiny comparison region can dominate a maximum. The authored pads and original bone and muscle surfaces remain separately inspectable in Axon.

## Regional gaps

Each cell gives area-weighted mean / largest sampled distance in inches. Bone measures nearest skull triangles, so this column includes skin, fat and muscle where present. Muscle measures the original anatomical muscle surfaces. Support additionally considers cervical bone and the new fat pads. The body portions of the four existing Gap heatmap receipts are unchanged.

### Sippy · Mobile

| Region | Bone v2 → v3 | Muscle v2 → v3 | Support v2 → v3 |
| --- | ---: | ---: | ---: |
| Forehead | 0.212 / 0.580 → 0.241 / 0.655 | 0.381 / 1.602 → 0.443 / 2.067 | 0.162 / 0.391 → 0.162 / 0.382 |
| Orbit | 0.210 / 0.654 → 0.249 / 0.793 | 0.144 / 0.531 → 0.247 / 0.813 | 0.098 / 0.372 → 0.134 / 0.628 |
| Cheek | 0.370 / 0.808 → 0.540 / 1.299 | 0.373 / 0.685 → 0.466 / 1.087 | 0.285 / 0.662 → 0.321 / 1.010 |
| Nose | 0.273 / 0.945 → 0.240 / 0.792 | 0.259 / 1.009 → 0.242 / 0.901 | 0.206 / 0.945 → 0.170 / 0.705 |
| Lips | 0.230 / 0.439 → 0.558 / 1.168 | 0.202 / 0.311 → 0.431 / 0.930 | 0.192 / 0.297 → 0.429 / 0.900 |
| Jaw | 0.303 / 0.577 → 0.395 / 1.218 | 0.352 / 0.692 → 0.445 / 1.039 | 0.255 / 0.440 → 0.301 / 0.990 |
| Chin | 0.378 / 1.326 → 0.393 / 1.506 | 0.417 / 1.010 → 0.445 / 1.238 | 0.244 / 0.716 → 0.166 / 0.781 |
| Ears | 0.576 / 1.205 → 0.668 / 1.398 | 0.531 / 1.256 → 0.881 / 1.742 | 0.449 / 1.063 → 0.585 / 1.321 |
| Neck join | 1.070 / 4.974 → 1.150 / 5.691 | 0.387 / 1.660 → 0.497 / 2.470 | 0.312 / 1.660 → 0.343 / 2.470 |
| Scalp | 0.250 / 0.566 → 0.269 / 0.626 | 0.858 / 3.009 → 1.014 / 3.462 | 0.223 / 0.566 → 0.228 / 0.534 |
| **All** | 0.628 / 4.974 → 0.706 / 5.691 | 0.487 / 3.009 → 0.581 / 3.462 | 0.267 / 1.660 → 0.293 / 2.470 |

[Native Gap heatmap data](../../../assets/skin-wrap-gap-sippy-mobile.json)

### Sippy · High

| Region | Bone v2 → v3 | Muscle v2 → v3 | Support v2 → v3 |
| --- | ---: | ---: | ---: |
| Forehead | 0.207 / 0.573 → 0.237 / 0.655 | 0.381 / 1.602 → 0.443 / 2.067 | 0.159 / 0.391 → 0.159 / 0.382 |
| Orbit | 0.210 / 0.654 → 0.247 / 0.786 | 0.143 / 0.531 → 0.246 / 0.813 | 0.098 / 0.367 → 0.132 / 0.628 |
| Cheek | 0.369 / 0.817 → 0.538 / 1.309 | 0.373 / 0.685 → 0.466 / 1.087 | 0.284 / 0.662 → 0.320 / 1.010 |
| Nose | 0.272 / 0.945 → 0.241 / 0.792 | 0.259 / 1.009 → 0.242 / 0.901 | 0.204 / 0.945 → 0.170 / 0.705 |
| Lips | 0.226 / 0.436 → 0.553 / 1.160 | 0.202 / 0.311 → 0.431 / 0.930 | 0.190 / 0.296 → 0.428 / 0.900 |
| Jaw | 0.298 / 0.574 → 0.390 / 1.202 | 0.351 / 0.692 → 0.445 / 1.039 | 0.250 / 0.440 → 0.301 / 0.990 |
| Chin | 0.373 / 1.323 → 0.388 / 1.531 | 0.415 / 1.010 → 0.443 / 1.238 | 0.239 / 0.716 → 0.163 / 0.781 |
| Ears | 0.573 / 1.197 → 0.665 / 1.388 | 0.528 / 1.250 → 0.880 / 1.742 | 0.447 / 1.057 → 0.585 / 1.321 |
| Neck join | 1.068 / 4.955 → 1.146 / 5.672 | 0.387 / 1.660 → 0.496 / 2.469 | 0.311 / 1.660 → 0.342 / 2.469 |
| Scalp | 0.246 / 0.571 → 0.264 / 0.633 | 0.858 / 3.009 → 1.014 / 3.462 | 0.219 / 0.571 → 0.224 / 0.532 |
| **All** | 0.625 / 4.955 → 0.703 / 5.672 | 0.487 / 3.009 → 0.581 / 3.462 | 0.264 / 1.660 → 0.292 / 2.469 |

[Native Gap heatmap data](../../../assets/skin-wrap-gap-sippy-high.json)

### Roma · Mobile

| Region | Bone v2 → v3 | Muscle v2 → v3 | Support v2 → v3 |
| --- | ---: | ---: | ---: |
| Forehead | 0.213 / 0.396 → 0.212 / 0.500 | 0.430 / 1.823 → 0.460 / 2.209 | 0.205 / 0.298 → 0.188 / 0.308 |
| Orbit | 0.179 / 0.574 → 0.307 / 0.935 | 0.117 / 0.449 → 0.491 / 0.974 | 0.081 / 0.350 → 0.230 / 0.653 |
| Cheek | 0.367 / 0.778 → 0.457 / 0.972 | 0.368 / 0.615 → 0.465 / 0.842 | 0.290 / 0.584 → 0.212 / 0.655 |
| Nose | 0.322 / 1.044 → 0.363 / 0.928 | 0.213 / 0.860 → 0.286 / 0.887 | 0.194 / 0.860 → 0.220 / 0.797 |
| Lips | 0.270 / 0.432 → 0.271 / 0.689 | 0.227 / 0.392 → 0.193 / 0.442 | 0.227 / 0.392 → 0.172 / 0.360 |
| Jaw | 0.294 / 0.684 → 0.267 / 0.820 | 0.428 / 0.715 → 0.500 / 0.937 | 0.263 / 0.510 → 0.147 / 0.337 |
| Chin | 0.499 / 1.306 → 0.605 / 1.748 | 0.272 / 0.579 → 0.438 / 1.060 | 0.197 / 0.460 → 0.115 / 0.631 |
| Ears | 0.573 / 1.080 → 0.750 / 1.414 | 0.430 / 0.977 → 1.112 / 1.884 | 0.412 / 0.977 → 0.661 / 1.376 |
| Neck join | 0.910 / 4.361 → 1.131 / 5.017 | 0.470 / 2.107 → 0.678 / 2.606 | 0.384 / 2.107 → 0.482 / 2.606 |
| Scalp | 0.243 / 0.474 → 0.262 / 0.617 | 0.898 / 3.221 → 1.199 / 4.218 | 0.217 / 0.474 → 0.223 / 0.551 |
| **All** | 0.560 / 4.361 → 0.659 / 5.017 | 0.533 / 3.221 → 0.755 / 4.218 | 0.294 / 2.107 → 0.336 / 2.606 |

[Native Gap heatmap data](../../../assets/skin-wrap-gap-roma-mobile.json)

### Roma · High

| Region | Bone v2 → v3 | Muscle v2 → v3 | Support v2 → v3 |
| --- | ---: | ---: | ---: |
| Forehead | 0.209 / 0.392 → 0.207 / 0.517 | 0.430 / 1.823 → 0.460 / 2.209 | 0.202 / 0.298 → 0.184 / 0.308 |
| Orbit | 0.179 / 0.572 → 0.306 / 0.938 | 0.118 / 0.449 → 0.491 / 0.974 | 0.082 / 0.381 → 0.230 / 0.653 |
| Cheek | 0.365 / 0.784 → 0.454 / 0.982 | 0.368 / 0.615 → 0.465 / 0.842 | 0.288 / 0.585 → 0.212 / 0.655 |
| Nose | 0.321 / 1.044 → 0.362 / 0.928 | 0.214 / 0.860 → 0.286 / 0.887 | 0.194 / 0.860 → 0.220 / 0.797 |
| Lips | 0.265 / 0.432 → 0.264 / 0.687 | 0.227 / 0.392 → 0.193 / 0.442 | 0.227 / 0.392 → 0.172 / 0.360 |
| Jaw | 0.291 / 0.685 → 0.267 / 0.819 | 0.427 / 0.705 → 0.500 / 0.937 | 0.261 / 0.510 → 0.146 / 0.337 |
| Chin | 0.496 / 1.306 → 0.602 / 1.747 | 0.278 / 0.579 → 0.440 / 1.060 | 0.197 / 0.495 → 0.115 / 0.631 |
| Ears | 0.567 / 1.072 → 0.743 / 1.404 | 0.461 / 1.058 → 1.127 / 1.892 | 0.430 / 1.019 → 0.658 / 1.374 |
| Neck join | 0.907 / 4.358 → 1.127 / 5.015 | 0.467 / 2.103 → 0.677 / 2.608 | 0.380 / 2.103 → 0.478 / 2.608 |
| Scalp | 0.240 / 0.472 → 0.258 / 0.600 | 0.898 / 3.221 → 1.199 / 4.218 | 0.215 / 0.472 → 0.220 / 0.547 |
| **All** | 0.557 / 4.358 → 0.655 / 5.015 | 0.533 / 3.221 → 0.755 / 4.218 | 0.292 / 2.103 → 0.333 / 2.608 |

[Native Gap heatmap data](../../../assets/skin-wrap-gap-roma-high.json)

## Reproduce

`tools/build-face-shells.mjs` bakes the per-character radial fit and authored fat pads. `tools/build-skin-fit.mjs . docs/characters/assets --face` measures the live pose and updates only the face payloads. Both use Three.js r170, and the distance tool also uses three-mesh-bvh 0.8.3.
