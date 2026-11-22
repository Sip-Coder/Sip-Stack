"""Author Roma's layered waves as Blender Bézier guides and opaque clump meshes.

blender -b -t 2 --python tools/hair/roma-groom.py -- /path/to/hair-raw
Pass --blend to also keep the editable guide scene. The separate asset packer
adds the glTF skins and meshopt compression. Coordinate tables are head-local
in the site's model frame (+Y crown, +Z forward).
"""
import argparse
from dataclasses import dataclass
from math import atan2, cos, hypot, pi, sin
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
    detail: bool = False


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


def sample_guide(spline, rows):
    """Arc-length stations share silhouette and bone points between LODs."""
    points = spline.bezier_points
    segments = [interpolate_bezier(a.co, a.handle_right, b.handle_left, b.co, 20) for a, b in zip(points[:-1], points[1:])]
    sampled = [site_frame(p) for segment in segments for p in segment[:-1]] + [site_frame(points[-1].co)]
    distances = [0.]
    for a, b in zip(sampled[:-1], sampled[1:]):
        distances.append(distances[-1] + (b - a).length)
    out, k = [], 0
    for j in range(rows + 1):
        distance = distances[-1] * j / rows
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


def sweep(surface, guide, samples, sides):
    """Sweep a flattened, fluted profile with a closed, pointed tip."""
    start = len(surface.vertices)
    rows = len(samples) - 1
    roots, tips = linear('291914'), linear('643a2a')
    for j, (point, (radial, cross)) in enumerate(zip(samples, frames(samples, guide.outward))):
        t = j / rows
        twist = guide.turn * sin(pi * (1.14 * t + 0.12))
        root = 0.28 + 0.72 * ramp(t, 0.025, 0.27)
        tip = 1 - 0.88 * ramp(t, 0.62, 1.0)
        width = guide.width * root * tip * (1. - 0.10 * t)
        for i in range(sides):
            theta = TAU * i / sides
            flute = cos(3 * theta + 1.30 * t) + 0.29 * cos(6 * theta + 2.2 * t)
            swell = 1 + 0.13 * flute
            across = width * sin(theta) * swell
            depth = width * guide.depth * cos(theta) * swell
            p = point + cross * (across * cos(twist) - depth * sin(twist))
            p += radial * (across * sin(twist) + depth * cos(twist))
            tone = (0.81 + 0.24 * cos(theta) + 0.16 * flute + 0.12 * sin(4.5 * t + guide.turn)) * guide.tint
            surface.vertex(under_band(p), pigment(roots, tips, 0.18 + 0.61 * ramp(t, 0.07, 0.96), tone))
            if j:
                prev, now = start + (j - 1) * sides, start + j * sides
                ii = (i + 1) % sides
                u = i / sides
                v = (i + 1) / sides
                surface.face((prev + i, prev + ii, now + ii, now + i), ((t - 1 / rows, u), (t - 1 / rows, v), (t, v), (t, u)))
    end = start + rows * sides
    def cap_uv(center, j):
        # Tangents need an area in UV space, but the cap still binds to its endpoint joint.
        return center + 0.0015 * cos(TAU * j / sides), 0.5 + 0.48 * sin(TAU * j / sides)
    for i in range(1, sides - 1):
        surface.face((start, start + i + 1, start + i), tuple(cap_uv(0.002, j) for j in (0, i + 1, i)))
        surface.face((end, end + i, end + i + 1), tuple(cap_uv(0.998, j) for j in (0, i, i + 1)))


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
            grain = 0.53 + 0.24 * cos(15 * angle - 3.8 * r) + 0.08 * cos(21 * angle + 1.4 * r)
            surface.vertex(under_band(p), pigment(dark, light, grain * (0.5 + 0.5 * r)))
            if row:
                prev, now = (row - 1) * around, row * around
                nxt = (col + 1) % around
                u, v = col / around, (col + 1) / around
                surface.face((prev + col, prev + nxt, now + nxt, now + col), ((r - 1 / rows, u), (r - 1 / rows, v), (r, v), (r, u)))
    top = surface.vertex(Vector((0., 0.1527, -0.006)), light + (1.,))
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


# Two lengths on each side of the part keep forehead and hoop silhouettes distinct.
FORELOCKS = (
    ('Swept forehead left', ((0.016, .148, .029), (.006, .156, .037), (-.016, .156, .043), (-.038, .142, .047),
                             (-.058, .122, .044), (-.073, .103, .043), (-.077, .082, .032), (-.071, .068, .034)), 0.0165),
    ('Outer frame left', ((0.014, .145, .036), (-.004, .151, .043), (-.036, .139, .058), (-.060, .117, .059),
                           (-.073, .098, .054), (-.080, .080, .039), (-.084, .066, .037), (-.081, .056, .042)), 0.0135),
    ('Swept forehead right', ((.015, .148, .029), (.029, .155, .037), (.050, .145, .045), (.062, .127, .044),
                              (.074, .108, .048), (.080, .088, .047), (.079, .072, .045), (.074, .054, .046)), 0.0140),
    ('Outer frame right', ((.020, .141, .038), (.035, .144, .047), (.055, .133, .055), (.068, .112, .055),
                            (.077, .093, .052), (.083, .077, .044), (.087, .061, .042), (.084, .050, .044)), 0.0115),
)


def forelocks():
    for i, (name, path, width) in enumerate(FORELOCKS):
        side = -1 if i < 2 else 1
        region = 'front' if i % 2 == 0 else ''
        yield Guide(name, path, (side * 0.25, 0.46, 1.), width, 0.32, side * 0.14, 1 + 0.09 * (i % 2), region)
        # Parallel, shorter accents comb along the broad curves, leaving natural gaps at the tips.
        for f in range(1):
            lean = [-1, 1][f]
            line = []
            for j, (x, y, z) in enumerate(path[:-1]):
                arc = sin(pi * j / (len(path) - 2))
                line.append((x + lean * 0.006 * arc, y + (f + 1) * 0.0036 * arc, z + .0023 + 0.004 * arc))
            yield Guide(name + f' · fine sweep {f + 1}', tuple(line), (side * 0.25, 0.46, 1.), width * (0.25 + 0.05 * f), 0.29,
                        side * 0.19, 1.13)

    # Short combed fibers feather the seated line where the forehead meets the part.
    for side in (-1, 1):
        for i in range(3):
            angle = 0.018 + i * 0.21
            points = tuple(tuple(scalp(y, side * (a + angle)) + Vector((0., 0.0007, 0.0028)))
                           for y, a in ((.138, .00), (.137, .13), (.131, .28), (.121 - i * .002, .49)))
            yield Guide(f'Part root feather {side:+d}-{i + 1}', points, (side * .25, .30, 1.),
                        .0031 - i * .00042, .25, side * .12, 1.12 + i * .07, detail=i > 0)


# Azimuths run from the temples to the whorl at the back. Each row is an
# independent wave, with long drapes interleaved with shorter returning layers.
# angle, length, face/rear clearance bias, width, phase, optional live chain
BANK = (
    (0.92, .149, .000, .014, 0.75, 'temple'),
    (1.03, .157, .006, .016, -1.0, ''),
    (1.17, .157, .009, .019, 1.8, ''),
    (1.23, .148, -.004, .018, -2.2, ''),
    (1.39, .148, -.002, .016, .43, ''),
    (1.46, .156, -.004, .017, -1.5, ''),
    (1.60, .142, -.024, .016, 1.1, ''),
    (1.68, .148, -.026, .019, -1.1, ''),
    (1.87, .159, -.027, .016, .62, ''),
    (1.99, .163, -.028, .019, 2.4, ''),
    (2.14, .180, -.029, .017, .72, 'cascade'),
    (2.25, .178, -.024, .019, -.57, ''),
    (2.36, .174, -.020, .019, -1.79, ''),
    (2.48, .186, -.014, .021, 1.1, ''),
    (2.54, .133, -.010, .016, 2.2, 'nape'),
    (2.66, .170, -.014, .020, -1.0, ''),
    (2.78, .149, -.010, .018, -.74, ''),
    (2.89, .179, -.008, .019, 2.2, ''),
    (3.02, .144, -.005, .016, .0, ''),
    (3.11, .177, -.009, .018, -1.6, ''),
)


def waves():
    for side in (-1, 1):
        for i, (angle, length, bias, width, phase, region) in enumerate(BANK):
            if i not in (0, 2, 4, 6, 8, 10, 12, 14, 15, 17, 19):
                continue
            # Neighbouring ribbons broadly share the wave, with staggered phase and depth.
            phase = 0.28 * phase + 0.91 * sin(1.7 * angle + 0.29) + side * 0.32
            angle += 0.026 * side * sin(i + .3)
            length += side * (0.0038 * sin(1.96 * i) + 0.002 * cos(1.22 * i + .4))
            left_sweep = (0.08 * side - .055) * sin(angle * 1.12)
            start_y = 0.1438 + 0.0028 * sin(i * 2.1 + side) - 0.0055 * ramp(angle, 2.18, 3.12)
            path = []
            for j in range(11):
                t = j / 10
                centerline = angle + left_sweep * (1 - t) + 0.085 * sin(pi * t) * sin(phase)
                middle = sin(pi * (0.80 * t + 0.05)) ** .8
                s = 2 * pi * (1.53 * t + 0.09 * t * t) + phase
                sway = 0.018 * sin(s) * middle + .0029 * cos(2 * s + 0.7) * middle
                wave = (0.0056 * cos(s + 0.35) - .0017 * sin(2 * s)) * middle
                origin = scalp(start_y, side * centerline)
                spread = ramp(t, 0., .44)
                x = lerp(abs(origin.x) * .92, (0.093 + .006 * sin(i * 2 + side)) * sin(centerline), spread)
                z = lerp(origin.z + .004, -.006 + (.076 + .005 * sin(i * 2 + side)) * cos(centerline), spread)
                x += (wave + .0042 * sin(s * 0.65)) * sin(centerline) + sway * cos(centerline)
                z += wave * cos(centerline) - sway * sin(centerline)
                z += bias * ramp(t, 0.32, 0.92)
                x += .007 * sin(centerline) * ramp(t, .18, .77) * (1 - 0.7 * ramp(t, .73, 1.))
                y = start_y + .042 * ramp(t, 0., .19) * (1 - ramp(t, .23, .44)) - length * t
                # Pin the ends low and allow tangential turn-under only.
                y -= .0025 * ramp(t, .80, 1.) * (0.5 + 0.5 * sin(phase))
                if angle < 1.25:
                    z += .021 * (1 - ramp(angle, .92, 1.25)) * ramp(t, .45, 1.)
                    x = max(x, (.071 + .009 * ramp(t, .5, 1.)) * ramp(t, .18, .55))
                path.append((side * x, y, z))
            outward = (side * sin(angle), 0.11, cos(angle))
            name = ('Right' if side < 0 else 'Left') + f' wave {i + 1:02d}'
            yield Guide(name, tuple(path), outward, width * (0.88 + 0.060 * sin(phase)), .40 - .048 * sin(phase),
                        side * (.29 + .16 * sin(phase)), 1.03 + 0.24 * sin(phase * 1.73), region)
            if i in (2, 6, 12, 17):
                is_short = i % 4 == 0
                length = 8 if is_short else 10
                lift = .0049 + .0013 * sin(i)
                points = tuple((x + outward[0] * lift + side * .0032 * sin(pi * j / length),
                                y + .005 * sin(pi * j / length), z + outward[2] * lift + .0026 * sin(3 * j / length))
                               for j, (x, y, z) in enumerate(path[:length]))
                yield Guide(name + ' · surface comb', points, outward, width * .27, .23,
                            side * .25, 1.23 + .06 * cos(i), detail=True)


def crown_whorl():
    # Fan the upper guides around the offset whorl behind the cloth, continuing
    # the part into the long cascade rather than leaving an exposed dome.
    crown_y = (0.150, .153, .153, .146, .136, .125)
    for side in (-1, 1):
        for i in range(5):
            angle = 1.31 + i * .40
            points = []
            for j, y in enumerate(crown_y):
                r = j / (len(crown_y) - 1)
                a = side * (angle + .28 * sin(pi * r)) + .13 * (1 - r)
                p = scalp(y, a)
                lift = (.006 + i * .00065) * sin(pi * (.18 + .70 * r))
                p += Vector((lift * sin(a) - .004 * (1 - r), lift * (1 - .37 * r), lift * cos(a) - .006 * r))
                if i < 2:
                    p.z += .005 * (1 - r)
                points.append(tuple(p))
            yield Guide(f'Whorl {side:+d}-{i + 1}', tuple(points), (side * .35, .8, -.40),
                        .0093 + .0014 * sin(i * 1.83 + side), .31, side * .20,
                        1.11 + .11 * sin(i * 1.18 + side), detail=i == 3)
        for i in range(2):
            # The neck remains behind a shorter bedding layer while the parted
            # foreground wave tips can separate a little in space.
            phase = 0.61 * side + 1.09 * i
            path = tuple((side * (.014 + .031 * i + .010 * sin(3.5 * t + phase)),
                          .084 - (.076 + i * .008) * t,
                          -.064 - .012 * ramp(t, .12, .81) + .005 * cos(7.0 * t + phase))
                         for t in (0., .24, .49, .71, 1.))
            yield Guide(f'Nape underneath {side:+d}-{i + 1}', path, (side * .18, .15, -1.), .015,
                        .32, side * .23, .87, detail=False)
    layers = (
        ((-.012, .085, -.069), (-.011, .067, -.079), (.003, .047, -.081),
         (.011, .024, -.075), (.002, .004, -.072), (-.013, -.009, -.069)),
        ((.006, .071, -.065), (.014, .054, -.071), (.007, .035, -.072),
         (-.006, .020, -.075), (-.002, .002, -.078), (.014, -.013, -.072)),
    )
    for i, path in enumerate(layers):
        yield Guide(f'Nape underneath center {i + 1}', path, (.03, .10, -1.), .015 + .002 * i,
                    .31, .18 - .32 * i, .85 + .08 * i)



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
    chocolate = material('Chocolate waves', .45, .58)
    cloth = material('Embroidered red cotton', .82, 0.)
    base = scalp_underlay(high).create('Roma scalp underlay', chocolate, 'crown')
    base['hairLayer'] = 'underlay'
    headband(high, cloth)
    static_crown = Surface()
    static_waves = Surface()
    for guide in (*forelocks(), *crown_whorl(), *waves()):
        if guide.detail and not high:
            continue
        spline, author = author_bezier(guide)
        compact = guide.name.startswith(('Whorl', 'Nape underneath', 'Part root'))
        crest = guide.name.startswith(('Swept forehead', 'Outer frame', 'Part root', 'Whorl'))
        surface = Surface() if guide.region else static_crown if crest else static_waves
        if compact:
            rows, sides = 10, 6 if high else 5
        elif guide.detail:
            rows, sides = 12, 5
        elif high:
            rows, sides = (22, 7) if guide.region or crest else (19, 6)
        else:
            rows, sides = (16, 7) if guide.region else (13, 6)
        sweep(surface, guide, sample_guide(spline, rows), sides=sides)
        if guide.region:
            obj = surface.create('Roma ' + guide.name, chocolate, 'crown' if crest else 'waves')
            controls = [seat_crown(under_band(p.copy())) for p in sample_guide(spline, 30)]
            obj['hairChain'] = [round(float(v), 6) for i in (0, 10, 20, 30) for v in controls[i]]
            obj['hairRegion'] = guide.region
            obj['hairRadius'] = 0.34 * guide.width
        author.hide_set(True)
    static_crown.create('Roma fixed part and forehead curls', chocolate, 'crown')
    static_waves.create('Roma fixed cascade and nape', chocolate, 'waves')
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
