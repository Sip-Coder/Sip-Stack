# Sippy and Roma hair review

The turnarounds use the same neutral pose, orthographic camera and Character Ref studio lights on PR #25, the first PR #26 pass at `c2604a7`, and the finer-strand pass.

| Character | Mobile | High | Close-ups and calibrated macro |
| --- | --- | --- | --- |
| Sippy | [Turnaround](sippy-mobile-turnaround.jpg) | [Turnaround](sippy-high-turnaround.jpg) | [Part, crown whorl and nape](sippy-hair-close-ups.jpg) |
| Roma | [Turnaround](roma-mobile-turnaround.jpg) | [Turnaround](roma-high-turnaround.jpg) | [Band, shoulder cascade and curl bend](roma-hair-close-ups.jpg) |

Jonathan’s character sheets set the design targets called out on each plate. The official crop files remain unavailable. The close-ups pair the first PR #26 pass with the refined Mobile and High grooms. In the macro rows, each ¼ in scale bar represents the same projected scene distance. The width target for an individual visible strand is about one-sixteenth of a former lock. [Annotated guide layout](guide-layout.jpg) · [Blender authoring](authoring.md)

The matched neutral-pose hair masks overlap by 95.1–97.9% across Sippy’s six cameras and both tiers. His projected crown height is unchanged at capture resolution. Roma’s hair masks overlap by 89.6–95.0%, and each view’s width, crown and lowest edge shifts by less than 0.30 in. These masks count visible hair in the full character render and exclude Roma’s headband. [Capture ledger](capture.json)

## Motion

The 20.6-second simulator film shows idle sway, a head turn, walking and settling at High quality. Roma starts at 0:09.35. The final cut at 0:18.70 shows the same walking input with reduced motion and fixed hair relative to the head. [Simulator motion film](hair-motion.mp4)

Each 5.30-second study pairs the same fixed-tick head input and stop, followed by a held back tilt and release, with excerpts from HAELE 3D’s hair physics demonstration. The shake uses source time 0:00.00–0:02.80. The tilt uses 0:21.65–0:24.15. HAELE 3D footage is a reference for strand fineness and movement. [Sippy physics comparison](sippy-hair-physics.mp4) · [Roma physics comparison](roma-hair-physics.mp4) · [HAELE 3D reference](https://x.com/haele3d/status/2110397355623358674)

The motion audit measured three rebounds for the selected Sippy forelock and Roma wave. They reached near rest 1.23 s and 1.80 s after the stop, respectively. On the held back tilt, four of Roma’s rear guides reached the padded collar’s contact neighborhood while the rendered tips cleared it. [Motion audit](motion-check.json)
