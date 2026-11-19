# People review

[Watch the 15-second portrait reel](people-portrait.mp4). The stair walker, porter, cantina host and cooper each appear for 3.75 seconds.

## Scene comparisons

Before images use main at `99339be`. After images and the reel capture the worker geometry and poses committed through `f854651`. Subsequent performance changes share cutter geometry, streamline cloth collision queries and adjust Mobile environment lighting. The render report measures those changes as well. Each pair follows the same named actor at the same scene time and camera offset. The desktop viewport is 1120 × 740 and the portrait viewport is 412 × 800. Images show the scene canvas at its rendered resolution. Desktop uses High quality. Portrait uses Auto except for Tidelight Coast and the Village guest and gathering, where High makes all subjects visible in the baseline.

| Subject | Before · desktop | After · desktop | Before · portrait | After · portrait |
| --- | --- | --- | --- | --- |
| Village · Stair walker | [Desktop](before-village-stairs-desktop.jpg) | [Desktop](after-village-stairs-desktop.jpg) | [Portrait](before-village-stairs-portrait.jpg) | [Portrait](after-village-stairs-portrait.jpg) |
| Village · Porter and crate | [Desktop](before-village-porter-desktop.jpg) | [Desktop](after-village-porter-desktop.jpg) | [Portrait](before-village-porter-portrait.jpg) | [Portrait](after-village-porter-portrait.jpg) |
| Village · Grape harvester | [Desktop](before-village-harvester-desktop.jpg) | [Desktop](after-village-harvester-desktop.jpg) | [Portrait](before-village-harvester-portrait.jpg) | [Portrait](after-village-harvester-portrait.jpg) |
| Village · Cantina host | [Desktop](before-village-cantina-desktop.jpg) | [Desktop](after-village-cantina-desktop.jpg) | [Portrait](before-village-cantina-portrait.jpg) | [Portrait](after-village-cantina-portrait.jpg) |
| Village · Cantina guest | [Desktop](before-village-guest-desktop.jpg) | [Desktop](after-village-guest-desktop.jpg) | [Portrait](before-village-guest-portrait.jpg) | [Portrait](after-village-guest-portrait.jpg) |
| Village · Cantina gathering | [Desktop](before-village-gathering-desktop.jpg) | [Desktop](after-village-gathering-desktop.jpg) | [Portrait](before-village-gathering-portrait.jpg) | [Portrait](after-village-gathering-portrait.jpg) |
| Village · Rower | [Desktop](before-village-rower-desktop.jpg) | [Desktop](after-village-rower-desktop.jpg) | [Portrait](before-village-rower-portrait.jpg) | [Portrait](after-village-rower-portrait.jpg) |
| Village · Cellar hand | [Desktop](before-village-cellar-hand-desktop.jpg) | [Desktop](after-village-cellar-hand-desktop.jpg) | [Portrait](before-village-cellar-hand-portrait.jpg) | [Portrait](after-village-cellar-hand-portrait.jpg) |
| Tidelight Coast · Pier hand | [Desktop](before-tidelight-pier-desktop.jpg) | [Desktop](after-tidelight-pier-desktop.jpg) | [Portrait](before-tidelight-pier-portrait.jpg) | [Portrait](after-tidelight-pier-portrait.jpg) |
| Tidelight Coast · Terrace taster | [Desktop](before-tidelight-taster-desktop.jpg) | [Desktop](after-tidelight-taster-desktop.jpg) | [Portrait](before-tidelight-taster-portrait.jpg) | [Portrait](after-tidelight-taster-portrait.jpg) |
| Sip Creek · Cooper and cask | [Desktop](before-creek-cooper-desktop.jpg) | [Desktop](after-creek-cooper-desktop.jpg) | [Portrait](before-creek-cooper-portrait.jpg) | [Portrait](after-creek-cooper-portrait.jpg) |
| Porter · Face close-up | [Desktop](before-face-desktop.jpg) | [Desktop](after-face-desktop.jpg) | [Portrait](before-face-portrait.jpg) | [Portrait](after-face-portrait.jpg) |
| Porter · Hand at the crate | [Desktop](before-hands-desktop.jpg) | [Desktop](after-hands-desktop.jpg) | [Portrait](before-hands-portrait.jpg) | [Portrait](after-hands-portrait.jpg) |
| Mesh detail by distance | [Desktop](before-lod-desktop.jpg) | [Desktop](after-lod-desktop.jpg) | [Portrait](before-lod-portrait.jpg) | [Portrait](after-lod-portrait.jpg) |
| Village · Cantina navigation | [Desktop](before-debug-village-desktop.jpg) | [Desktop](after-debug-village-desktop.jpg) | [Portrait](before-debug-village-portrait.jpg) | [Portrait](after-debug-village-portrait.jpg) |
| Tidelight Coast · Pier navigation | [Desktop](before-debug-tidelight-desktop.jpg) | [Desktop](after-debug-tidelight-desktop.jpg) | [Portrait](before-debug-tidelight-portrait.jpg) | [Portrait](after-debug-tidelight-portrait.jpg) |
| Sip Creek · Cooper station navigation | [Desktop](before-debug-creek-desktop.jpg) | [Desktop](after-debug-creek-desktop.jpg) | [Portrait](before-debug-creek-portrait.jpg) | [Portrait](after-debug-creek-portrait.jpg) |

## Rig inspection

| Mesh | Right-side poses |
| --- | --- |
| LOD0 | [Six joint poses](joint-poses-lod0.jpg) |
| LOD1 | [Six joint poses](joint-poses-lod1.jpg) |

The rig plates render the same procedurally generated pier hand in a separate, evenly lit view. Each joint plate shows elbow flexion, negative and positive wrist roll, combined elbow flexion and wrist roll, shoulder abduction, and knee flexion. The mesh comparison holds camera, pose and lighting constant. Its portrait version also shows each tier at a measured camera distance. The baseline generator supplies two mesh tiers. The updated pier hand uses 23,296 triangles at LOD0, 7,266 at LOD1 and 2,378 at LOD2.

The navigation comparisons use the same viewing offsets in both builds. The after views use `?debug=people`. The scene’s live counter appears at the lower left of each canvas export. All six captures at 2.4 seconds show zero intersections and zero contact errors. A single frame shows conditions at its capture time. The full-loop checks are in [check-people.mjs](../tools/check-people.mjs).

## Acceptance measurements

| Run | Report |
| --- | --- |
| Main at `99339be` | [Scene, rig and physics baseline](acceptance-main-99339be.json) |
| This branch | [Scene, rig and physics results](acceptance-branch.json) |
| Mobile physics under 4× CPU throttling | [Isolated timing run](acceptance-physics-isolated.json) |
| Mobile first frame and recovery | [Render timing and context recovery](acceptance-render.json) |
