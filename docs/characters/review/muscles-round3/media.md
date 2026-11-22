# Axon View muscle review

The turnaround pairs use the same character pose, ortho camera, zoom and Axon studio lighting on both builds. The top row comes from merged PR #23 at `1eab056`. The bottom row uses the baked character and tier in this branch. Only bone and muscle layers are visible. Each plate shows the front, left profile, back and a 32° front three-quarter view. A repeat front capture after the orbit matches the original front image byte for byte. [Capture settings and asset hashes](capture.json)

| Hero | Mobile | High | High detail crops |
|---|---|---|---|
| Sippy | [Four views](sippy-mobile.jpg) | [Four views](sippy-high.jpg) | [Upper body, knee and calf](sippy-details.jpg) |
| Roma | [Four views](roma-mobile.jpg) | [Four views](roma-high.jpg) | [Upper body, knee and calf](roma-details.jpg) |

The detail sheets pair the chest, posterior trunk, abdominal wall, thigh and calf at matching magnifications. Sippy’s quadriceps and gastrocnemius come from the male BodyParts3D atlas. Roma’s lower limbs retain the Andreassen female donor.

## Source overlays

The comparison reconstructs the four inline reference previews from their source surfaces. Its first column shows the supplied 34 BodyParts3D additions and four Z-Anatomy additions over the donor skeleton. Its second column also includes the supplied 323-part atlas. All three muscle GLBs use their original High-tier coordinates. The donor skeleton comes from the upstream Blender file’s skeletal collection at revision `d14fa54355a3b484cefd08c33f6e18526d9aea85`. The remaining four columns pair each hero’s PR #23 and Round 3 fits through the same Axon camera. The original preview’s ivory, rust, coral and gold colors identify sources in the two donor columns. [Reference overlays beside Sippy and Roma](reference-to-rig.jpg) · [Z-Anatomy source revision](https://github.com/Z-Anatomy/Models-of-human-anatomy/tree/d14fa54355a3b484cefd08c33f6e18526d9aea85)

The isolation study uses the actual High-tier fitted geometry of the eight requested families. It shows the sources in front, profile and back views and applies a separate review color to each source. The teal regions on Roma are her existing female quadriceps and gastrocnemius. The four-view turnaround sheets above show the materials used in the application. [Superficial groups on the donor and both fitted skeletons](superficial-groups.jpg)

## Film

The film opens each hero’s inspector in a fresh browser context on the High tier. It records the browser during first open with idle intervals shortened, then follows the real Axon canvas through a pointer orbit, a four-layer axial explode and reassembly. The percent in the footer comes from the live range control. The H.264 film runs 29.3 seconds at 24 frames per second. Comparative first-open timings and transfer measurements come from the separate performance run. [First open, orbit and explode](axon-open-orbit-explode.mp4)

## Credits and image licenses

The photographs and film adapt the listed 3D geometry for presentation, camera placement and rendering. The Z-Anatomy adaptations shown in these plates and the film are available under CC BY-SA 4.0. The links below give the licenses for the underlying geometry. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

- BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. [DBCLS license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)
- Latissimus dorsi and rectus abdominis: Z-Anatomy (https://github.com/Z-Anatomy/Models-of-human-anatomy), CC BY-SA 4.0, derived from BodyParts3D. Share-alike applies to this pack.
- The review-only donor skeleton uses “Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0,” derived from “BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan.” It is rendered in its source pose. [Upstream attribution](https://github.com/Z-Anatomy/Models-of-human-anatomy/blob/d14fa54355a3b484cefd08c33f6e18526d9aea85/License.txt)
- Visible-Human-3d-Models by Seyed Hamidreza Alavi and Malte Asseln, BoneHub at the University of Twente, CC BY 4.0. Female lower-limb musculature by T. E. Andreassen et al., CC BY 4.0. [Skeleton source and modifications](../../assets/SKELETON-LICENSE.md) · [Muscle sources and adaptations](../../assets/MUSCLE-SKIN-LICENSE.md)
