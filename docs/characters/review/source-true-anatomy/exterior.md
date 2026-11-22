# Skin, fat and garment construction

The original soft skin uses 145 cross-sections per hero. The offline builder projects the source bones and muscle surfaces into local support polygons around each rig segment. It pads and smooths the sampled support, then saves only section centers and radii. At runtime, the selected actor builds its own indexed loft from those measurements. The torso, arms and legs use blended skin weights near their hinges. The source skeleton and muscles remain separate surfaces with their own attachment and deformation rules.

Original faces, eyes, hands and hair sit over the scan-derived pivots. The hairstyle adds a little height above the skeletal crown. Sippy's burgundy sleeves and soft collar are cut around his new shoulder, elbow and wrist positions. The charcoal vest retains its quilt pattern. His cream cargo legs use his measured hips, knees and ankles. Roma's mustard jacket and cream hoodie clear the rebuilt torso. Her emerald cargo waistband sits above the fitted pelvis. The compass, shoulder straps and crossbody bag follow the new silhouette. Both pairs of sneakers use the sampled heel and toe room. The floor, Axon and Character Ref use the same character builders.

Roma's left and right breast tissue and fat pads, gluteal fat and lateral hip/thigh fat are original modeled surfaces. The breasts follow the thorax, the gluteal pads follow the pelvis, and the hip pads follow the proximal thighs. They contribute to the sampled skin envelope and have independent visibility in Axon. At the published scale the sampled waist circumference is 34.30 in and the hip circumference is 46.23 in, a ratio of 0.742.

Roma's torso profile also uses 14 central width and depth measurements of the same subject's HuBMAP skin. The sampling window excludes the abducted arms and the youthful silhouette uses a thinner abdomen offset within the anatomical envelope. The reference mesh is used offline and only scalar measurements accompany the build. The source is *3D Reference Organ for Skin, Female v1.5* by Kristen Browne and Heidi Schlehlein, HuBMAP Human Reference Atlas, CC BY 4.0. [Record and DOI](https://doi.org/10.48539/HBM453.MVPL.398) · [Pinned source file](https://github.com/hubmapconsortium/hra-kg/blob/27d6d493cd53761abb10f087767ec4cc74acb051/digital-objects/ref-organ/skin-female/v1.5/raw/3d-vh-f-skin.glb) · [License](https://creativecommons.org/licenses/by/4.0/)

Rebuild the two lightweight profile modules using Node 22.15 or later and Three.js 0.170.0. Pass the official reference file through `HUBMAP_FEMALE_SKIN` to verify its hash and repeat the original silhouette measurements.

```sh
THREE_ROOT=/path/to/three HUBMAP_FEMALE_SKIN=/path/to/3d-vh-f-skin.glb node tools/build-human-exteriors.mjs
```
