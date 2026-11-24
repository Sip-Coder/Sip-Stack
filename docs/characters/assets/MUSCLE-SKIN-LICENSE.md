# Axon View muscle sources and skin references

## BodyParts3D

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. The LSDB Archive license page dated February 27, 2025 grants redistribution and adaptation under CC BY 4.0. The 2013 OBJ headers retain the historical CC BY-SA 2.1 Japan notice. [Official license and credit](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

The standalone packages match the supplied GLBs byte for byte. Their original export converted axes and units, retained anatomical names from the BodyParts3D 4.0 archive and simplified and compressed each tier. They supply 323 muscles and 34 individually labeled parts of the deltoid, pectoralis major, trapezius, biceps, quadriceps and gastrocnemius. Sippy’s meshes use the original supplied geometry with rigid per-part pose and the same uniform character scale as the skeleton. Roma’s adapted upper-body surfaces derive from this male atlas and use a landmark-based deformation to her female skeletal and skin proportions. [Archive download and concept data](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) · [Mitsuhashi et al., BodyParts3D](https://doi.org/10.1093/nar/gkn613) · [Source file fingerprints](../review/source-true-anatomy/source-files.json)

| Source pack | Mobile | High |
|---|---|---|
| 323 muscles | [Mobile GLB](bp3d-muscles-mobile-meshopt.glb) | [High GLB](bp3d-muscles-high-meshopt.glb) |
| 34 additional muscle parts | [Mobile GLB](bp3d-missing-muscles-mobile-meshopt.glb) | [High GLB](bp3d-missing-muscles-high-meshopt.glb) |

The Axon face views use 35 named BodyParts3D v3 surfaces, including buccinator and the orbital and palpebral portions of orbicularis oculi. The existing full-body packs do not include these faces. The v3 mirror converts the original OBJ surfaces to indexed-ready binary STL. Sippy’s pack keeps the mirrored STL coordinates and oriented triangles under one common uniform atlas scale and per-region rigid poses. Roma’s companion pack uses the same topology with offline adaptations to her CT landmarks and carries the label “adapted from male atlas.” Only the selected human’s face view fetches either pack. [Pinned v3 mirror](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D/tree/2c83c698788cff57f6317bddcf712e7acfbea7d8/assets/BodyParts3D_data) · [FMA IDs, source fingerprints and placements](../review/face-fine-tune/face-muscle-registration.json) · [Sippy GLB](sippy-face-bp3d-meshopt.glb) · [Roma GLB](roma-face-bp3d-meshopt.glb)

## Z-Anatomy

Latissimus dorsi and rectus abdominis: Z-Anatomy (https://github.com/Z-Anatomy/Models-of-human-anatomy), CC BY-SA 4.0, derived from BodyParts3D. Share-alike applies to this pack. The four surfaces come from the bilateral latissimus dorsi and rectus abdominis in the muscular-system collection of Z-Anatomy’s `Startup.blend`. Sippy uses the byte-matched supplied GLBs and poses their surfaces rigidly. Roma’s landmark-adapted Z-Anatomy parts remain separate from BodyParts3D in their own CC BY-SA GLBs. [Z-Anatomy source](https://github.com/Z-Anatomy/Models-of-human-anatomy) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) · [Mobile source GLB](zanatomy-lats-rectus-mobile-meshopt.glb) · [High source GLB](zanatomy-lats-rectus-high-meshopt.glb)

## Visible Human Female lower limbs

The Visible Human Female lower-limb data were segmented by Thor E. Andreassen, Donald R. Hume, Landon D. Hamilton, Karen E. Walker, Sean E. Higinbotham and Kevin B. Shelburne at the University of Denver. Their dataset, DOI 10.56902/COB.vh.2022.1, derives from the U.S. National Library of Medicine Visible Human Project and carries CC BY 4.0. The 2023 paper describes their preparation of the final 3D models. [University of Denver dataset](https://digitalcommons.du.edu/visiblehuman/1/) · [Paper](https://doi.org/10.1038/s41597-022-01905-2) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

The laboratory mirror at the pinned `ingvilddevold/muscle-growth` revision identifies its `data/VHF_surfaces` folder as a copy of the publication surfaces. The 76 female muscle STLs in that folder are the GLB inputs. Sip-Stack preserves the published float32 coordinates and each oriented triangle. Packaging welds duplicate coordinates, losslessly reorders vertices and index lists for meshopt and adds smooth normals for shading. The single glTF scene root converts the millimetre axes to metres and places the donor origin against the corresponding BoneHub scan. Axon applies Roma’s uniform character scale and rigid part rotations and translations. [Pinned mirror, source and license statement](https://github.com/ingvilddevold/muscle-growth/tree/16b27795d6b8d1db06f7523f9d9eedea959935ae#realistic-muscle-geometries) · [Shared lower-limb source GLB](vhf-muscles-source-meshopt.glb) · [Per-STL SHA-256 and exact triangle verification](../review/source-true-anatomy/andreassen-stl-proof.json)

The research mirror contains the 76 muscles and companion skeletal surfaces. The University of Denver’s dataset also lists intermuscular fat and fascia and outer fat, dermis and epidermis. Those two fat meshes were unavailable from the mirror, and the publisher’s archive download returned HTTP 403. [Published tissue inventory](https://doi.org/10.1038/s41597-022-01905-2)

## Skin shape references

“3D Reference Organ for Skin, Male v1.4” by Kristen Browne and Heidi Schlehlein, HuBMAP Human Reference Atlas, CC BY 4.0, derived from the U.S. National Library of Medicine Visible Human Project. [Male reference, DOI 10.48539/HBM953.DCMN.563](https://doi.org/10.48539/HBM953.DCMN.563)

“3D Reference Organ for Skin, Female v1.5” by Kristen Browne and Heidi Schlehlein, HuBMAP Human Reference Atlas, CC BY 4.0, derived from the U.S. National Library of Medicine Visible Human Project. Sip-Stack uses the silhouettes and body dimensions as references for the authored exterior. [Female reference, DOI 10.48539/HBM453.MVPL.398](https://doi.org/10.48539/HBM453.MVPL.398) · [HuBMAP source files](https://github.com/hubmapconsortium/hra-kg/tree/27d6d493cd53761abb10f087767ec4cc74acb051/digital-objects/ref-organ)

## Reproduce the Visible Human Female package

The builder verifies every decoded vertex and counts all original oriented triangles, including duplicates, before writing the pack. Install meshoptimizer 1.3.0 for Node.js and check out the mirror at its pinned revision. [Pack builder](../../../tools/pack-andreassen-source.mjs)

```sh
git clone --filter=blob:none --no-checkout https://github.com/ingvilddevold/muscle-growth.git /tmp/muscle-growth
git -C /tmp/muscle-growth checkout 16b27795d6b8d1db06f7523f9d9eedea959935ae -- data/VHF_surfaces
npm install --prefix /tmp/axon-tools meshoptimizer@1.3.0
MESHOPT_ROOT=/tmp/axon-tools/node_modules/meshoptimizer node tools/pack-andreassen-source.mjs /tmp/muscle-growth/data/VHF_surfaces /tmp/vhf-muscles-source-meshopt.glb /tmp/andreassen-stl-proof.json
```
