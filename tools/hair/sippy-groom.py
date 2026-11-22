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
CHOCOLATE = ('#39241b', '#4e2e20', '#523322', '#44291e', '#553422', '#45291e')

# Shallow closed sections keep the overlapping fibres opaque from every angle.
FIBRE_PROFILE = ((1, 0, 0), (.16, 1, .24), (-1, 0, .5), (0, -.37, .76), (1, 0, 1))
FILL_PROFILE = ((1, 0, 0), (.13, 1, .25), (-1, -.20, .5), (1, 0, 1))


def xyz(p):
    return (p[0], -p[2], p[1])


def seat_crown(point):
    # Compress only the loft above the vertex of the brow-to-crown shell.
    # The cut retains the ear, frontal hairline and the source rig's stature.
    x, y, z = point
    loft = max(0, y-.126)
    # Keep a slight asymmetric crest at the forelock instead of trimming
    # the shape to a level shelf across the whole crown.
    crown = math.exp(-((x+.012)/.043)**2-((z-.022)/.049)**2)
    slope = .0019*(1-crown)*smooth(.0,.014,loft)
    return (x, y-.795*loft-.0032*math.expm1(-loft/.004)-slope, z)


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
    forehead = .037 + .072*((1+math.cos(a))*.5)**1.46
    arc = .020*math.exp(-((side-1.56)/.25)**2)
    temple = .013*math.exp(-((side-1.13)/.13)**2)
    part = .0042*math.exp(-((a-.59)/.24)**2)
    return forehead + arc - temple + part + f*(.0008*math.cos(9*a) + .0010*math.sin(18*a+.6))


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
            result.append(1 - occlusion*.074)
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


def strand_family(out, guide, width, depth, hex_color, steps, count, phase, taper=1, profile=FILL_PROFILE):
    # Keep the bridge, whorl and taper guides as the outer envelope. Each
    # strand has a separate section and tapered tip within that envelope.
    points = resample(guide, 48)
    albedo = ink(hex_color)
    for lane in range(count):
        offset = (2*lane + 1)/count - 1
        wave = phase + lane*2.17
        start = .027*(1 + math.sin(wave))
        end = (1 if lane == count//2 else .963 + .028*math.cos(wave*1.41))
        previous = None
        for j in range(steps + 1):
            t = j/steps
            u = mix(start, end, t)
            index = min(47, int(u*48))
            center = points[index].lerp(points[index+1], u*48-index)
            tangent = (points[min(48, index+2)]-points[max(0, index-1)]).normalized()
            normal = center - HEAD_CENTER
            normal -= tangent*normal.dot(tangent)
            normal.normalize()
            across = normal.cross(tangent).normalized()
            breadth = (.27+.73*math.sin(math.pi*(.15+.85*u))**.53)*(1-.29*u*taper)
            breadth *= max(.035, smooth(0,.24,1-u))
            drift = (.15/count)*math.sin(u*7+wave)*math.sin(math.pi*t)
            cross = offset + drift
            loft = math.sqrt(max(0, 1-cross*cross))
            variation = .96 + .065*math.sin(wave+.4)
            tip = max(.018, smooth(0,.17,1-t))
            spread = (1.36 - .27*smooth(.40,.95,t)) * variation
            half_width = width * breadth * spread * tip / count
            relief = min(half_width*.59, depth*breadth*.25)
            seat = smooth(.01,.13,t)
            center += across*(cross*width*breadth)
            center += normal*(depth*breadth*loft*seat - relief)
            envelope = (.60+.52*smooth(.02,.84,u))*(.91+.12*math.sin(wave+.9))
            if j in (0, steps):
                point = out.add(center, (u,.26), [c*envelope for c in albedo])
                if previous:
                    for left, right in zip(previous, previous[1:]):
                        out.faces.append((left, right, point))
                previous = [point]
                continue
            current = []
            for side, lift, across_uv in profile:
                p = center + across*(side*half_width) + normal*(lift*relief)
                shade = envelope * (.88+.17*max(0, lift))
                color = (albedo[0]*shade*(.94+.14*u), albedo[1]*shade, albedo[2]*shade*(1.05-.06*u))
                current.append(out.add(p, (u, across_uv), color))
            if len(previous) == 1:
                for left, right in zip(current, current[1:]):
                    out.faces.append((previous[0], right, left))
            else:
                out.strip(previous, current)
            previous = current


def roots(out, high):
    sectors, rows = (50, 10) if high else (40, 9)
    albedo = ink('#3b251a')
    previous = None
    for j in range(rows):
        u = j/rows
        current = []
        for i in range(sectors+1):
            a = i*math.tau/sectors - math.pi
            # Seat the edge a hair inside skin. Its radius then follows the
            # existing skull rather than wrapping around a second head.
            y = mix(border(a), .128, math.sin(u*math.pi*.5))
            support = smooth(.36, .79, u)
            margin = mix(-.00065, .0016, clip(u*12)) + (.0018 if high else .0032)*support
            p = skull_point(a, y, margin)
            if u > .88:
                crown = (1-u)/.12
                p.x *= crown
                p.z = mix(-.008, p.z, crown)
                p.y += .001*(1-crown)
            p.y += .0011*support
            grain = i / 7 - .55*u + .13*math.sin(a*3-u*4)
            across = 1 - abs(2*(grain % 1) - 1)
            groove = math.sin(19*a - 9*u + 1.23*math.sin(5*a+3*u))
            shade = (.77+.16*u+.12*groove)*(.95 + .05*math.cos(4*a))
            current.append(out.add(p, (u, across), [c*shade for c in albedo]))
        if previous:
            out.strip(previous, current)
        previous = current
    top = out.add(Vector((0, .1301, -.008)), (1,.5), [c*.74 for c in albedo])
    for i in range(sectors):
        out.faces.append((previous[i], previous[i+1], top))


def flat_clumps(curves, high):
    steady = Surface()
    roots(steady, high)
    # Shift the row from the forehead into the back. The deepest rows feed
    # the rear whorl. Offsets vary along the row, not by duplicating one lock.
    forehead = ((.032,.109,.031),(.028,.121,.036),(.011,.131,.041),
                (-.014,.137,.038),(-.036,.134,.024),(-.051,.119,.017),(-.054,.107,.011))
    back = ((.035,.087,-.038),(.026,.103,-.044),(.016,.116,-.038),
            (-.009,.126,-.036),(-.028,.120,-.042),(-.042,.107,-.042),(-.046,.092,-.035))
    strands = 13 if high else 10
    for i in range(strands):
        u = i/(strands-1)
        section = []
        for k, (a, b) in enumerate(zip(forehead, back)):
            v = k/(len(forehead)-1)
            p = Vector(a).lerp(Vector(b), u)
            p.x += .0034 * math.sin(u*10+.5) * math.sin(math.pi*v)
            p.y += .0038*math.sin(math.pi*u)*math.sin(math.pi*v) + .0018*math.sin(u*21+5*v)
            p.z += .0064 * math.sin(6*v+u*9)*math.sin(math.pi*v)
            # Combed mid-layer hugs the sides at both ends; small offsets
            # carry the layered comb from the part up and across the crest.
            section.append(p)
        guide = native_guide(f'Swept bridge {i+1:02}', section, curves)
        steps = 10 if high and i < 8 else 8
        strand_family(steady, guide, .0090+.0038*math.sin(math.pi*u), .0062+.0023*math.sin(math.pi*u),
                      CHOCOLATE[i%len(CHOCOLATE)], steps, 5 if high else 4, i*.6,
                      profile=FIBRE_PROFILE)

    # Low frontal bridge locks run parallel to the upper fan. Their roots
    # meet the part; their tips separate into the irregular hairline.
    bed = ((.037,.106,.027),(.025,.111,.039),(.010,.114,.044),
           (-.010,.117,.041),(-.027,.117,.036),(-.043,.112,.026),(-.050,.104,.018))
    for i in range(7 if high else 6):
        u = i/(6 if high else 5)
        section = []
        for j, xyz_value in enumerate(bed):
            v = j/(len(bed)-1)
            p = Vector(xyz_value)
            p.x += .0032 * math.sin(i*1.3+v*4) * math.sin(v*math.pi)
            p.y += (u*.018+.0032*math.sin(i*1.7+v*7))*math.sin(v*math.pi)
            p.z += (.0023*math.sin(i*1.21+v*8)-.013*u)*math.sin(v*math.pi)
            section.append(p)
        guide = native_guide(f'Low hairline bridge {i+1:02}', section, curves)
        strand_family(steady, guide, .0051+.002*math.sin(u*math.pi)+.00085*math.cos(i*2.1), .0044,
                      CHOCOLATE[(i+2)%len(CHOCOLATE)], 8 if high else 7, 4 if high else 3, .73*i, .62)

    # Temple panels fan backward a little above the ears, then tighten at
    # the nape. The left/right flow spirals into an offset rear crown whorl.
    branches = 14 if high else 12
    for side in (-1,1):
        for i in range(branches):
            u = i/(branches-1)
            tip_angle = side * mix(1.06, 3.17, u)
            tip_y = border(tip_angle)+.0035*math.sin(i*1.2+side)+.0014*math.sin(i*2.7)
            section = []
            for j in range(6):
                v = j/5
                angle = (tip_angle-side*(1-v)*(.41-.56*math.sin(math.pi*u*.91))
                         + .88*u**1.4*(1-v) + .20*math.sin(math.pi*v)*(u-.37))
                y = mix(.116-.016*u, tip_y, v) + .004*math.sin(math.pi*v)
                lift = .0007+(.0014+.0005*math.sin(i*2))*math.sin(math.pi*v) if j < 5 else -.00061
                section.append(skull_point(angle, y, lift))
            guide = native_guide(f'Taper {side:+} {i+1:02}', section, curves)
            strand_family(steady, guide, .0053-.0011*u+.0006*math.sin(i*1.5), .0026-.0010*u,
                          CHOCOLATE[(i+3*side)%len(CHOCOLATE)], 7 if high else 5, 4, .7*i)
    for i in range(12 if high else 7):
        u = i/(11 if high else 6)
        a = mix(-4.15,-.54,u)
        section = [skull_point(a-(1-t)*(.98+.32*math.cos(a)) + .22*math.sin(t*math.pi),
                               mix(.125 - .007*math.sin(u*9), .077+.012*math.cos(a), t),
                               .0019+.003*math.sin(t*math.pi)) for t in (0,.2,.4,.6,.8,1)]
        guide = native_guide(f'Occipital turn {i+1:02}', section, curves)
        strand_family(steady, guide, .0069, .0031, CHOCOLATE[(i+2)%len(CHOCOLATE)],
                      7 if high else 6, 4 if high else 3, i)

    # Guide children are narrow ribbons derived from nearby lanes of the
    # same flow. Leave breathing room at the exposed forehead and side part.
    children = 13 if high else 8
    for i in range(children):
        u = i/(children-1)
        section = []
        for k, (a, b) in enumerate(zip(forehead, back)):
            v = k/(len(forehead)-1)
            p = Vector(a).lerp(Vector(b), u)
            p.x += .0037*math.sin(10*u+.5)*math.sin(math.pi*v) -.0014*math.sin(i*2.16)
            p.y += (.0074+.0022*math.sin(23*u+i*.7))*math.sin(math.pi*v) + .003*math.sin(17*u+6*v)
            p.z += .0071*math.sin(6*v+9*u)*math.sin(math.pi*v) + .0017*math.sin(i*2.2)
            section.append(p)
        parent = native_guide(f'Parent comb lane {i+1:02}', section, curves)
        sampled = resample(parent, 32)
        # Offset starts and fade lengths give visible feathered ends at
        # different places along the surface rather than parallel piping.
        begin = 2+(i*3)%6
        end = 22+(i*7)%10
        child = []
        for j in range(begin,end+1,3):
            t = (j-begin)/(end-begin)
            p = sampled[j].copy()
            radial = (p - HEAD_CENTER).normalized()
            side = radial.cross(sampled[j+1]-sampled[j-1]).normalized()
            p += radial*(-.0041+.0018*math.sin(math.pi*t))
            p += side*(.0018*math.sin(t*5+i))
            child.append(p)
        guide = native_guide(f'Part sweep child {i+1:02}', child, curves)
        strand_family(steady, guide, .0019+.00065*math.sin(i*2.7), .0014,
                      CHOCOLATE[(i+4)%len(CHOCOLATE)], 8 if high else 7, 2, i*1.9, .89)

    # The little diagonal locks along the frontal part frame the brows and
    # meet the comb. Avoid a continuous raised ledge across the forehead.
    details = (
        ((.026,.116,.032),(.011,.122,.046),(-.011,.126,.048),(-.032,.126,.040),(-.049,.108,.024)),
        ((.024,.123,.026),(.005,.130,.042),(-.019,.132,.043),(-.037,.125,.034),(-.056,.110,.014)),
        ((-.017,.129,.040),(-.033,.124,.039),(-.038,.118,.037),(-.039,.111,.035),(-.036,.107,.035)),
        ((.022,.124,.020),(.036,.123,.028),(.048,.113,.028),(.052,.110,.022),(.053,.102,.019)),
        ((.010,.131,.043),(-.011,.138,.043),(-.027,.136,.039),(-.040,.129,.032),(-.043,.120,.029)),
    )
    for i, points in enumerate(details[:5 if high else 4]):
        guide = native_guide(f'Side part ribbon {i+1:02}', points, curves)
        strand_family(steady, guide, .005+.0011*math.sin(i*2.1), .0031+.001*math.sin(i),
                      CHOCOLATE[(i+3)%len(CHOCOLATE)], 8 if high else 7, 4 if high else 3, i*.61, .65,
                      profile=FIBRE_PROFILE)
        if high or i % 2 == 0:
            # Short, fine feathers leave the guide near a tapered edge. Both
            # ends tuck back into the underlying comb to avoid a loose arch.
            parent = resample(guide, 12)
            feather = []
            for j in range(5, 11):
                t = (j - 5) / 5
                p = parent[j].copy()
                outward = (p - HEAD_CENTER).normalized()
                side = outward.cross(parent[j+1]-parent[j-1]).normalized()
                p += outward*(.001+.0013*math.sin(math.pi*t))
                p += side*(.0024+.0012*math.sin(math.pi*t+i))
                feather.append(p)
            strand_family(steady, native_guide(f'Seated edge feather {i+1:02}', feather, curves),
                          .00035, .00031, CHOCOLATE[(i+1)%len(CHOCOLATE)], 6, 1, i)
    return steady


def strategic_clumps(curves, material, high):
    # Three small, independent islands. The mid-length and tip knots give
    # the runtime two bones per lock. The shell stays rigid with the head.
    islands = (
        ('Forelock crest', 'quiff', .0074, .0053, '#4d2e21',
         ((.024,.116,.032),(.010,.131,.042),(-.012,.139,.042),(-.031,.138,.027),
          (-.043,.128,.021),(-.051,.117,.018),(-.052,.111,.015))),
        ('Broken wave', 'quiff', .0060, .0043, '#48291e',
         ((.007,.128,.029),(-.014,.142,.031),(-.033,.143,.025),(-.045,.137,.012),
          (-.052,.129,.010),(-.056,.117,.008),(-.057,.110,.002))),
        ('Part-side temple', 'temple', .0046, .0033, '#48291e',
         ((.032,.113,.030),(.043,.116,.028),(.051,.111,.025),(.055,.102,.023),
          (.057,.096,.021),(.058,.090,.018),(.057,.085,.015))),
    )
    meshes = []
    for i, (label, feature, width, depth, color, points) in enumerate(islands):
        surface = Surface()
        guide = native_guide(label, points, curves)
        strand_family(surface, guide, width, depth, color, 12 if high else 10,
                      5 if high else 4, i*1.8, .78, profile=FIBRE_PROFILE)
        chain = resample(guide, 2)
        meshes.append(surface.bake(f'Sippy {label}', material, feature, chain))
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
    static = flat_clumps(guides, high).bake('Sippy scalp, comb and nape', mat, 'crown')
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
