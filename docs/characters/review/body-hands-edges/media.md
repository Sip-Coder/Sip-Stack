# Sippy body, hands and mobile edges

The plates compare the live Heros simulator from the final PR #24 head, current main at `e8c6ed6`, and this PR. Each set uses the matched camera framing, studio lighting, and settled idle pose. The capture harness controls the camera and removes the HUD and touch overlays from the hand crops. The phone viewport is 412 × 915 CSS px at 2.6× display DPR with Mobile quality. The desktop viewport is 1,440 × 960 CSS px at 1× display DPR with High quality. The plates retain the rendered simulator stage at native display resolution. The HUD values are single-frame readings.

| View | Phone · Mobile | Desktop · High |
| --- | --- | --- |
| Front and profile | [Phone comparison](sippy-phone-silhouette.png) | [Desktop comparison](sippy-desktop-silhouette.png) |
| Relaxed left hand, two angles | [Mobile hand close-ups](sippy-phone-hands.png) | [High hand close-ups](sippy-desktop-hands.png) |

At this phone viewport, the drawing buffer rises from 382 × 522 on both baselines to 573 × 783 in this PR. The sleeve plate crops the same region of the phone frames. Its upper strip preserves the native display pixels and its lower strip enlarges them 5× with nearest-neighbor sampling. [Phone edge comparison](sippy-phone-sleeve-edges.png)

The five-second video turns around the High-quality simulator actor in a fixed idle pose. The camera covers 360° in 4° steps. The narrower canvas keeps the desktop render height while cropping the unused space beside the figure. [Turnaround film](sippy-turnaround.mp4)

The capture ledger records the checkout and served source hashes, camera positions in inches, actual drawing buffer and display sizes, and delivery file hashes. [Capture ledger](capture.json)
