# Sippy and Roma hair

The base of this branch is PR #25 at `654d73bff929c6b06ce422a6a030dfe66028ff23`. The current hair designs are keyed to Jonathan’s Sippy and Roma character sheets and the November 21 hair brief. Every groom and pattern was authored for Sip Studies.

## Groom layout

| Region | Sippy | Roma |
| --- | --- | --- |
| Hairline | The short crop opens above the ears and steps down at the temples. Fine, uneven tips break up the forehead edge. | The crown rises from a soft side part. Small hairline clumps overlap the front of a separate patterned red headband. |
| Mid-layer | Sweeps cross the top from the part. The comb tightens and turns into an off-center whorl and short nape. | Shoulder-length S-waves overlap in alternating directions. Inward layers shorten at the nape, and outward layers frame the face and hood. |
| Hero locks | Two swept forelocks and one temple lock carry six joints. | Two front, two temple, two shoulder-cascade and two nape locks carry 24 joints. |

An editable Blender guide scene can be saved from either authoring script. The native Bézier guides carry the silhouette, root placement and flow. Flattened, grooved sections follow the guides. The lower tier keeps the key guide paths and dynamic locks with fewer filler surfaces and shorter tessellation. The close underlay sits beneath the clumps and fills narrow seams around the real scalp. [Blender curve profiles](https://docs.blender.org/manual/en/4.5/modeling/geometry_nodes/curve/operations/curve_to_mesh.html) · [Pixar’s layered guide workflow](https://graphics.pixar.com/library/HairEmoting/paper.pdf)

The exported polygons carry root-to-tip tangents and pigment. Short hemisphere rays baked in Blender darken sheltered vertices along overlaps and in recessed grooves. The opaque physical hair material turns the cross-clump coordinate into fine, curved normal grooves and fades sub-pixel frequencies to limit shimmer. The physical anisotropic highlight and the shifted fiber lobe follow the same flow. [Scheuermann’s shifted highlights](https://history.siggraph.org/wp-content/uploads/2022/12/2004-Talks-Scheuermann_Practical-Real-Time-Hair-Rendering-and-Shading.pdf) · [Three.js physical material](https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial)

## Rebuild the assets

Run the commands from the repository root with Blender 4.3 or newer and Node. Install `@gltf-transform/core@4.5.1`, `@gltf-transform/extensions@4.5.1`, `@gltf-transform/functions@4.5.1` and `meshoptimizer@1.3.0` where Node can resolve the packer’s imports.

```sh
mkdir -p /tmp/sip-hair-raw
blender -b -t 2 -P tools/hair/sippy-groom.py -- /tmp/sip-hair-raw mobile
blender -b -t 2 -P tools/hair/sippy-groom.py -- /tmp/sip-hair-raw high
blender -b -t 2 -P tools/hair/roma-groom.py -- /tmp/sip-hair-raw
for hero in sippy roma; do
  for tier in mobile high; do
    node tools/hair/pack-groom.mjs "/tmp/sip-hair-raw/$hero-$tier.glb" \
      "docs/characters/assets/hair/$hero-$tier.glb.gz"
  done
done
```

The packer writes standard indexed, skinned glTF with quantized vertex attributes and meshopt-compressed buffer views. The gzip envelope keeps the binary transfer small on a static host. Unzip it with any gzip reader to inspect the GLB in a general-purpose glTF tool. The floor, Axon View and Character Ref use the same meshes. Only the selected hero and quality tier are needed for the initial floor frame. [Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html) · [Khronos meshopt extension](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression)
