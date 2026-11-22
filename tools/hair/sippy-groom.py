"""Build Sippy's original short groom in Blender 4.3+.

blender -b --python-exit-code 1 -P tools/hair/sippy-groom.py -- /path/to/raw [high|mobile]

The optional third argument saves an editable .blend with the native guide
curves kept in their own collection. All authored dimensions are in Sippy's
head-local units (+Y up, +Z forward). glTF restores that basis at export.
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import interpolate_bezier


# The same cranial sections as the pinned Sippy face sculpt. The opening of
# each temple is set from the brow and the helix, then the nape is swept back.
SKULL = (
    (0.006, .015, .018, .005), (0.012, .031, .031, .006),
    (0.025, .045, .039, .0035), (0.042, .051, .046, .001),
    (0.053, .0545, .049, 0), (0.067, .058, .052, 0),
    (0.080, .056, .050, -.001), (0.094, .055, .051, -.002),
    (0.107, .052, .045, -.003), (0.119, .036, .032, -.007),
    (0.128, .010, .010, -.008),
)
HEAD_CENTER = Vector((-.002, .075, -.004))

def xyz(p):
    return (p[0], -p[2], p[1])


def seat_crown(point):
    # Allow a rounded lift at the front while keeping the hairstyle within
    # the standing-height allowance. Rear and temple controls remain unchanged.
    x, y, z = point
    rise = max(0., y-.121)
    loft = y-.46*(rise+.0024*math.expm1(-rise/.0024))
    return x, loft-.0059*smooth(.127,.1406,loft), z


def clip(v, lo=0, hi=1):
    return max(lo, min(hi, v))


def mix(a, b, t):
    return a + (b - a) * t


def smooth(a, b, x):
    t = clip((x-a)/(b-a))
    return t*t*(3-2*t)


def hermite(a, b, c, d, t):
    return (b + .32*(c-a)*t + (3*(c-b)-.64*(c-a)-.32*(d-b))*t*t
            + (2*(b-c)+.32*(c-a+d-b))*t*t*t)


def profile(y):
    j = next((i for i in range(len(SKULL)-1) if y < SKULL[i+1][0]), len(SKULL)-2)
    a, b, c, d = (SKULL[max(0, j-1)], SKULL[j], SKULL[j+1], SKULL[min(j+2, len(SKULL)-1)])
    t = clip((y-b[0])/(c[0]-b[0]))
    return tuple(hermite(a[k], b[k], c[k], d[k], t) for k in (1,2,3))


def skull_point(a, y, lift=0):
    w, d, z0 = profile(y)
    return Vector(((w+lift)*math.sin(a), y, z0+(d+lift)*math.cos(a)))


def border(a):
    side = abs(a)
    f = max(0, math.cos(a))
    # Small asymmetry marks the recession, side part and first strands at
    # the forehead. The narrow sideburn drops in front of the open helix.
    forehead = .039 + .069*((1+math.cos(a))*.5)**1.52
    arc = .018*math.exp(-((side-1.57)/.26)**2)
    temple = .0105*math.exp(-((side-1.09)/.145)**2)
    part = .0035*math.exp(-((a-.63)/.23)**2)
    nape = (.0073*smooth(.18,1.03,math.pi-side)*smooth(1.69,2.37,side)
            - .0028*math.exp(-((math.pi-side)/.55)**2))
    return forehead + arc - temple + part + nape + .0007*f*math.cos(4*a+.5)


def linear(s):
    c = int(s, 16)/255
    return c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4


def ink(hex_color):
    return [linear(hex_color[i:i+2]) for i in (1,3,5)]


class Surface:
    def __init__(self):
        self.points = []
        self.faces = []
        self.coordinates = []
        self.colors = []

    def add(self, p, uv, rgb):
        self.points.append(xyz(seat_crown(p)))
        self.coordinates.append(uv)
        self.colors.append((*rgb, 1))
        return len(self.points)-1

    def strip(self, prev, ring):
        for j in range(len(ring)-1):
            self.faces.append((prev[j], prev[j+1], ring[j+1], ring[j]))

    def bake(self, name, material, parts, chain=None):
        data = bpy.data.meshes.new(name)
        data.from_pydata(self.points, [], self.faces)
        data.update()
        uv = data.uv_layers.new(name='Root to tip')
        col = data.color_attributes.new(name='Chocolate', type='BYTE_COLOR', domain='POINT')
        static_ao = self.ambient_occlusion(data) if not chain else ()
        for i, rgb in enumerate(self.colors):
            shade = static_ao[i] if static_ao else 1
            col.data[i].color = (*(c*shade for c in rgb[:3]), 1)
        for polygon in data.polygons:
            polygon.use_smooth = True
            for index in polygon.loop_indices:
                uv.data[index].uv = self.coordinates[data.loops[index].vertex_index]
        data.materials.append(material)
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        obj['hairPart'] = parts
        obj['hairLabel'] = name.removeprefix('Sippy ')
        if chain:
            obj['hairChain'] = [list(seat_crown(p)) for p in chain]
            obj['hairRegion'] = parts
        return obj

    def ambient_occlusion(self, data):
        # Authored vertex AO from actual nearby clumps. Five weighted
        # hemisphere probes darken contact channels without a runtime pass.
        tree = BVHTree.FromPolygons(self.points, self.faces)
        look = Vector((0,0,1))
        up = Vector((0,1,0))
        radius = .010
        result = []
        for vertex in data.vertices:
            normal = vertex.normal
            across = normal.cross(look if abs(normal.z) < .94 else up).normalized()
            along = normal.cross(across)
            origin = vertex.co + normal*.00012
            occlusion = 0
            for direction in (normal, normal*.60+across*.80, normal*.60-across*.80,
                              normal*.60+along*.80, normal*.60-along*.80):
                _, _, _, distance = tree.ray_cast(origin, direction, radius)
                if distance is not None:
                    occlusion += 1 - smooth(.0003, radius, distance)
            result.append(1 - occlusion*.054)
        return result


def native_guide(name, points, collection):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 16
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for knot, here in zip(spline.bezier_points, points):
        knot.co = xyz(here)
        knot.handle_left_type = 'AUTO'
        knot.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    # Blender computes the native Bézier handles. Evaluate those handles
    # instead of rebuilding the guide with a second interpolation algorithm.
    bpy.context.view_layer.update()
    out = []
    for a, b in zip(spline.bezier_points, spline.bezier_points[1:]):
        out.extend(interpolate_bezier(a.co, a.handle_right, b.handle_left, b.co, 19)[:-1])
    out.append(spline.bezier_points[-1].co)
    return [Vector((p.x, p.z, -p.y)) for p in out]


def resample(points, count):
    length = [0]
    for a, b in zip(points, points[1:]):
        length.append(length[-1] + (b-a).length)
    j = 1
    out = []
    for i in range(count+1):
        target = i*length[-1]/count
        while length[j] < target and j < len(length)-1:
            j += 1
        out.append(points[j-1].lerp(points[j], clip((target-length[j-1])/(length[j]-length[j-1]))))
    return out


def swept_lock(out, guide, width, loft, color, high, *, flare=0, segments=None):
    """A rounded, closed lock with the comb direction stored in the U axis."""
    steps = segments or (22 if high else 16)
    sides = 14 if high else 10
    path = resample(guide, steps)
    dye = ink(color)
    previous = []
    for j, center in enumerate(path):
        u = j/steps
        tangent = (path[min(steps, j+1)]-path[max(0, j-1)]).normalized()
        normal = center - HEAD_CENTER
        normal -= tangent*normal.dot(tangent)
        normal.normalize()
        across = normal.cross(tangent).normalized()
        if flare:
            twist = flare*math.sin(math.pi*u)
            across, normal = (
                across*math.cos(twist)+normal*math.sin(twist),
                normal*math.cos(twist)-across*math.sin(twist),
            )
        brightness = .85 + .19*smooth(.02,.65,u) - .14*smooth(.86,1.,u)
        rgb = [c*brightness for c in dye]
        if j == 0 or j == steps:
            end = out.add(center, (u,.25), rgb)
            for left, right in zip(previous, previous[1:]):
                out.faces.append((left, right, end))
            previous = [end]
            continue
        fullness = math.sin(math.pi*u)**.48
        breadth = fullness*(1-.16*smooth(.47,1.,u))
        current = []
        for i in range(sides+1):
            v = i/sides
            angle = math.tau*v
            x, y = math.cos(angle), math.sin(angle)
            # Convex outer face and a shallow buried return. Keeping the
            # profile smooth leaves the individual fibres to the BRDF.
            if y < 0:
                y *= .42
            point = center + across*(x*width*breadth) + normal*(y*loft*fullness)
            shade = 1. + .055*y
            current.append(out.add(point, (u,v), [c*shade for c in rgb]))
        if len(previous) == 1:
            for left, right in zip(current, current[1:]):
                out.faces.append((previous[0], right, left))
        else:
            out.strip(previous, current)
        previous = current


def scalp_shell(out, high):
    # Seat the temple, neckline and part with a continuous interior surface.
    # The dark curved part runs back from the high right forehead into the crown.
    rings, sectors = (23,88) if high else (16,64)
    dye = ink('#3b251b')
    previous = []
    for j in range(rings):
        u = j/rings
        current = []
        for i in range(sectors+1):
            r = i/sectors
            azimuth = r*math.tau-math.pi
            turn = smooth(.08,.96,u)
            a = azimuth - (.91*turn+.11*math.sin(math.pi*turn))*(.66-.34*math.cos(azimuth))
            part = .64 - .83*u
            part_bed = math.exp(-((a-part)/.17)**2)*(1-smooth(.56,.91,u))
            support = smooth(.04,.23,u)
            q = smooth(.38,.84,u)
            y = mix(border(azimuth), .1285, math.sin(u*math.pi*.5))
            # Low, broad swell along the side flow. Sculpting it into the
            # same surface keeps the taper connected to the nape and whorl.
            back = smooth(.92, 2.09, abs(azimuth))
            sweep = smooth(.16,.46,u)*(1-smooth(.78,.99,u))
            roll = 0.
            for lane, width, weight in ((-1.12,.26,.77),(-.61,.29,1.),(-.04,.27,.90),
                                        (.54,.25,.74),(1.11,.31,.62)):
                separation = math.remainder(azimuth-math.pi-lane, math.tau)
                roll += weight*math.exp(-(separation/width)**2)
            rear_loft = .0108*back*roll*sweep
            seat = math.exp(-((a-.57+.42*u)/.53)**2)
            under_fold = .0038*seat*sweep*(1-.57*part_bed)
            margin = (mix(-.00055, .0020, support) + q*(.0060 - .0026*part_bed)
                      + rear_loft + under_fold)
            p = skull_point(a, y, margin)
            if u > .88:
                crown = (1-u)/.12
                p.x *= crown
                p.z = mix(-.008,p.z,crown)
            front_lift = .0044 + .0051*(.5+.5*math.cos(a+.43))
            p.y += front_lift*q + .23*rear_loft
            shade = .88 + .10*u - .15*part_bed*support + .15*back*roll*sweep
            # The UVs follow the wrap into the crown. This gentle skew also
            # keeps the baseline aligned where sculpted lock edges blend in.
            v = r + .065*math.sin(math.pi*r)*math.sin(math.pi*u)*math.sin(a+1.1)
            u_flow = u + .11*math.sin(a+.7)*math.sin(math.pi*u)
            current.append(out.add(p, (u_flow,v), [c*shade for c in dye]))
        if previous:
            out.strip(previous, current)
        previous = current
    crown = out.add(Vector((-.002,.138,-.004)), (1,.5), dye)
    for left, right in zip(previous, previous[1:]):
        out.faces.append((left, right, crown))


def base_locks(curves, high):
    steady = Surface()
    scalp_shell(steady, high)
    # A few distinct overlapping planes: a seated front fold, the curved
    # crest cradle, a diagonal middle roll and two rear turning forms.
    crown = (
        ('Front fold', .0127, .0052, '#42281c', -.20,
         ((.039,.106,.034),(.031,.117,.046),(.017,.131,.049),(.000,.136,.044),
          (-.023,.135,.036),(-.041,.120,.027),(-.047,.108,.016))),
        ('Quiff cradle', .0127, .0048, '#492d21', .21,
         ((.040,.102,.017),(.030,.123,.032),(.015,.134,.038),(-.008,.141,.035),
          (-.035,.134,.024),(-.048,.117,.014),(-.052,.105,.006))),
        ('Part bridge', .0086, .0047, '#432a1f', -.14,
         ((.055,.091,.025),(.047,.104,.030),(.037,.114,.035),(.033,.120,.036),
          (.027,.130,.037),(.011,.137,.040))),
        ('Middle turn', .0120, .0055, '#46291e', .26,
         ((.039,.103,.005),(.028,.125,.013),(.003,.136,.014),(-.019,.137,.008),
          (-.037,.129,-.006),(-.045,.114,-.012),(-.051,.101,-.009))),
        ('Crown roll', .0128, .0047, '#492c20', -.23,
         ((.042,.102,-.013),(.027,.122,-.008),(.007,.132,-.010),(-.020,.132,-.019),
          (-.036,.117,-.030),(-.044,.107,-.031),(-.043,.098,-.029))),
    )
    for label, width, loft, color, flare, points in crown:
        guide = native_guide(label, points, curves)
        swept_lock(steady, guide, width, loft, color, high, flare=flare)

    part_edge = (
        ((.034,.108,.036),(.043,.106,.034),(.051,.099,.027),(.055,.091,.021),(.056,.087,.014)),
        ((.038,.111,.021),(.047,.107,.018),(.055,.096,.016),(.058,.085,.010),(.057,.078,.004)),
    )
    for i, controls in enumerate(part_edge):
        guide = native_guide(f'Part-side trim {i+1}', controls, curves)
        swept_lock(steady, guide, .0049, .0015, '#40271b', high, flare=-.10,
                   segments=14 if high else 10)
    return steady


def strategic_clumps(curves, material, high):
    # Two lifted crest rolls and a short temple sweep ride the existing
    # two-bone chains. End caps stay aligned to the authored guide tips.
    islands = (
        ('Forelock crest', 'quiff', .0125, .0063, '#4e3124', .33,
         ((.036,.108,.036),(.032,.118,.048),(.019,.130,.050),(.007,.142,.044),
          (-.011,.149,.031),(-.029,.144,.023),(-.041,.131,.022),
          (-.046,.121,.024),(-.046,.113,.021))),
        ('Broken wave', 'quiff', .0113, .0055, '#482d21', -.24,
         ((.034,.106,.015),(.030,.122,.027),(.015,.134,.031),(-.005,.142,.024),
          (-.026,.143,.011),(-.040,.133,-.001),(-.050,.121,-.004),
          (-.054,.111,.000),(-.054,.108,.005))),
        ('Part-side temple', 'temple', .0046, .0024, '#41291e', .12,
         ((.036,.107,.034),(.043,.110,.032),(.050,.105,.029),
          (.054,.098,.024),(.056,.091,.018),(.058,.082,.013))),
    )
    meshes = []
    for label, feature, width, loft, color, flare, points in islands:
        surface = Surface()
        guide = native_guide(label, points, curves)
        swept_lock(surface, guide, width, loft, color, high, flare=flare)
        meshes.append(surface.bake(f'Sippy {label}', material, feature, resample(guide,2)))
    return meshes


def build(output, tier, edit=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    guides = bpy.data.collections.new('Sippy / original editable groom guides')
    scene.collection.children.link(guides)
    mat = bpy.data.materials.new('Sippy / chocolate hair fibres')
    mat.use_nodes = True
    mat.use_backface_culling = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .52
    bsdf.inputs['Anisotropic'].default_value = .58
    bsdf.inputs['Specular IOR Level'].default_value = .37
    vertex_color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex_color.layer_name = 'Chocolate'
    mat.node_tree.links.new(vertex_color.outputs['Color'], bsdf.inputs['Base Color'])
    high = tier == 'high'
    static = base_locks(guides, high).bake('Sippy scalp, comb and nape', mat, 'crown')
    models = [static, *strategic_clumps(guides, mat, high)]
    guides.hide_render = True
    guides.hide_viewport = True
    bpy.ops.object.select_all(action='DESELECT')
    for model in models:
        model.select_set(True)
    bpy.context.view_layer.objects.active = static
    if edit:
        bpy.ops.wm.save_as_mainfile(filepath=str(edit))
    bpy.ops.export_scene.gltf(filepath=str(output), use_selection=True, export_extras=True,
                              export_vertex_color='ACTIVE', export_normals=True, export_tangents=True)
    print(tier, 'Sippy triangles', sum(len(m.data.loop_triangles) for m in models))


def main():
    raw, *options = sys.argv[sys.argv.index('--')+1:]
    output = Path(raw).resolve()
    output.mkdir(parents=True, exist_ok=True)
    for tier in options[:1] or ['mobile', 'high']:
        if tier not in ('mobile', 'high'):
            raise ValueError('Choose mobile or high')
        build(output/f'sippy-{tier}.glb', tier, Path(options[1]).resolve() if len(options) > 1 else None)


if __name__ == '__main__':
    main()
