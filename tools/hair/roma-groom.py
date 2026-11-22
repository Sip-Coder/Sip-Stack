"""Author Roma's layered ringlets as Blender Bézier guides and opaque meshes.

blender -b -t 2 --python tools/hair/roma-groom.py -- /path/to/hair-raw
Pass --blend to also keep the editable guide scene. The separate asset packer
adds the glTF skins and meshopt compression. Coordinate tables are head-local
in the site's model frame (+Y crown, +Z forward).
"""
import argparse
from dataclasses import dataclass
from math import atan2, cos, hypot, pi, sin, sqrt
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import interpolate_bezier

TAU = 2 * pi
SECTIONS = (
    (0.003, 0.002, 0.003, 0.018), (0.009, 0.022, 0.025, 0.017),
    (0.022, 0.039, 0.039, 0.014), (0.039, 0.053, 0.048, 0.010),
    (0.060, 0.062, 0.054, 0.007), (0.080, 0.068, 0.055, 0.004),
    (0.100, 0.066, 0.055, 0.003), (0.122, 0.061, 0.051, 0.000),
    (0.140, 0.046, 0.043, -0.002), (0.149, 0.019, 0.023, -0.005),
    (0.151, 0.002, 0.004, -0.006),
)


def smooth(t):
    t = max(0., min(1., t))
    return t * t * (3 - 2 * t)


def ramp(t, start, end):
    return smooth((t - start) / (end - start))


def lerp(a, b, t):
    return a + (b - a) * t


def linear(color):
    rgb = (int(color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple((c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in rgb)


def pigment(start, end, t, exposure=1.):
    return tuple(min(1., exposure * lerp(a, b, t)) for a, b in zip(start, end)) + (1.,)


def seat_crown(p):
    point = p.copy()
    # Compress only the airy pile above the scalp. Fixed lengths down by the
    # shoulders and the band endpoints keep the authored silhouette.
    point.y -= 0.0112 * ramp(point.y, 0.141, 0.1694)
    return point


def bone_frame(p):
    return Vector((p[0], -p[2], p[1]))


def site_frame(p):
    return Vector((p[0], p[2], -p[1]))


def scalp(y, azimuth):
    """Measure the seated Roma face using the original skin cross sections."""
    i = next((i for i in range(1, len(SECTIONS) - 1) if SECTIONS[i][0] >= y), len(SECTIONS) - 1)
    a, b = SECTIONS[i - 1:i + 1]
    before, after = SECTIONS[max(0, i - 2)], SECTIONS[min(len(SECTIONS) - 1, i + 1)]
    h = b[0] - a[0]
    t = max(0., min(1., (y - a[0]) / h))
    rx, rz, offset = [
        (2 * t ** 3 - 3 * t ** 2 + 1) * a[k]
        + (t ** 3 - 2 * t ** 2 + t) * h * (b[k] - before[k]) / (b[0] - before[0])
        + (-2 * t ** 3 + 3 * t ** 2) * b[k]
        + (t ** 3 - t ** 2) * h * (after[k] - a[k]) / (after[0] - a[0])
        for k in range(1, 4)
    ]
    return Vector((rx * sin(azimuth), y, offset + rz * cos(azimuth)))


def band_position(a, width, layer=0.):
    """A bias-cut band with folded edges that stretches from pinna to pinna."""
    ca, sa = cos(a), sin(a)
    cloth = 0.0011 * cos(width * pi * 0.5) + 0.00055 * sin(6. * a + 0.4) * (1 - width ** 2)
    radius_x = 0.078 + cloth + layer
    radius_y = 0.090 + cloth + layer
    taper = 0.68 + 0.32 * max(0., ca)
    return Vector((0.002 + radius_x * sa - 0.0015 * width * sa,
                   0.072 + radius_y * ca - width * 0.0075 * taper,
                   0.021 + 0.008 * ca - 0.0045 * sa + width * 0.011 * taper))


def under_band(p):
    if p.y < 0.053:
        return p
    a = atan2((p.x - 0.002) / 0.078, (p.y - 0.072) / 0.090)
    if abs(a) > 1.64:
        return p
    middle = band_position(a, 0.)
    half_width = 0.011 * (0.68 + 0.32 * max(0., cos(a)))
    across = (p.z - middle.z) / half_width
    influence = (1 - ramp(abs(across), 1.12, 1.79)) * (1 - ramp(abs(a), 1.58, 1.65))
    limit = (band_position(a, max(-1., min(1., across)), -0.0027)
             - Vector((0.002, 0.072, 0.))).xy.length
    radius = hypot(p.x - 0.002, p.y - 0.072)
    if radius > limit:
        trim = 1 - influence * (1 - limit / radius)
        p.x = 0.002 + (p.x - 0.002) * trim
        p.y = 0.072 + (p.y - 0.072) * trim
    return p


class Surface:
    def __init__(self, press=True):
        self.press = press
        self.vertices = []
        self.colors = []
        self.faces = []
        self.uvs = []

    def vertex(self, point, color):
        index = len(self.vertices)
        self.vertices.append(bone_frame(seat_crown(point) if self.press else point))
        self.colors.append(color)
        return index

    def face(self, indices, uv):
        self.faces.append(indices)
        self.uvs.append(uv)

    def create(self, name, material, part):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        uv = mesh.uv_layers.new(name='Flow')
        colors = mesh.color_attributes.new(name='Pigment', type='FLOAT_COLOR', domain='POINT')
        for i, color in enumerate(self.colors):
            colors.data[i].color = color
        for poly, corners in zip(mesh.polygons, self.uvs):
            poly.use_smooth = True
            for loop, coords in zip(poly.loop_indices, corners):
                uv.data[loop].uv = coords
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj['hairPart'] = part
        mesh.materials.append(material)
        return obj


def material(name, roughness, anisotropy):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Anisotropic'].default_value = anisotropy
    attribute = nodes.new('ShaderNodeVertexColor')
    attribute.layer_name = 'Pigment'
    result.node_tree.links.new(attribute.outputs['Color'], bsdf.inputs['Base Color'])
    return result


@dataclass(frozen=True)
class Guide:
    name: str
    points: tuple
    outward: tuple
    width: float
    depth: float
    turn: float
    tint: float
    region: str = ''


def author_bezier(guide):
    """Use Blender's editable auto handles to lay out the clump centerline."""
    curve = bpy.data.curves.new(guide.name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 16
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(guide.points) - 1)
    for bp, pos in zip(spline.bezier_points, guide.points):
        bp.co = bone_frame(pos)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new('Guide · ' + guide.name, curve)
    bpy.data.collections['Guides'].objects.link(obj)
    obj.hide_render = True
    bpy.context.view_layer.update()
    return spline, obj


def sample_guide(spline, stations):
    """Arc-length stations share silhouette and bone points between LODs."""
    points = spline.bezier_points
    segments = [interpolate_bezier(a.co, a.handle_right, b.handle_left, b.co, 20) for a, b in zip(points[:-1], points[1:])]
    sampled = [site_frame(p) for segment in segments for p in segment[:-1]] + [site_frame(points[-1].co)]
    distances = [0.]
    for a, b in zip(sampled[:-1], sampled[1:]):
        distances.append(distances[-1] + (b - a).length)
    out, k = [], 0
    for t in stations:
        distance = distances[-1] * t
        while k + 1 < len(distances) - 1 and distances[k + 1] < distance:
            k += 1
        factor = (distance - distances[k]) / (distances[k + 1] - distances[k])
        out.append(sampled[k].lerp(sampled[k + 1], factor))
    return out


def frames(samples, outward):
    tangents = [(samples[min(j + 1, len(samples) - 1)] - samples[max(j - 1, 0)]).normalized()
                for j in range(len(samples))]
    middle = len(samples) // 2
    axes = [None] * len(samples)
    aim = Vector(outward)
    axes[middle] = (aim - tangents[middle] * aim.dot(tangents[middle])).normalized()
    for step in (-1, 1):
        for j in range(middle + step, -1 if step < 0 else len(samples), step):
            prior = j - step
            tangent = tangents[j]
            # Transport the cross section over the tight collar/forehead bends.
            # Reprojecting a fixed normal each ring flips when the path points toward it.
            radial = tangents[prior].rotation_difference(tangent) @ axes[prior]
            preferred = aim - tangent * aim.dot(tangent)
            if preferred.length > 0.22 and radial.dot(preferred) > 0:
                radial = radial.lerp(preferred.normalized(), 0.18).normalized()
            axes[j] = radial
    return [(radial, tangent.cross(radial).normalized()) for tangent, radial in zip(tangents, axes)]


def sweep(surface, guide, samples, stations, sides):
    """Sweep a rounded ringlet with a concealed root and tucked oval end."""
    start = len(surface.vertices)
    rows = len(samples) - 1
    roots, tips = linear('2b1a15'), linear('593321')
    front = sides // 2
    cover = guide.name.startswith('Whorl cover')
    tuck = .006 if guide.name.startswith('Whorl') else .002
    def cross_uv(index):
        # The outward half gets almost all the texture span. Keeping the two
        # underside values close avoids high-frequency detail in shadow.
        if index <= front:
            return .06 + .88 * index / front
        return .94 + .06 * (index - front) / (sides - front)

    for j, (point, (radial, cross)) in enumerate(zip(samples, frames(samples, guide.outward))):
        t = stations[j]
        twist = guide.turn * sin(pi * (1.16 * t + .08))
        root = .36 + .64 * ramp(t, .02, .19 if cover else .35)
        cap = max(0., (t - .89) / .11)
        tip = sqrt(max(.0121, 1. - cap * cap))
        roll = 1. + .08 * sin(TAU * (t + .12))
        width = guide.width * root * tip * roll
        if not guide.region:
            point = point - radial * (tuck * ramp(t, .83, 1.))
        for i in range(sides):
            theta = -pi / 2 + TAU * i / sides
            across = width * sin(theta)
            depth = width * guide.depth * cos(theta)
            p = point + cross * (across * cos(twist) - depth * sin(twist))
            p += radial * (across * sin(twist) + depth * cos(twist))
            light = guide.tint * (.86 + .15 * cos(theta) + .065 * sin(3 * t + guide.turn))
            surface.vertex(under_band(p), pigment(roots, tips, .22 + .59 * ramp(t, .15, .87), light))
            if j:
                prev, now = start + (j - 1) * sides, start + j * sides
                nxt = (i + 1) % sides
                v0, v1 = cross_uv(i), cross_uv(i + 1)
                before = stations[j - 1]
                surface.face((prev + i, prev + nxt, now + nxt, now + i),
                             ((before, v0), (before, v1), (t, v1), (t, v0)))
    end = start + rows * sides
    def cap_uv(at, i):
        # The terminal cap still binds to its end joint.
        return at + .0015 * cos(TAU * i / sides), .5 + .46 * sin(TAU * i / sides)
    for i in range(1, sides - 1):
        surface.face((start, start + i + 1, start + i), tuple(cap_uv(.002, k) for k in (0, i + 1, i)))
        surface.face((end, end + i, end + i + 1), tuple(cap_uv(.998, k) for k in (0, i, i + 1)))


def scalp_underlay(high):
    # The underlay tracks actual skin height while the loose pile is seated down.
    surface = Surface(press=False)
    around, rows = (40, 11) if high else (30, 9)
    dark, light = linear('321d14'), linear('563126')
    for row in range(rows + 1):
        r = row / rows
        for col in range(around):
            angle = (col / around - 0.5) * TAU
            front, back = max(0., cos(angle)), max(0., -cos(angle))
            rim = 0.083 + 0.043 * front ** 1.30 - 0.044 * back ** 0.72
            rim += 0.0011 * sin(11. * angle + 0.65) + 0.0007 * sin(17. * angle - 0.6)
            y = lerp(rim, 0.1506, sin(r * pi / 2))
            p = scalp(y, angle)
            fit = 0.0009 + 0.0014 * sin(r * pi)
            p += Vector((fit * sin(angle), 0.0005 + 0.0013 * r, fit * cos(angle)))
            grain = .48 + (1. - ramp(r, .72, 1.)) * (.20 * cos(15 * angle - 3.8 * r)
                                                    + .08 * cos(21 * angle + 1.4 * r))
            surface.vertex(under_band(p), pigment(dark, light, grain * (0.5 + 0.5 * r)))
            if row:
                prev, now = (row - 1) * around, row * around
                nxt = (col + 1) % around
                u, v = col / around, (col + 1) / around
                surface.face((prev + col, prev + nxt, now + nxt, now + col), ((r - 1 / rows, u), (r - 1 / rows, v), (r, v), (r, u)))
    top = surface.vertex(Vector((0., .1527, -.006)), pigment(dark, light, .48))
    for a in range(around):
        surface.face((rows * around + a, rows * around + (a + 1) % around, top), ((0.98, a / around), (0.98, (a + 1) / around), (1., (a + 0.5) / around)))
    return surface


def headband(high, cloth):
    surface = Surface()
    along, across = (52, 9) if high else (42, 7)
    edge, wine = linear('a3333d'), linear('741824')
    embroidered = linear('e6bd84')
    cream = linear('be815d')
    for side in (1., -1.):
        start = len(surface.vertices)
        for i in range(along + 1):
            u = i / along
            a = lerp(-1.64, 1.62, u)
            for j in range(across + 1):
                v = j / across
                width = 2 * v - 1
                p = band_position(a, width, 0 if side > 0 else -0.0014)
                # Rows of offset diamond stitches suggest the narrow printed cloth.
                tiles = ((u * 13.0 + 0.54 * (width > 0)) % 1) - 0.5
                motif = abs(tiles) + 0.67 * abs(abs(width) - 0.40)
                border = 1 - ramp(abs(width), 0.69, 0.90)
                lozenge = (1 - ramp(abs(motif - 0.20), 0.019, 0.072)) * border * (1 - ramp(abs(width), 0.58, 0.83))
                stitch = (1 - ramp(abs(abs(width) - 0.81), 0.025, 0.075)) * (0.26 + 0.32 * sin(49 * a) ** 2)
                base = pigment(edge, wine, border, 0.98 + 0.055 * cos(33 * a + 13 * width))
                thread = pigment(base[:3], embroidered, lozenge * 0.95)
                color = pigment(thread[:3], cream, stitch)
                surface.vertex(p, color if side > 0 else wine + (1.,))
                if i and j:
                    lin = start + i * (across + 1) + j
                    ids = (lin - across - 2, lin - 1, lin, lin - across - 1)
                    uv = ((u - 1 / along, v - 1 / across), (u, v - 1 / across), (u, v), (u - 1 / along, v))
                    surface.face(ids[::-1] if side > 0 else ids, uv[::-1] if side > 0 else uv)
    back = (along + 1) * (across + 1)
    outline = (list(range(across + 1)) + [i * (across + 1) + across for i in range(1, along + 1)]
               + [along * (across + 1) + j for j in range(across - 1, -1, -1)]
               + [i * (across + 1) for i in range(along - 1, 0, -1)])
    for a, b in zip(outline, outline[1:] + outline[:1]):
        surface.face((a, b, b + back, a + back), ((0., 0.), (1., 0.), (1., 1.), (0., 1.)))
    obj = surface.create('Roma red embroidered headband', cloth, 'headband')
    path = [seat_crown(band_position(lerp(-1.62, 1.62, i / 16), 0.)) for i in range(17)]
    obj['hairBand'] = [round(float(v), 6) for p in path for v in p]
    obj['hairBandRadius'] = 0.009


# Four laid-in temple shapes leave Roma's eyes and gold hoops clear.
FORELOCKS = (
    ('Swept forehead left', ((.014, .146, .030), (.004, .146, .037), (-.024, .139, .045),
                             (-.046, .125, .047), (-.064, .110, .046), (-.074, .089, .043),
                             (-.077, .073, .047), (-.071, .065, .056), (-.068, .067, .060)), .012),
    ('Outer frame left', ((.016, .145, .030), (-.011, .142, .036), (-.041, .132, .044),
                          (-.065, .116, .045), (-.080, .100, .047), (-.087, .083, .043),
                          (-.084, .068, .043), (-.075, .060, .052), (-.071, .062, .054)), .0094),
    ('Swept forehead right', ((.018, .145, .030), (.034, .142, .035), (.051, .133, .044),
                              (.065, .118, .050), (.075, .102, .051), (.082, .085, .045),
                              (.080, .069, .050), (.074, .060, .061), (.071, .063, .062)), .0109),
    ('Outer frame right', ((.020, .145, .032), (.038, .142, .033), (.058, .129, .045),
                           (.074, .111, .050), (.086, .090, .048), (.086, .075, .037),
                           (.081, .064, .043), (.075, .060, .052)), .0089),
)


def forelocks():
    for i, (name, path, width) in enumerate(FORELOCKS):
        side = -1 if i < 2 else 1
        region = 'front' if i % 2 == 0 else ''
        yield Guide(name, path, (side * .25, .43, 1.), width, .51, side * .19, 1.05 + .06 * (i % 2), region)
    for side in (-1, 1):
        # A seated, aligned transition at the origin of the part.
        for i in range(2):
            angle = .07 + i * .30
            points = tuple(tuple(scalp(y, side * (a + angle)) + Vector((0., .001, .0035)))
                           for y, a in ((.140, .00), (.136, .15), (.131, .33), (.124 - i * .003, .55)))
            yield Guide(f'Part root feather {side:+d}-{i + 1}', points, (side * .25, .31, 1.),
                        .0041 - i * .0006, .48, side * .15, 1.11)


@dataclass(frozen=True)
class Ringlet:
    index: int
    angle: float
    end: float
    radius: float
    turns: float
    width: float
    phase: float
    inset: float = 0.
    region: str = ''


# The outer curls are arranged before the shorter inner ones so the shoulder
# silhouette is held by overlapping volumes at staggered lengths.
RINGLETS = (
    Ringlet(1, .94, -.001, .0158, 1.13, .0104, .70, region='temple'),
    Ringlet(3, 1.10, -.014, .0180, 1.32, .0105, .62),
    Ringlet(5, 1.36, -.020, .0172, 1.29, .0118, .34),
    Ringlet(7, 1.66, -.027, .0190, 1.34, .0122, .27),
    Ringlet(9, 1.92, -.033, .0205, 1.36, .0120, .16),
    Ringlet(11, 2.15, -.034, .0208, 1.38, .0124, -.08, region='cascade'),
    Ringlet(13, 2.42, -.036, .0182, 1.32, .0124, -.20),
    Ringlet(16, 2.68, -.040, .0199, 1.43, .0121, -.34),
    Ringlet(18, 2.91, -.037, .0170, 1.37, .0121, -.39),
    Ringlet(20, 3.12, -.044, .0159, 1.42, .0124, -.30),
    Ringlet(15, 2.55, .010, .0144, 1.22, .0103, -.29, .020, 'nape'),
    Ringlet(6, 1.56, -.017, .0132, 1.20, .0103, .34, .017),
    Ringlet(2, 1.04, .019, .0111, 1.48, .0085, .02, .016),
    Ringlet(12, 2.30, -.001, .0124, 1.49, .0086, -.64, .017),
)


def waves():
    for side in (-1, 1):
        for ring in RINGLETS:
            if ring.index == 20 and side > 0:
                continue
            angle = ring.angle + side * .023 * sin(ring.index * .8)
            y0 = .146 - .005 * ramp(angle, 2.15, 3.12)
            end = ring.end + side * .003 * sin(ring.index * 1.73)
            start = scalp(y0, side * angle)
            start += Vector((side * .002 * sin(angle), .001, .001 + .003 * cos(angle)))
            path = []
            for j in range(23):
                t = j / 22
                tuck = ramp(t, .78, 1.)
                opening = ramp(t, .03, .37)
                a = angle + .17 * sin(pi * t) - .085 * tuck
                radial = Vector((side * sin(a), 0., cos(a)))
                around = Vector((side * cos(a), 0., -sin(a)))
                wide = .089 + .005 * sin(a) - ring.inset - .008 * tuck
                deep = .073 - ring.inset - .010 * tuck
                carrier = Vector((side * wide * sin(a), 0., -.008 + deep * cos(a)))
                # The descending axis aims toward the cuff. Elliptical turns
                # trace the curl in depth as well as across the head.
                amp = ring.radius * ramp(t, .12, .43) * (1. - .69 * tuck)
                spin = TAU * (ring.turns * t ** 1.28 + .063 * t * t) + ring.phase
                spiral = amp * (around * sin(spin) + radial * (.74 * cos(spin)))
                p = start.lerp(carrier, opening) + spiral
                p.z += (1. - ramp(angle, .92, 1.49)) * .026 * ramp(t, .10, .80)
                p.y = lerp(y0, end, t) + .014 * sin(pi * ramp(t, 0., .42))
                p.y += .009 * sin(spin + .54) * ramp(t, .32, .62) * (1. - ramp(t, .77, 1.))
                # Return the final arc under the body of the curl.
                p += radial * (-.006 * tuck)
                p.y += .005 * ramp(t, .90, 1.)
                if ring.region in ('cascade', 'nape'):
                    clearance = .009 if ring.region == 'cascade' else .014
                    p += radial * (clearance * ramp(t, .56, 1.))
                    reach = ramp(t, .61, 1.)
                    p.x += side * .013 * reach
                    p.z -= (.031 if ring.region == 'cascade' else .024) * reach
                if ring.region not in ('cascade', 'nape'):
                    # Sew the upper arc against the head before the ringlet
                    # opens into its shoulder envelope.
                    near = scalp(min(.149, p.y), side * a) + radial * .006
                    seat = .74 * ramp(t, .06, .25) * (1. - ramp(t, .31, .62))
                    p.x = lerp(p.x, near.x, seat)
                    p.z = lerp(p.z, near.z, seat)
                    if ring.angle > 1.8 and not ring.inset:
                        lane = .006 if ring.index in (9, 16, 20) else -.003
                        p += radial * (lane * ramp(t, .27, .45) * (1. - ramp(t, .70, .95)))
                path.append(tuple(p))
            outward = (side * sin(angle), .11, cos(angle))
            name = ('Right' if side < 0 else 'Left') + f' wave {ring.index:02d}'
            depth = .64 if ring.region in ('cascade', 'nape') else .56
            yield Guide(name, tuple(path), outward, ring.width, depth, side * .22,
                        .95 + .16 * ramp(angle, 3.05, .95) - 6. * ring.inset, ring.region)


def crown_whorl():
    # Comb the part onto the scalp with connected curves whose ends run
    # into the spiral bodies. All starts sit under the cloth edge.
    crown = (
        ((-.027, .146, .024), (-.028, .154, .008), (-.030, .153, -.012),
         (-.033, .146, -.031), (-.034, .132, -.047), (-.035, .118, -.054)),
        ((-.010, .149, .022), (-.013, .160, .004), (-.016, .162, -.015),
         (-.015, .151, -.032), (-.017, .136, -.049), (-.018, .122, -.056)),
        ((.008, .150, .022), (.007, .162, .003), (.004, .162, -.014),
         (.001, .153, -.032), (.003, .135, -.048), (.005, .120, -.058)),
        ((.023, .147, .021), (.024, .155, .003), (.023, .157, -.016),
         (.026, .149, -.031), (.029, .133, -.045), (.027, .119, -.053)),
    )
    for i, path in enumerate(crown):
        yield Guide(f'Whorl cover {i + 1}', path, ((i - 1.5) * .21, .88, -.23),
                    .0132, .34, (i - 1.5) * .12, 1.04)
    # Low sweeps run from the part beneath the first shoulders of the long curls.
    for side in (-1, 1):
        for i, angle in enumerate((1.13, 1.60, 2.08, 2.56, 2.91)):
            points = []
            for r in (0., .18, .37, .62, .82, 1.):
                y = .149 - (.039 + .002 * i) * r
                a = side * (angle + .24 * sin(r * pi * .68)) + .15 * (1 - r)
                p = scalp(y, a)
                lift = .002 + .005 * sin(pi * r)
                p += Vector((lift * sin(a), .0025 * sin(pi * r), lift * cos(a)))
                points.append(tuple(p))
            yield Guide(f'Whorl {side:+d}-{i + 1}', tuple(points), (side * sin(angle), .6, cos(angle)),
                        .0115, .45, side * .12, 1.03 + .04 * sin(i + side))
        for i in range(2):
            # The neck remains behind a shorter bedding layer while the parted
            # foreground wave tips can separate a little in space.
            phase = 0.61 * side + 1.09 * i
            path = tuple((side * (.014 + .031 * i + .010 * sin(3.5 * t + phase)),
                          .084 - (.076 + i * .008) * t,
                          -.064 - .012 * ramp(t, .12, .81) + .005 * cos(7.0 * t + phase))
                         for t in (0., .24, .49, .71, 1.))
            yield Guide(f'Nape underneath {side:+d}-{i + 1}', path, (side * .18, .15, -1.), .015,
                        .32, side * .23, .87)
    layers = (
        ((-.012, .085, -.069), (-.011, .067, -.079), (.003, .047, -.081),
         (.011, .024, -.075), (.002, .004, -.072), (-.013, -.009, -.069)),
        ((.006, .071, -.065), (.014, .054, -.071), (.007, .035, -.072),
         (-.006, .020, -.075), (-.002, .002, -.078), (.014, -.013, -.072)),
    )
    for i, path in enumerate(layers):
        yield Guide(f'Nape underneath center {i + 1}', path, (.03, .10, -1.), .015 + .002 * i,
                    .31, .18 - .32 * i, .85 + .08 * i)
    # A shorter inner bed holds the collar silhouette between the longer curls.
    for side in (-1, 1):
        path = tuple((side * x, y, z) for x, y, z in (
            (.023, .091, -.064), (.030, .067, -.066), (.039, .040, -.070),
            (.029, .017, -.069), (.035, -.007, -.066),
        ))
        yield Guide(f'Nape underneath thread bed {side:+d}', path, (side * .17, .13, -1.),
                    .0105, .30, side * .21, .76)



def bake_contacts(meshes):
    """Bake short-range inter-clump occlusion into the original vertex pigments."""
    points, faces = [], []
    for obj in meshes:
        mesh = obj.data
        start = len(points)
        points.extend(v.co.copy() for v in mesh.vertices)
        faces.extend(tuple(start + i for i in p.vertices) for p in mesh.polygons)
    bvh = BVHTree.FromPolygons(points, faces)
    for obj in meshes:
        mesh = obj.data
        colors = mesh.color_attributes['Pigment'].data
        strength = 0.37 if obj['hairPart'] != 'headband' else 0.13
        for v in mesh.vertices:
            normal = v.normal
            tangent = normal.orthogonal().normalized() * .65
            across = normal.cross(tangent)
            origin = v.co + normal * .0006
            occlusion = 0.
            for skew in (tangent, -tangent, across, -across):
                direction = (normal + skew).normalized()
                _, _, _, hit = bvh.ray_cast(origin, direction, .020)
                if hit is not None:
                    occlusion += 1 - hit / .020
            light = 1 - strength * occlusion / 4
            r, g, b, a = colors[v.index].color
            colors[v.index].color = (r * light, g * light, b * light, a)


def export(destination, high, keep_blend):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    guide_collection = bpy.data.collections.new('Guides')
    bpy.context.scene.collection.children.link(guide_collection)
    chocolate = material('Chocolate ringlets', .37, .60)
    cloth = material('Embroidered red cotton', .82, 0.)
    base = scalp_underlay(high).create('Roma scalp underlay', chocolate, 'crown')
    base['hairLayer'] = 'underlay'
    headband(high, cloth)
    static_crown = Surface()
    static_waves = Surface()
    for guide in (*forelocks(), *crown_whorl(), *waves()):
        spline, author = author_bezier(guide)
        compact = guide.name.startswith(('Whorl', 'Nape underneath', 'Part root'))
        crest = guide.name.startswith(('Swept forehead', 'Outer frame', 'Part root', 'Whorl'))
        surface = Surface() if guide.region else static_crown if crest else static_waves
        if compact:
            rows, sides = (13, 6) if high else (10, 6)
        elif crest:
            rows, sides = (24, 8) if high else (17, 6)
        else:
            rows, sides = (25, 8) if high else (18, 6)
        stations = [i / rows for i in range(rows + 1)]
        if not compact:
            # A few closely spaced stations round the last turn while the
            # body and the chain retain the original arc weighting.
            stations = sorted(set(stations + [.978, .992]))
        sweep(surface, guide, sample_guide(spline, stations), stations, sides)
        if guide.region:
            obj = surface.create('Roma ' + guide.name, chocolate, 'crown' if crest else 'waves')
            controls = [seat_crown(under_band(p.copy())) for p in sample_guide(spline, (i / 30 for i in range(31)))]
            obj['hairChain'] = [round(float(v), 6) for i in (0, 10, 20, 30) for v in controls[i]]
            obj['hairRegion'] = guide.region
            obj['hairRadius'] = 0.34 * guide.width
        author.hide_set(True)
    static_crown.create('Roma fixed part and forehead curls', chocolate, 'crown')
    static_waves.create('Roma fixed spiral cascade and nape', chocolate, 'waves')
    bake_contacts([obj for obj in bpy.context.scene.objects if obj.type == 'MESH'])
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            obj.select_set(True)
    label = 'high' if high else 'mobile'
    if keep_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(destination / f'roma-{label}.blend'))
    bpy.ops.export_scene.gltf(filepath=str(destination / f'roma-{label}.glb'),
                              export_format='GLB', use_selection=True, export_extras=True,
                              export_tangents=True, export_yup=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--blend', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    args.destination.mkdir(parents=True, exist_ok=True)
    for high in (False, True):
        export(args.destination.resolve(), high, args.blend)


if __name__ == '__main__':
    main()
