"""Model Hummin's helmet, glass and phosphor display in Blender space (+Z up)."""

from math import cos, pi, sin, sqrt

import bpy


# Z, lateral radius, depth radius, fore/aft center. The bottom shoulder is
# flatter than the crown so the ceramic case ends above the scarf.
HELMET_STATIONS = (
    (-.242, .024, .020, .008),
    (-.234, .112, .102, .008),
    (-.197, .181, .151, .008),
    (-.144, .221, .188, .005),
    (-.073, .245, .213, .001),
    (.015, .247, .218, .000),
    (.088, .237, .211, .000),
    (.149, .201, .178, .002),
    (.197, .153, .134, .004),
    (.226, .097, .088, .006),
    (.236, .048, .042, .006),
    (.239, .005, .005, .006),
)


def helmet_section(z):
    def tangent(before, after):
        return 2 * before * after / (before + after) if before * after > 0 else 0

    for i, (lower, upper) in enumerate(zip(HELMET_STATIONS, HELMET_STATIONS[1:])):
        if z <= upper[0]:
            step = upper[0] - lower[0]
            t = min(1, max(0, (z - lower[0]) / step))
            prev = HELMET_STATIONS[max(0, i - 1)]
            next_row = HELMET_STATIONS[min(i + 2, len(HELMET_STATIONS) - 1)]
            values = []
            for a, b, p, n in zip(lower[1:], upper[1:], prev[1:], next_row[1:]):
                slope = (b - a) / step
                left = tangent((a - p) / (lower[0] - prev[0]), slope) if i > 0 else slope
                right = tangent(slope, (n - b) / (next_row[0] - upper[0])) if next_row != upper else slope
                values.append(a + (b - a) * t * t * (3 - 2 * t) +
                              step * t * (1 - t) * (left * (1 - t) - right * t))
            return tuple(values)
    return HELMET_STATIONS[-1][1:]


def make_mesh(name, points, faces, parent, materials, material_indices=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    for material in materials:
        mesh.materials.append(material)
    for index, polygon in enumerate(mesh.polygons):
        polygon.use_smooth = True
        if material_indices is not None:
            polygon.material_index = material_indices[index]
    return obj


def build_shell(parent, material):
    sides = 44
    lower, upper = HELMET_STATIONS[0][0], HELMET_STATIONS[-1][0]
    elevations = sorted({row[0] for row in HELMET_STATIONS} |
                        {lower + (upper - lower) * step / 20 for step in range(1, 20)})
    points = []
    for z in elevations:
        rx, ry, y0 = helmet_section(z)
        for step in range(sides):
            angle = 2 * pi * step / sides
            points.append((rx * sin(angle), y0 - ry * cos(angle), z))
    faces = [tuple(reversed(range(sides)))]
    for start in range(0, len(points) - sides, sides):
        for step in range(sides):
            after = (step + 1) % sides
            faces.append((start + step, start + after,
                          start + sides + after, start + sides + step))
    faces.append(tuple(range(len(points) - sides, len(points))))
    make_mesh('Helmet.Ceramic', points, faces, parent, (material,))


def front_surface(x, z, offset):
    rx, ry, y0 = helmet_section(z)
    return y0 - ry * sqrt(max(0, 1 - (x / rx) ** 2)) - offset


def build_display(parent, palette):
    # Sweep across the helmet surface, rounding each corner. The rim and
    # gasket only use the perimeter, so there are no hidden stacked panels.
    levels = (-1, -.975, -.92, -.83, -.68, -.44, -.22, 0, .22, .44,
              .68, .83, .92, .975, 1)
    columns = 20
    stride = columns + 1

    def surface(row, col, width, lower, upper, offset):
        v = levels[row]
        corner = max(0, (abs(v) - .78) / .22)
        row_width = width * (.99 + .01 * (1 - v * v) - .054 * corner ** 2)
        t = (v + 1) / 2
        u = -1 + 2 * col / columns
        z = (1 - t) * (lower + .009 * u ** 4) + t * (upper - .015 * u ** 4)
        x = u * row_width
        return x, front_surface(x, z, offset), z

    rim = (.222, -.151, .115, .0065)
    rim_middle = (.206, -.150, .114, .0070)
    gasket = (.190, -.149, .113, .0075)
    glass = (.184, -.145, .109, .0080)
    last = len(levels) - 1
    perimeter = ([(0, col) for col in range(stride)] +
                 [(row, columns) for row in range(1, last + 1)] +
                 [(last, col) for col in reversed(range(columns))] +
                 [(row, 0) for row in reversed(range(1, last))])
    ring = len(perimeter)
    trim = [surface(row, col, *section) for section in (rim, rim_middle, gasket, glass)
            for row, col in perimeter]
    trim_faces = []
    for start in (0, ring, 2 * ring):
        for step in range(ring):
            after = (step + 1) % ring
            trim_faces.append((start + step, start + after, start + ring + after, start + ring + step))
    make_mesh('Display.Bezel', trim, trim_faces, parent,
              (palette['ceramicRim'], palette['rubber']), [0] * (2 * ring) + [1] * ring)

    points = [surface(row, col, *glass) for row in range(last + 1) for col in range(stride)]
    faces = [
        (row * stride + col, row * stride + col + 1,
         (row + 1) * stride + col + 1, (row + 1) * stride + col)
        for row in range(len(levels) - 1) for col in range(columns)
    ]
    make_mesh('Display.Glass', points, faces, parent, (palette['visor'],))


def build_receivers(parent, palette):
    # Axial section of the graphite rubber, silver bevel, luminous ring and
    # inset speaker hub. Both sides share one mesh and five PBR materials.
    section = (
        (.221, .078, 0), (.238, .086, 0), (.259, .085, 0),
        (.276, .076, 1), (.289, .068, 1), (.292, .060, 1),
        (.295, .055, 2), (.295, .049, 2), (.293, .045, 3),
        (.292, .019, 3), (.294, .016, 4), (.295, .012, 4),
        (.295, .002, 4),
    )
    sides = 28
    points = []
    faces = []
    slots = []
    for side in (-1, 1):
        base = len(points)
        for x, radius, _ in section:
            for step in range(sides):
                angle = 2 * pi * step / sides
                points.append((side * x, .009 + radius * sin(angle), -.019 + radius * cos(angle)))
        for row, (_, _, slot) in enumerate(section[1:]):
            for step in range(sides):
                after = (step + 1) % sides
                face = (base + row * sides + step, base + (row + 1) * sides + step,
                        base + (row + 1) * sides + after, base + row * sides + after)
                faces.append(face if side == 1 else tuple(reversed(face)))
                slots.append(slot)
        face = tuple(range(len(points) - sides, len(points)))
        faces.append(tuple(reversed(face)) if side == 1 else face)
        slots.append(section[-1][2])
    return make_mesh('Helmet.Receivers', points, faces, parent,
                     tuple(palette[key] for key in ('darkMetal', 'ceramicRim', 'cyan', 'rubber', 'steel')),
                     slots)


def display_stroke(parent, name, material, neutral, expression_name, expression):
    # A shallow opaque strip reads as illuminated pixels. Giving it a tiny
    # solid depth avoids alpha layering and keeps the edges clean in profile.
    rings = 17
    sides = 8

    def positions(path):
        points = []
        for step in range(rings):
            u = 2 * step / (rings - 1) - 1
            x, z, radius = path(u)
            for sample in range(sides):
                angle = sample * 2 * pi / sides
                height = z + radius * cos(angle)
                depth = .013 + .0016 * sin(angle)
                points.append((x, front_surface(x, height, depth), height))
        return points

    faces = [tuple(reversed(range(sides)))]
    for ring in range(rings - 1):
        start = ring * sides
        for sample in range(sides):
            after = (sample + 1) % sides
            faces.append((start + sample, start + after,
                          start + sides + after, start + sides + sample))
    faces.append(tuple(range((rings - 1) * sides, rings * sides)))
    obj = make_mesh(name, positions(neutral), faces, parent, (material,))
    obj.shape_key_add(name='Basis')
    shape = obj.shape_key_add(name=expression_name)
    for vertex, position in zip(shape.data, positions(expression)):
        vertex.co = position
    return obj


def create_head(parent, palette):
    """Return the pose pivot and the animated screen meshes under it."""
    head = bpy.data.objects.new('Hummin.Head', None)
    bpy.context.collection.objects.link(head)
    head.parent = parent
    head.location = (0, 0, 1.764)

    build_shell(head, palette['pearl'])
    build_display(head, palette)
    build_receivers(head, palette)

    eyes = []
    for side, label in ((-1, 'R'), (1, 'L')):
        center = side * .093

        def neutral(u):
            return (center + .045 * u, -.018 + .020 * (1 - u * u),
                    .0049 + .0021 * (1 - u * u))

        def blink(u):
            return (center + .045 * u, -.022 - .005 * (1 - u * u),
                    .0024 + .0018 * (1 - u * u))

        eyes.append(display_stroke(head, 'Display.Eye.' + label, palette['cyan'],
                                   neutral, 'Blink', blink))

    def neutral_mouth(u):
        return (.023 * u, -.097 - .0017 * (1 - u * u),
                .0007 + .0026 * (1 - u * u))

    def smile(u):
        return (.051 * u, -.090 - .019 * (1 - u * u),
                .0010 + .0060 * (1 - u * u))

    mouth = display_stroke(head, 'Display.Mouth', palette['cyan'],
                           neutral_mouth, 'Smile', smile)
    return dict(head=head, eyes=eyes, mouth=mouth)
