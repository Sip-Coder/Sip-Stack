# Sippy and Roma face studies

The first row in each comparison shows the characters at `2fc3102`, after the anatomy rebuild and before the dedicated face pass. The second row uses the current Heros geometry and materials. All photographs come from the Character Ref studio renderer. Each actor retains the same orthographic scale across both rows. The neutral front, three-quarter, full profile and upward views show how the face and hair read from different angles.

| Character and tier | Matched before and after | Expressions |
|---|---|---|
| Sippy Mobile | [Four views](sippy-mobile-face-comparison.jpg) | [10 live expressions](sippy-mobile-expressions.jpg) |
| Sippy High | [Four views](sippy-high-face-comparison.jpg) | [10 live expressions](sippy-high-expressions.jpg) |
| Roma Mobile | [Four views](roma-mobile-face-comparison.jpg) | [9 live expressions](roma-mobile-expressions.jpg) |
| Roma High | [Four views](roma-high-face-comparison.jpg) | [9 live expressions](roma-high-expressions.jpg) |

The expression panels use actual authored Character Ref poses. The film shows the matched three-quarter before and after, a rendered camera orbit around each neutral face, and the current expressions as deliberate cuts. [Face study film](character-ref-face-studies.mp4)

The capture ledger records the camera angles, source and image hashes, and the exact front-view return after the other angles. [Capture ledger](capture.json) · [Full-body and anatomy studies](../media.md)

The production Character Ref checks rendered 38 live panels for Sippy and 37 for Roma on each tier. Every expression produced a distinct image. The checks also verified that Refresh picked up a live material edit, that finished photographs survived graphics context loss, and that recovery from a stale module produced a new portrait. [Browser verification](../../../../../tools/check-character-ref.py)
