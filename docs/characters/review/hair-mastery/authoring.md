# Sippy and Roma hair

The base of this branch is PR #25 at `654d73bff929c6b06ce422a6a030dfe66028ff23`. The visual comparison uses Jonathan’s character sheets and the finer pass at `d116849`. Every groom and pattern was authored for Sip Studies.

## Groom layout

| Region | Sippy | Roma |
| --- | --- | --- |
| Hairline | A clean side part separates the lifted quiff from the short temple taper. The lower hairline arcs around the ears into the nape. | The crown rolls away from an open forehead, with rounded hairline curls beneath the patterned red headband. |
| Mid-layer | Overlapping rolls lift the front and flow back into the crown. Low relief follows the comb direction through the short sides and nape. | Staggered spiral sections fill the shoulders. Rounded face curls frame the cheek and leave space around the earrings. |
| Hero locks | Two swept forelocks and one temple lock carry six joints. | Two front, two temple, two shoulder-cascade and two nape locks carry 24 joints. |

An editable Blender guide scene can be saved from either authoring script. Native Bézier guides carry the silhouette, root placement and flow. Smooth convex sections follow the curves with the ends tucked into adjoining sections or the underlayer. The lower tier keeps the key guide paths and dynamic locks with simpler tessellation. [Blender curve profiles](https://docs.blender.org/manual/en/4.5/modeling/geometry_nodes/curve/operations/curve_to_mesh.html) · [Pixar’s layered guide workflow](https://graphics.pixar.com/library/HairEmoting/paper.pdf)

The exported polygons carry root-to-tip tangents and pigment. Short hemisphere rays baked in Blender darken sheltered vertices at overlaps. Individual fiber detail comes from narrow variations in color and roughness over smooth surface normals. At normal viewing distances these variations filter below a pixel and the gloss follows the rounded curl. The physical anisotropic highlight and shifted fiber lobe follow the curve tangents. [Scheuermann’s shifted highlights](https://history.siggraph.org/wp-content/uploads/2022/12/2004-Talks-Scheuermann_Practical-Real-Time-Hair-Rendering-and-Shading.pdf) · [Three.js physical material](https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial)

## Fiber scale

Nominal spacing is the width of a representative section divided by the number of primary shader fibers across its exposed UV range. The new sections in this comparison are about 0.91 in wide in the authored head-local frame.

| Hero | Pitch at `d116849`, in | Revised pitch, in | Ratio |
| --- | ---: | ---: | ---: |
| Sippy | 0.0217 | 0.00135 | 16.1× |
| Roma | 0.0772 | 0.00459 | 16.8× |

Curvature, taper and foreshortening change apparent spacing in the image. The surface uses opaque bundles with closely spaced reflectance detail.

The matched neutral projections record the effects of lifting Sippy’s crest and rebuilding Roma’s ringlet outline. [Four-angle silhouette measurements](strand-silhouettes.json)

HAELE 3D informed loose tip separation, the moving highlight band, and the response to abrupt stops and a backward tilt. The models, curves, and materials are original Blender work and follow Jonathan’s character sheets. [HAELE 3D motion reference](https://x.com/haele3d/status/2110397355623358674)

Head and body inertia move the guides away from their curved rest shape. Gravity redirects the tips as the head tilts. Root joints stay pinned and the solver preserves guide segment lengths while the tips slide along the padded collision volumes. [Shake, clearance and reduced-motion audit](motion-check.json)

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

The packer writes standard indexed, skinned glTF with quantized vertex attributes and meshopt-compressed buffer views. Keeping the rings in Blender’s export order improves compression for these strands. The gzip envelope keeps the binary transfer small on a static host. Unzip it with any gzip reader to inspect the GLB in a general-purpose glTF tool. The floor, Axon View and Character Ref use the same meshes. Only the selected hero and quality tier are needed for the initial floor frame. [Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html) · [Khronos meshopt extension](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression)
