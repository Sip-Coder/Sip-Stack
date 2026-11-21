# Axon View muscle atlas and skin

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. The LSDB Archive license page dated February 27, 2025 grants redistribution and adaptation under CC BY 4.0. The 2013 OBJ headers retain the historical attribution and share-alike notice under CC BY-SA 2.1 Japan. The archive publishes the current terms. [Official license and credit](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [Historical CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/)

## Source and adaptations

The anatomical source is the adult male BodyParts3D 4.0 muscular system. The supplied assets preserve 323 named anatomical surfaces from the muscular-system hierarchy in `isa_BP3D_4.0_obj_99.zip`. The source preparation converted axes and units, assigned English names from the atlas relationships, simplified the surfaces per tier, quantized the coordinates and applied meshopt compression. The Axon inspector registers the resulting surfaces to each character’s fitted skeleton and applies its own muscle and tendon rendering. Sip-Stack authors each character’s skin. [Archive download and concept data](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) · [Mitsuhashi et al., BodyParts3D](https://doi.org/10.1093/nar/gkn613)

A second offline simplification fits each tier’s inspection budget. Both packages retain all 323 source meshes. Source and release hashes, triangle counts, surface deviations and connected-component counts are recorded in the measurements. [Surface measurements and SHA-256](../review/scan-skeleton/muscle-lod-surface.json)


Several input names describe a compartment. For the bilateral plantaris, popliteus, soleus, brachioradialis, extensor digitorum, palmaris longus and supinator, the part picker shows the specific muscle in the DBCLS element table. The underlying source IDs are preserved. [Official IS-A anatomical element table](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_element_parts.txt)

| Packaged file | Source triangles | Shipped triangles | Shipped bytes |
|---|---:|---:|---:|
| [BodyParts3D Mobile](bp3d-muscles-mobile-meshopt.glb) | 101,144 | 76,558 | 601,264 |
| [BodyParts3D High](bp3d-muscles-high-meshopt.glb) | 272,194 | 155,766 | 888,340 |

## Visible Human Female lower limbs

The Visible Human Female lower-limb data were segmented by Thor E. Andreassen, Donald R. Hume, Landon D. Hamilton, Karen E. Walker, Sean E. Higinbotham and Kevin B. Shelburne at the University of Denver. Their 2022 dataset, DOI 10.56902/COB.vh.2022.1, derives from the U.S. National Library of Medicine Visible Human Project and carries CC BY 4.0. Their 2023 paper describes the semi-automated segmentation of 76 individual muscles. [Original repository record](https://digitalcommons.du.edu/visiblehuman/1/) · [Paper](https://doi.org/10.1038/s41597-022-01905-2) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Our input is the redistribution of these same muscles in `slorksmo/Human-Atlas` at commit `5bb5713aab18d7fe9380c3339eb09f173491ea06`. Its importer records the female donor, the source ZIP, the original `VHF_Left_*` and `VHF_Right_*` STL naming scheme, and the derivation of each `VHF:` concept. It welds and simplifies the surfaces and applies a uniform scale, axis rotation and translation to each regional group. Our build reads exclusively the 76 `donor-muscle` entries with matching female source IDs, from binary chunks 13 and 14. [Redistributor attribution](https://github.com/slorksmo/Human-Atlas/blob/5bb5713aab18d7fe9380c3339eb09f173491ea06/public/ATTRIBUTION.md#female-lower-limb-muscle) · [Redistributor import script](https://github.com/slorksmo/Human-Atlas/blob/5bb5713aab18d7fe9380c3339eb09f173491ea06/scripts/import-lower-limb.mjs)

Sip-Stack registers the left and right hip, thigh and shank separately in the common atlas coordinates using bounds of the pelvic bones, femoral epiphyses and tibial epiphyses. Each registration preserves the individual muscle’s proportions. The packages retain individual source concept IDs. Axon fits them to Roma’s posed CT skeleton, renders 60 female counterparts of supplied BodyParts3D structures, and adds the 16 donor muscles absent from that subset. These additions are the rectus femoris, three vasti, both biceps femoris heads and both gastrocnemius heads on each side. The remaining 263 muscles use the male atlas fitted to Roma, for 339 rendered muscles. [Node-by-node source and counterpart mapping](../review/scan-skeleton/female-muscle-mapping.json)

| Roma supplement | Muscles | Triangles | Bytes | SHA-256 |
|---|---:|---:|---:|---|
| [Female lower limbs, Mobile](vhf-muscles-mobile-meshopt.glb) | 76 | 12,178 | 119,324 | `8900dc7de1c03eaa806074a11b28deacb214d9d36d955887ec054f36f6b96220` |
| [Female lower limbs, High](vhf-muscles-high-meshopt.glb) | 76 | 32,920 | 198,972 | `66ff431372f882d87bbc67f87839e5fcea069e022a5d830654ba792a9b24b254` |

Both female supplements preserve 76 connected surfaces. Measured against all registered donor surfaces, 99% of bidirectional vertex and triangle-centroid samples fall within 0.090 inches on Mobile and 0.043 inches on High. [Female donor surface measurements](../review/scan-skeleton/female-muscle-lod-surface.json)

## Reproduce the packages

Copy both [BodyParts3D preparation](../../../tools/prepare-muscle-lod.mjs) and [female lower-limb preparation](../../../tools/prepare-female-muscles.mjs) into a scratch directory. Place the two originally supplied BodyParts3D GLBs inside an `original/` subdirectory. Run the following in that scratch directory.

```sh
npm install @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 @gltf-transform/extensions@4.5.1 meshoptimizer@1.3.0 three@0.170.0 three-mesh-bvh@0.8.3
mkdir -p output
node prepare-muscle-lod.mjs original/bp3d-muscles-mobile-meshopt.glb output/bp3d-muscles-mobile-meshopt.glb
node prepare-muscle-lod.mjs original/bp3d-muscles-high-meshopt.glb output/bp3d-muscles-high-meshopt.glb
git clone --filter=blob:none --no-checkout https://github.com/slorksmo/Human-Atlas.git
git -C Human-Atlas checkout 5bb5713aab18d7fe9380c3339eb09f173491ea06 -- public/models/atlas.json public/models/atlas-female.json public/models/female-{10,11,13,14}.bin public/models/body-{11,12,13}.bin
node prepare-female-muscles.mjs Human-Atlas/public/models original/bp3d-muscles-high-meshopt.glb output output/female-muscle-mapping.json aligned-vhf.glb
```

The final argument writes the unsimplified, pre-aligned donor to scratch for comparison. Run the [surface checker](../../../tools/check-inspection-lod.mjs) against that file and each packaged female GLB to reproduce the review measurements.
