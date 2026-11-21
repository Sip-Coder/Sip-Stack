# Scan inspector performance and stability

Main `85d3ad1` uses the procedural skeleton. The candidate `bbd734d` uses fitted BoneHub skeletons, a shared BodyParts3D muscle atlas, a Visible Human Female lower-limb supplement for Roma and the human studio renderer. All route values are medians of five paired cold visits per route and tier. First inspection uses three fresh visits per actor and tier.

## Cold navigation

| Tier | Route | Transfer (decimal KB) | HTTP requests | ES modules | First populated frame (s) | First accepted input (s) |
|---|---|---|---|---|---|---|
| Mobile | Heros | 384.2 → 384.7 | 26 → 26 | 22 → 22 | 3.81 → 5.43 | 5.00 → 6.71 |
| Mobile | Village | 515.9 → 516.4 | 62 → 62 | 56 → 56 | 6.34 → 7.18 | 10.22 → 12.03 |
| High | Heros | 384.2 → 384.7 | 26 → 26 | 22 → 22 | 4.07 → 5.61 | 5.63 → 8.93 |
| High | Village | 515.9 → 516.4 | 62 → 62 | 56 → 56 | 9.27 → 12.09 | 11.32 → 17.20 |

The input endpoint includes visibly moving the selected hero or the Village camera. Each CDP ledger counts bytes through that exact event, including the page and any partially transferred responses. The new footer credits change the compressed HTML. Candidate timing sessions ran with working-tree HEADs `eea3fa4` (rounds 1–2) and `9f4f91b` (rounds 3–5). Every measured response matches the `2fcaab2` cold graph by hash, including HTML SHA-256 `689e4197b2971133767ff929c17bd3339fbcf1a5c66be0c522b21e060367fa1e`. The shipped revision above also matches every served cold-route and walking-floor response hash from these earlier measurements. Both routes retain their original request and module counts. Cold visits used a shared four-core host during geometry verification. Per-visit timings in the ledgers show the spread, including a slow High Village visit. All cold request ledgers exclude all skeletons, both muscle sources, inspection modules and their decoders. [Main ledgers](route-load-before.json) · [Candidate ledgers](route-load-after.json)

### Quiet-host cross-check

| Tier | Route | Transfer (decimal KB) | HTTP requests | ES modules | First populated frame (s) | First accepted input (s) |
|---|---|---|---|---|---|---|
| Mobile | Heros | 383.6 | 26 | 22 | 3.83 | 4.85 |
| Mobile | Village | 516.4 | 62 | 56 | 7.23 | 11.48 |
| High | Heros | 383.6 | 26 | 22 | 4.46 | 5.72 |
| High | Village | 516.4 | 62 | 56 | 9.00 | 11.12 |

One additional four-visit round on the idle lab host checks timing sensitivity. Its results are independent of the five-visit medians above. [Quiet-host timed endpoint and response ledgers](route-quiet-crosscheck.json)

## First opening of Axon View

| Tier | Actor | Pickable bone groups | Skeleton triangles | Growth | Skeleton mesh draws | Studio finishing draws | First populated inspection frame (s) |
|---|---|---|---|---|---|---|---|
| Mobile | Sippy | 204 → 170 | 49,704 → 65,066 | 30.9% | 1 → 2 | 0 → 1 | 5.03 → 21.66 |
| Mobile | Roma | 204 → 170 | 49,664 → 66,610 | 34.1% | 1 → 2 | 0 → 1 | 3.15 → 16.62 |
| High | Sippy | 204 → 170 | 82,798 → 115,198 | 39.1% | 1 → 2 | 0 → 1 | 6.17 → 19.85 |
| High | Roma | 204 → 170 | 82,742 → 114,420 | 38.3% | 1 → 2 | 0 → 1 | 3.80 → 18.14 |

Demand-loading the anatomy increased the median wait by 13.47–16.63 seconds for the fitted models on this throttled lab. The controller, actor and detail setting had already rendered on the walking floor. A real scroll brought only Axon View into frame. The clock ends one animation frame after the populated GPU readback reached its 2D display canvas. The triangle totals include the reconstructed joint surfaces. Each fits the retained 1.4× ceiling against the corresponding procedural skeleton.

| Tier | Actor | Deferred JS raw bytes | Deferred JS gzip bytes | Skeleton body bytes | Shared atlas body bytes | Female supplement body bytes | All-layer geometry draws |
|---|---|---|---|---|---|---|---|
| Mobile | Sippy | 202,245 → 469,721 | 67,347 → 143,686 | 368,888 | 601,264 | 0 | 31 → 32 |
| Mobile | Roma | 202,245 → 469,721 | 67,347 → 143,686 | 375,040 | 601,264 | 119,324 | 7 → 8 |
| High | Sippy | 202,245 → 469,721 | 67,347 → 143,686 | 543,948 | 888,340 | 0 | 31 → 32 |
| High | Roma | 202,245 → 469,721 | 67,347 → 143,686 | 544,572 | 888,340 | 198,972 | 7 → 8 |

Each visit fetched the matching BoneHub skeleton and shared per-tier atlas in parallel. Roma also fetched the same-subject lower-limb supplement. The original procedural models used zero GLB bytes. The browser supplied the meshopt decoder through the pinned Three.js package. The geometry draws in the table exclude the single full-screen finishing draw for the studio backdrop and contact shadow. High also computes screen-space occlusion in that pass. [Main inspector visits](inspector-before.json) · [Candidate inspector visits](inspector-after.json)

## Scan fidelity within the rendering budget

| Attached sex and tier | Named scan meshes | Attached → shipped triangles | Attached surface vs shipped, 99th percentile (in) | Max forward / reverse (in) |
|---|---|---|---|---|
| Female High | 143 | 250,916 → 108,400 | 0.019 | 0.051 / 0.039 |
| Female Mobile | 143 | 73,066 → 61,794 | 0.019 | 0.058 / 0.038 |
| Male High | 142 | 253,370 → 108,906 | 0.020 | 0.090 / 0.042 |
| Male Mobile | 142 | 72,106 → 60,808 | 0.018 | 0.051 / 0.039 |

The bidirectional test samples every vertex and triangle centroid against the closest named bone triangle in the other LOD. All six bounds of every named bone match within 0.00001 in. A separate 36-view WebGL comparison yielded minimum silhouette IoU of 0.9948 for the full skeleton, 0.9977 for the skull and 0.9974 for the pelvis at 590 × 680 pixels. The largest contour differences were 1.0, 2.83 and 2.0 pixels respectively. [Per-asset hashes and surface measurements](scan-lod-surface.json)

## Atlas fidelity and fitted muscle inventory

| Tier | Supplied → shipped triangles | Muscles | Source → shipped connected components | 99th percentile / worst sampled distance (in) |
|---|---|---|---|---|
| Mobile | 101,144 → 76,558 | 323 | 401 → 401 | 0.016 / 0.089 |
| High | 272,194 → 155,766 | 323 | 426 → 426 | 0.017 / 0.085 |

Mesh simplification preserved the 323 names, each muscle’s connected subparts and all six bounds. Twenty-four front, side, rear and three-quarter WebGL silhouette comparisons at 590 × 680 pixels gave minima of 0.9986 whole-body, 0.9978 shoulder and 0.9989 hip IoU. The largest displacement was two pixels. Source and shipped atlas measurements use the same bidirectional nearest-surface sampler as the bones. [Atlas results](muscle-lod-surface.json)

| Tier | Hero | Pickable tissue groups, main → candidate | Muscle triangles, main → candidate |
|---|---|---|---|
| Mobile | Sippy | 52 → 323 | 142,384 → 77,354 |
| Mobile | Roma | 52 → 339 | 37,172 → 80,300 |
| High | Sippy | 52 → 323 | 204,202 → 156,336 |
| High | Roma | 52 → 339 | 54,216 → 169,042 |

Roma’s female lower-limb supplement replaces 60 BodyParts3D slots and contributes 16 additional separate muscles. This raises her on-demand geometry over the 52 procedural parts on main. [Exact per-visit model and geometry counters](inspector-after.json)

## Guardrails

### Interactive walking floor

| Tier | Actor | Mean pose step (ms) | Worst draw submissions | Script per frame (ms) | Rendered frames/s |
|---|---|---|---|---|---|
| Mobile | Sippy | 0.08 → 0.13 | 80 → 80 | 5.62 → 5.50 | 12.94 → 12.45 |
| Mobile | Roma | 0.02 → 0.04 | 36 → 36 | 3.40 → 1.68 | 13.75 → 11.38 |
| Mobile | Hummin | 0.63 → 0.60 | 78 → 78 | 4.63 → 4.43 | 10.82 → 9.71 |
| Mobile | Lineup | 0.60 → 0.67 | 186 → 186 | 6.56 → 10.60 | 9.04 → 7.86 |
| High | Sippy | 0.11 → 0.13 | 83 → 83 | 4.43 → 2.86 | 4.85 → 5.24 |
| High | Roma | 0.04 → 0.03 | 36 → 36 | 1.80 → 2.54 | 8.35 → 7.10 |
| High | Hummin | 0.49 → 0.59 | 90 → 90 | 3.39 → 3.27 | 5.45 → 4.29 |
| High | Lineup | 0.68 → 0.56 | 201 → 201 | 4.52 → 5.21 | 2.81 → 3.07 |

The floor comparison used the repository’s production pose benchmark for 128 fixed simulation steps and twelve actually rendered frames per actor and tier on both checkouts. [Main samples](floor-before.json) · [Candidate samples](floor-candidate.json)

### Rendering and recovery

The instrumented renderer kept 1 live WebGL context. The offscreen inspector made 0 geometry draws, 0 finishing draws and 0 copies during 60 active floor submissions. After a 250 ms stall on Sippy High, the peak was 1 geometry pass and 1 finishing pass per animation frame. The readback audit observed 43 populated photos. [Native WebGL counts](native-render.json)

Both Hummin models match main in all 135 parts including source geometry, picking order, indices, material properties and texture data. [Per-tier hashes](hummin-identity.json) Mobile has 94,740 triangles and High has 142,444. The walking-floor flicker test observed 605 actual rendered frames across 20 four-tab cycles with zero black frames or unexpected clears. On both tiers all three selected actors rewarmed after context loss. Character Ref’s real hoodie edit refreshed 15 dependent panels and preserved 20 other images. Actual inspection views returned pixel-for-pixel to the original orbit, layer and ghost settings and kept the prior photo during context loss. The first-open request and recovery regression covers the floor, Character Ref, Hummin, a selected human, blocked requests during rapid selection, shared-atlas reuse and HTTP 503 failures of all three asset types independently. [Demand and retry evidence](scan-loading.json)

## Reproduction

The standalone offline sampler accepts each supplied/shipped GLB pair. Copy `tools/check-inspection-lod.mjs` next to the pinned npm dependencies documented for the atlas build and run `node check-inspection-lod.mjs supplied.glb shipped.glb`. It reports name correspondence, independent nearest-triangle distance statistics, bounds and connected-component counts.

Use Python Playwright, Chromium and an extracted three@0.170.0 distribution. The timing lab used headless Chromium 155.0.8059.79, ANGLE Vulkan SwiftShader, an 800 × 680 viewport, DPR 1, reduced motion, 60 ms network latency, 9 Mbps down, 1.5 Mbps up and 4× CPU throttling. HTML, CSS and JavaScript used gzip level 6 over a local HTTP/1.1 server. This setup measures relative costs with controlled resources. Mobile and High are the application detail tiers.

```sh
export THREE_ROOT=/path/to/three-0.170.0
python tools/benchmark-route-load.py --repo "$BASE" --audit --output /tmp/routes-before.json
python tools/benchmark-route-load.py --repo . --audit --output /tmp/routes-after.json
python tools/compare-route-load.py /tmp/routes-before.json /tmp/routes-after.json
python tools/benchmark-skeleton-inspector.py --repo "$BASE" --output /tmp/inspection-before.json
python tools/benchmark-skeleton-inspector.py --repo . --baseline /tmp/inspection-before.json --output /tmp/inspection-after.json
python tools/check-axon-performance.py --output /tmp/native.json
python tools/check-scan-loading.py "$SITE_URL" --system-fonts
python tools/check-axon-view.py "$SITE_URL" --system-fonts
python tools/check-character-ref.py "$SITE_URL" --system-fonts
python tools/check-characters.py "$SITE_URL" --system-fonts
```
