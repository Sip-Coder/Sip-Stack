"""Model Hummin's apron, belt, back pouch and scarf in Blender."""

from math import cos, pi, sin

import bpy
from mathutils import Vector


class MeshBatch:
    """Collect parts that share a material into one exported primitive."""

    def __init__(self):
        self.points = []
        self.faces = []

    def add(self, points, faces):
        first = len(self.points)
        self.points.extend(points)
        self.faces.extend(tuple(first + index for index in face) for face in faces)

    def object(self, name, material, parent):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.points, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        mesh.materials.append(material)
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        return obj


def linear_channel(value):
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def leather_material(name, srgb, roughness, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    rgba = tuple(linear_channel(channel) for channel in srgb) + (1.0,)
    material.diffuse_color = rgba
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


def add_sheet(batch, rows, point, thickness=0.008, width_steps=12, lining_axes=None):
    """Close a ruled cloth surface by offsetting its lining toward the body."""
    row_size = width_steps + 1
    outer = [point(row, step / width_steps) for row in rows for step in range(row_size)]
    size = len(outer)
    if lining_axes is None:
        lining_axes = [(0, 1, 0)] * len(rows)
    inner = []
    for row, (dx, dy, dz) in enumerate(lining_axes):
        strip = outer[row * row_size:(row + 1) * row_size]
        inner.extend((x + dx * thickness, y + dy * thickness, z + dz * thickness) for x, y, z in strip)
    points = outer + inner
    faces = []
    for row in range(len(rows) - 1):
        for column in range(width_steps):
            index = row * row_size + column
            face = (index, index + row_size, index + row_size + 1, index + 1)
            faces.extend((face, tuple(index + size for index in reversed(face))))
    perimeter = (
        list(range(width_steps, -1, -1))
        + list(range(row_size, size, row_size))
        + list(range(size - row_size + 1, size))
        + list(range(size - row_size - 1, width_steps, -row_size))
    )
    faces.extend((b, a, a + size, b + size) for a, b in zip(perimeter, perimeter[1:] + perimeter[:1]))
    batch.add(points, faces)


def add_tube(batch, path, radius, sides=6, closed=False):
    """Sweep a small rounded edge, stitch or fastener around a centerline."""
    path = [Vector(point) for point in path]
    points = []
    for index, point in enumerate(path):
        before = path[index - 1] if index or closed else point
        after = path[(index + 1) % len(path)] if index + 1 < len(path) or closed else point
        tangent = (after - before).normalized()
        reference = Vector((0, 1, 0))
        if abs(tangent.dot(reference)) > 0.94:
            reference = Vector((0, 0, 1))
        normal = tangent.cross(reference).normalized()
        binormal = tangent.cross(normal)
        points.extend(
            point + radius * (normal * cos(angle) + binormal * sin(angle))
            for angle in (2 * pi * side / sides for side in range(sides))
        )
    faces = []
    for index in range(len(path) if closed else len(path) - 1):
        a, b = index * sides, ((index + 1) % len(path)) * sides
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((a + side, a + nxt, b + nxt, b + side))
    if not closed:
        faces.extend((tuple(reversed(range(sides))), tuple(range(len(points) - sides, len(points)))))
    batch.add(points, faces)


def signed_power(value, exponent):
    return abs(value) ** exponent if value >= 0 else -(abs(value) ** exponent)


def add_ellipsoid(batch, center, radii, exponent=1, segments=16, rings=8):
    """An ellipsoid, or a soft rectangular panel at a lower exponent."""
    points = []
    for row in range(1, rings):
        latitude = pi * (row / rings - 0.5)
        radial = cos(latitude) ** exponent
        height = signed_power(sin(latitude), exponent)
        for side in range(segments):
            angle = 2 * pi * side / segments
            points.append((
                center[0] + radii[0] * radial * signed_power(cos(angle), exponent),
                center[1] + radii[1] * radial * signed_power(sin(angle), exponent),
                center[2] + radii[2] * height,
            ))
    lower, upper = len(points), len(points) + 1
    points.extend(((center[0], center[1], center[2] - radii[2]), (center[0], center[1], center[2] + radii[2])))
    faces = []
    for side in range(segments):
        nxt = (side + 1) % segments
        faces.append((lower, nxt, side))
        for row in range(rings - 2):
            a, b = row * segments, (row + 1) * segments
            faces.append((a + side, a + nxt, b + nxt, b + side))
        a = (rings - 2) * segments
        faces.append((a + side, a + nxt, upper))
    batch.add(points, faces)


BIB_ROWS = (
    (1.385, 0.121, -0.168, -0.149, 0.002),
    (1.363, 0.127, -0.172, -0.146, 0.002),
    (1.330, 0.132, -0.177, -0.142, 0.000),
    (1.285, 0.144, -0.179, -0.135, 0.000),
    (1.235, 0.164, -0.174, -0.120, 0.000),
    (1.177, 0.184, -0.166, -0.101, 0.000),
    (1.131, 0.196, -0.155, -0.080, 0.000),
    (1.069, 0.198, -0.151, -0.071, 0.000),
    (1.004, 0.196, -0.153, -0.068, 0.000),
    (0.963, 0.190, -0.157, -0.076, 0.002),
)

SKIRT_ROWS = (
    (0.982, 0.190, -0.154, -0.080, 0.001),
    (0.949, 0.196, -0.152, -0.069, 0.001),
    (0.894, 0.203, -0.151, -0.055, 0.002),
    (0.822, 0.206, -0.148, -0.047, 0.004),
    (0.751, 0.203, -0.147, -0.048, 0.007),
    (0.716, 0.198, -0.142, -0.053, 0.013),
    (0.693, 0.180, -0.136, -0.064, 0.023),
)


def apron_contour(row, section):
    z, width, front, side, bend = row
    y = front + (side - front) * abs(section) ** 3
    return width * section, y, z + bend * abs(section) ** 4


def skirt_point(row, fraction, sign):
    gap = row[4] / row[1]
    section = -1 + (1 - gap) * fraction if sign < 0 else gap + (1 - gap) * fraction
    x, y, z = apron_contour(row, section)
    width_progress = fraction if sign > 0 else 1 - fraction
    y -= 0.007 * sin(pi * width_progress) ** 2
    return x, y, z


def forward(point):
    x, y, z = point
    return x, y - 0.003, z


def apron(batches):
    cloth = batches["slate"]
    edges = batches["slate edge"]
    add_sheet(cloth, BIB_ROWS, lambda row, u: apron_contour(row, 2 * u - 1))
    add_tube(edges, [forward(apron_contour(BIB_ROWS[0], s / 8)) for s in range(-8, 9)], 0.002)
    for sign in (-1, 1):
        add_sheet(cloth, SKIRT_ROWS, lambda row, u: skirt_point(row, u, sign))
        add_tube(edges, [forward(apron_contour(row, sign * 0.965)) for row in BIB_ROWS], 0.002)
        for fraction in (0.025, 0.975):
            add_tube(edges, [forward(skirt_point(row, fraction, sign)) for row in SKIRT_ROWS], 0.0018)
        add_tube(edges, [
            forward(skirt_point(SKIRT_ROWS[-1], index / 12, sign)) for index in range(13)
        ], 0.002)


def ring_points(radius_x, radius_y, center_y, z, count=36):
    return [
        (radius_x * cos(angle), center_y + radius_y * sin(angle), z)
        for angle in (2 * pi * index / count for index in range(count))
    ]


def add_closed_loft(batch, rows):
    count = len(rows[0])
    points = [point for row in rows for point in row]
    faces = []
    for row in range(len(rows)):
        lower = row * count
        upper = ((row + 1) % len(rows)) * count
        for side in range(count):
            nxt = (side + 1) % count
            faces.append((lower + side, lower + nxt, upper + nxt, upper + side))
    batch.add(points, faces)


def buckle(batch, center, radii, radius):
    add_tube(batch, [
        (center[0] + radii[0] * cos(angle), center[1], center[2] + radii[1] * sin(angle))
        for angle in (2 * pi * side / 20 for side in range(20))
    ], radius, closed=True)


def belt_and_pouches(batches):
    leather = batches["umber"]
    edging = batches["umber edge"]
    bronze = batches["bronze"]
    add_closed_loft(leather, [
        ring_points(0.199, 0.146, -0.011, 0.932),
        ring_points(0.213, 0.155, -0.012, 0.932),
        ring_points(0.218, 0.156, -0.012, 0.939),
        ring_points(0.218, 0.156, -0.012, 0.974),
        ring_points(0.211, 0.154, -0.012, 0.981),
        ring_points(0.199, 0.144, -0.011, 0.981),
    ])
    for edge_height in (0.939, 0.974):
        add_tube(edging, ring_points(0.216, 0.156, -0.012, edge_height), 0.0016, closed=True)
    buckle(bronze, (0, -0.174, 0.958), (0.026, 0.015), 0.004)
    add_ellipsoid(bronze, (0, -0.176, 0.958), (0.014, 0.003, 0.002), segments=8, rings=4)
    for sign in (-1, 1):
        x = 0.177 * sign
        add_ellipsoid(leather, (x, -0.106, 0.906), (0.040, 0.042, 0.061), exponent=0.43, rings=10)
        add_ellipsoid(batches["tan leather"], (x, -0.137, 0.944), (0.041, 0.025, 0.025),
                      exponent=0.72, rings=6)
        add_ellipsoid(bronze, (x, -0.163, 0.945), (0.0055, 0.003, 0.0055), segments=10, rings=4)
        add_tube(edging, [
            (x + 0.034 * cos(angle), -0.145 - 0.010 * sin(angle), 0.941 - 0.018 * sin(angle))
            for angle in (pi * side / 12 for side in range(13))
        ], 0.0015)


def straps_and_pack(batches):
    leather = batches["umber"]
    bronze = batches["bronze"]
    # The rear pocket sits close to the white thorax in side view.
    add_ellipsoid(leather, (0, 0.184, 1.221), (0.179, 0.060, 0.174),
                  exponent=0.35, segments=24, rings=14)
    add_ellipsoid(batches["tan leather"], (0, 0.236, 1.308), (0.138, 0.020, 0.067),
                  exponent=0.78, segments=24, rings=8)
    for sign in (-1, 1):
        x = 0.095 * sign
        add_ellipsoid(batches["umber edge"], (x, 0.245, 1.252), (0.012, 0.008, 0.038),
                      exponent=0.45, segments=12, rings=6)
        buckle(bronze, (x, 0.255, 1.250), (0.010, 0.008), 0.0025)
        strap = (
            (0.106, -0.155, 1.374),
            (0.120, -0.144, 1.411),
            (0.137, -0.113, 1.456),
            (0.157, -0.062, 1.480),
            (0.165, 0.013, 1.483),
            (0.160, 0.082, 1.457),
            (0.145, 0.143, 1.415),
            (0.135, 0.178, 1.349),
        )
        path = tuple(reversed(strap))
        lining = []
        for index in range(len(path)):
            previous = path[max(index - 1, 0)]
            following = path[min(index + 1, len(path) - 1)]
            lining.append(Vector((0, previous[2] - following[2], following[1] - previous[1])).normalized())
        add_sheet(leather, path, lambda row, u: (sign * row[0] + 0.025 * (u - 0.5), row[1], row[2]),
                  thickness=0.010, width_steps=4, lining_axes=lining)
        add_tube(batches["tan leather"], [
            (sign * x + 0.007, y - 0.001, z) for x, y, z in strap[:4]
        ], 0.0014)
        buckle(bronze, (0.107 * sign, -0.159, 1.365), (0.008, 0.010), 0.0026)


COLLAR_ROWS = (
    (0.103, 0.070, 1.459, 0.027),
    (0.151, 0.111, 1.449, 0.052),
    (0.176, 0.135, 1.464, 0.055),
    (0.179, 0.141, 1.478, 0.050),
    (0.191, 0.152, 1.487, 0.043),
    (0.181, 0.143, 1.494, 0.043),
    (0.187, 0.147, 1.504, 0.039),
    (0.177, 0.137, 1.512, 0.035),
    (0.173, 0.133, 1.522, 0.030),
    (0.149, 0.110, 1.514, 0.018),
    (0.117, 0.073, 1.501, 0.011),
)


def collar_contour(row, angle):
    width, depth, height, drop = row
    wrap = sin(angle)
    front = max(0.0, -wrap)
    return (
        width * cos(angle),
        depth * wrap - 0.009,
        height - drop * front ** 1.6 + 0.007 * sin(2 * angle + height * 6),
    )


def scarf(batches):
    angles = [2 * pi * index / 40 for index in range(40)]
    add_closed_loft(batches["weave"], [[collar_contour(row, angle) for angle in angles] for row in COLLAR_ROWS])
    for index in (2, 5, 7):
        width, depth, height, drop = COLLAR_ROWS[index]
        trim = (width + 0.0005, depth + 0.0005, height, drop)
        add_tube(batches["weave crease"], [collar_contour(trim, angle) for angle in angles],
                 0.0015, closed=True)
    tail = (
        (0.124, -0.093, 1.473, 0.026),
        (0.174, -0.109, 1.426, 0.034),
        (0.203, -0.098, 1.369, 0.035),
        (0.225, -0.085, 1.299, 0.038),
        (0.239, -0.080, 1.227, 0.038),
        (0.252, -0.069, 1.169, 0.038),
        (0.249, -0.055, 1.103, 0.034),
    )

    def tail_contour(row, u):
        x, y, z, width = row
        section = u * 2 - 1
        return x + section * width, y + 0.017 * section * section, z + 0.016 * section

    add_sheet(batches["weave"], tail, tail_contour, thickness=0.012, width_steps=9)
    for fraction in (0.12, 0.87):
        add_tube(batches["weave crease"], [forward(tail_contour(row, fraction)) for row in tail], 0.0018)
    for index in range(10):
        x, y, z = tail_contour(tail[-1], (index + 0.5) / 10)
        length = 0.016 + 0.010 * sin(index * 1.8) ** 2
        add_tube(batches["weave"], [(x, y, z), (x + 0.004, y + 0.002, z - length * 0.6),
                                   (x + 0.002, y - 0.004, z - length)], 0.0016, sides=5)


def grape_pin(batches):
    grapes = (
        (-0.014, 1.298), (0.004, 1.302), (0.019, 1.292), (-0.018, 1.283),
        (0.000, 1.284), (0.013, 1.277), (-0.010, 1.266), (0.006, 1.261), (-0.003, 1.249),
    )
    for index, (x, z) in enumerate(grapes):
        material = "plum light" if index in (0, 3, 6) else "plum"
        add_ellipsoid(batches[material], (x, -0.180 - 0.001 * (index % 3), z),
                      (0.009, 0.0045, 0.010), segments=10, rings=6)
    add_tube(batches["bronze"], [
        (-0.004, -0.181, 1.300), (0.001, -0.183, 1.317), (0.014, -0.183, 1.323),
        (0.026, -0.181, 1.322),
    ], 0.0024)
    add_ellipsoid(batches["bronze"], (-0.011, -0.181, 1.315), (0.014, 0.0025, 0.005),
                  segments=10, rings=4)


def create_outfit(parent, palette):
    """Return the outfit root below the shared robot root."""
    definitions = {
        "slate": ("Apron · slate leather", (55, 74, 96), 0.66, 0),
        "slate edge": ("Apron · rolled edges", (68, 89, 109), 0.74, 0),
        "umber": ("Gear · brown leather", (111, 78, 53), 0.61, 0),
        "umber edge": ("Gear · burnished edges", (78, 55, 43), 0.68, 0),
        "tan leather": ("Pouches · leather flaps", (142, 106, 68), 0.61, 0),
        "bronze": ("Fasteners · antique brass", (176, 143, 81), 0.42, 0.56),
        "weave": ("Scarf · sand weave", (190, 160, 107), 0.90, 0),
        "weave crease": ("Scarf · fold threads", (168, 133, 83), 0.90, 0),
        "plum": ("Grape pin · plum enamel", (106, 59, 82), 0.48, 0.12),
        "plum light": ("Grape pin · lighter enamel", (126, 74, 94), 0.45, 0.12),
    }
    batches = {key: MeshBatch() for key in definitions}
    apron(batches)
    belt_and_pouches(batches)
    straps_and_pack(batches)
    scarf(batches)
    grape_pin(batches)
    group = bpy.data.objects.new("Hummin Outfit", None)
    bpy.context.collection.objects.link(group)
    group.parent = parent
    for key, (name, rgb, roughness, metalness) in definitions.items():
        material = palette.get(key) or leather_material(name, rgb, roughness, metalness)
        batches[key].object(name, material, group)
    return {"outfit": group}
