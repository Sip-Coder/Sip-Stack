"""Body shells and mechanisms for the Blender-authored Hummin."""

from math import cos, pi, sin

import bpy
from mathutils import Vector


# The front and right design sheets share a center and a scale. The shell's
# front and back depths are separate so its white profile follows both views.
TORSO_RINGS = (
    (.986, .151, -.085, .090),
    (1.001, .172, -.099, .107),
    (1.035, .181, -.108, .115),
    (1.110, .195, -.130, .124),
    (1.200, .217, -.143, .143),
    (1.280, .232, -.157, .151),
    (1.360, .245, -.160, .156),
    (1.420, .247, -.153, .146),
    (1.455, .212, -.142, .134),
    (1.490, .153, -.130, .118),
    (1.520, .098, -.113, .100),
)


class BodyMesh:
    """Collect static parts in one mesh. Each material becomes one glTF draw."""

    def __init__(self):
        self.vertices = []
        self.faces = []
        self.surfaces = []

    def loft(self, rings, material, sides=20, contour=1, basis=None):
        if basis is None:
            u, v = Vector((1, 0, 0)), Vector((0, 1, 0))
        else:
            u, v = basis
        start = len(self.vertices)
        for center, width, depth in rings:
            center = Vector(center)
            for i in range(sides):
                azimuth = i * 2 * pi / sides
                x = cos(azimuth)
                y = sin(azimuth)
                self.vertices.append(center + u * width * signed_power(x, contour) +
                                     v * depth * signed_power(y, contour))
        self.face(tuple(range(start + sides - 1, start - 1, -1)), material, False)
        for j in range(len(rings) - 1):
            bottom = start + j * sides
            top = bottom + sides
            for i in range(sides):
                next_i = (i + 1) % sides
                self.face((bottom + i, bottom + next_i, top + next_i, top + i), material, True)
        end = start + (len(rings) - 1) * sides
        self.face(tuple(range(end, end + sides)), material, False)

    def face(self, vertices, material, smooth):
        self.faces.append(vertices)
        self.surfaces.append((material, smooth))

    def along(self, start, end, profile, material, sides=20, contour=1):
        start, end = Vector(start), Vector(end)
        axis = (end - start).normalized()
        guide = Vector((1, 0, 0)) if abs(axis.x) < .85 else Vector((0, 1, 0))
        u = (guide - axis * guide.dot(axis)).normalized()
        v = axis.cross(u)
        rings = [(start.lerp(end, fraction), width, depth) for fraction, width, depth in profile]
        self.loft(rings, material, sides, contour, (u, v))

    def ellipsoid(self, center, radii, material, sides=20):
        x, y, z = center
        a, b, c = radii
        # Tiny end circles close without duplicated pole vertices.
        rings = []
        for angle in (-89, -68, -48, -26, 0, 26, 48, 68, 89):
            elevation = angle * pi / 180
            rings.append(((x, y, z + c * sin(elevation)), a * cos(elevation), b * cos(elevation)))
        self.loft(rings, material, sides)

    def build(self, parent):
        geometry = bpy.data.meshes.new("Hummin body shell geometry")
        geometry.from_pydata(self.vertices, [], self.faces)
        materials = list(dict.fromkeys(material for material, smooth in self.surfaces))
        for material in materials:
            geometry.materials.append(material)
        slots = {material: index for index, material in enumerate(materials)}
        for polygon, (material, smooth) in zip(geometry.polygons, self.surfaces):
            polygon.material_index = slots[material]
            polygon.use_smooth = smooth
        geometry.update()
        obj = bpy.data.objects.new("Hummin body shells", geometry)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        return obj


def signed_power(number, exponent):
    return abs(number) ** exponent * (1 if number >= 0 else -1)


def body_core(mesh, shell, joint, metal):
    torso = [((0, (front + back) * .5, z), width, (back - front) * .5)
             for z, width, front, back in TORSO_RINGS]
    mesh.loft(torso, shell, sides=28)
    mesh.loft((
        ((0, .013, .853), .104, .086),
        ((0, .010, .871), .173, .101),
        ((0, .003, .925), .196, .121),
        ((0, .001, .975), .182, .106),
        ((0, .000, 1.017), .149, .085),
    ), joint, sides=24, contour=.84)
    mesh.along((0, .002, 1.485), (0, .002, 1.542), (
        (0, .084, .079),
        (.17, .088, .083),
        (.61, .082, .078),
        (1, .079, .075),
    ), joint, sides=24)
    mesh.along((0, .002, 1.521), (0, .002, 1.540), (
        (0, .084, .080),
        (.22, .086, .082),
        (.76, .086, .082),
        (1, .083, .078),
    ), metal, sides=24)


def arm(mesh, side, shell, joint, metal, glow):
    s = side
    mesh.ellipsoid((s * .274, .008, 1.414), (.072, .087, .086), shell)
    mesh.along((s * .324, .001, 1.417), (s * .347, .001, 1.417), (
        (0, .044, .045),
        (.34, .044, .045),
        (.78, .035, .036),
        (1, .030, .030),
    ), metal, sides=18)
    mesh.along((s * .344, .001, 1.417), (s * .350, .001, 1.417), (
        (0, .029, .029),
        (.53, .029, .029),
        (1, .025, .025),
    ), glow, sides=18)

    mesh.along((s * .278, .009, 1.363), (s * .308, -.004, 1.214), (
        (0, .046, .049),
        (.12, .054, .053),
        (.44, .051, .049),
        (.80, .043, .042),
        (.97, .037, .036),
        (1, .032, .030),
    ), shell)
    mesh.ellipsoid((s * .313, -.004, 1.176), (.045, .051, .052), joint, sides=18)
    mesh.along((s * .341, -.004, 1.176), (s * .364, -.004, 1.176), (
        (0, .033, .032),
        (.54, .032, .032),
        (.77, .026, .027),
        (1, .022, .023),
    ), joint, sides=16)
    mesh.along((s * .362, -.004, 1.176), (s * .367, -.004, 1.176), (
        (0, .021, .021),
        (.46, .020, .020),
        (1, .016, .016),
    ), metal, sides=16)
    mesh.along((s * .318, -.006, 1.156), (s * .324, -.020, .974), (
        (0, .038, .035),
        (.13, .050, .043),
        (.38, .052, .046),
        (.72, .044, .039),
        (.94, .033, .031),
        (1, .028, .026),
    ), shell, contour=.88)
    mesh.ellipsoid((s * .324, -.021, .965), (.036, .038, .031), joint, sides=16)
    hand(mesh, s, shell, joint, metal)


def hand(mesh, side, shell, joint, metal):
    s = side
    mesh.along((s * .325, -.024, .953), (s * .329, -.026, .863), (
        (0, .026, .032),
        (.22, .038, .035),
        (.55, .039, .031),
        (.85, .031, .027),
        (1, .027, .022),
    ), shell, sides=16, contour=.85)
    # Four small segmented fingers and one offset thumb read against the light palm.
    for index, fall in enumerate((.028, .034, .033, .026)):
        x = .305 + index * .014
        tip_x = x + (index - 1.5) * .002
        start = (s * x, -.047, .884)
        knuckle = (s * tip_x, -.052, .862)
        end = (s * (tip_x - .003), -.043, .862 - fall)
        mesh.along(start, end, (
            (0, .006, .007),
            (.20, .009, .010),
            (.69, .008, .008),
            (.88, .007, .007),
            (1, .004, .004),
        ), joint, sides=10)
        mesh.along(start, knuckle, (
            (0, .006, .008),
            (.25, .009, .010),
            (.75, .009, .010),
            (1, .007, .008),
        ), metal, sides=10)
    mesh.along((s * .302, -.038, .911), (s * .275, -.052, .867), (
        (0, .012, .015),
        (.3, .014, .015),
        (.74, .011, .012),
        (1, .006, .007),
    ), joint, sides=12)
    mesh.along((s * .291, -.049, .899), (s * .278, -.057, .880), (
        (0, .009, .010),
        (.35, .011, .012),
        (.79, .009, .010),
        (1, .005, .006),
    ), metal, sides=10)


def leg(mesh, side, shell, joint, metal, glow):
    x = side * .132
    mesh.ellipsoid((x, .023, .871), (.074, .082, .061), joint, sides=18)
    mesh.loft((
        ((x, -.016, .562), .047, .045),
        ((x, -.018, .580), .056, .054),
        ((x, -.006, .636), .063, .063),
        ((x, .005, .707), .069, .083),
        ((x, .011, .774), .074, .098),
        ((x, .019, .829), .075, .097),
        ((x, .024, .868), .068, .080),
        ((x, .023, .884), .054, .060),
    ), shell, contour=.95)
    mesh.ellipsoid((x, -.021, .523), (.065, .071, .064), joint)
    mesh.along((x, -.070, .523), (x, -.093, .523), (
        (0, .059, .059),
        (.35, .062, .062),
        (.77, .057, .057),
        (1, .052, .052),
    ), metal, sides=22)
    mesh.along((x, -.090, .523), (x, -.107, .523), (
        (0, .052, .052),
        (.23, .050, .050),
        (.54, .045, .045),
        (.79, .038, .038),
        (1, .020, .020),
    ), shell, sides=22)

    mesh.loft((
        ((x, -.003, .169), .047, .055),
        ((x, -.002, .181), .054, .065),
        ((x, -.001, .243), .062, .076),
        ((x, -.001, .321), .073, .087),
        ((x, -.002, .384), .080, .092),
        ((x, -.002, .423), .077, .086),
        ((x, -.004, .464), .068, .074),
        ((x, -.010, .477), .061, .066),
    ), shell, contour=.94)
    mesh.ellipsoid((x, -.002, .170), (.058, .064, .025), joint, sides=18)
    boot(mesh, x, side, shell, joint, glow)


def boot(mesh, x, side, shell, joint, glow):
    # A broad toe runs forward from a narrow ankle to match the profile.
    mesh.loft((
        ((x, -.041, .000), .083, .138),
        ((x, -.043, .008), .096, .153),
        ((x, -.043, .023), .098, .155),
        ((x, -.042, .034), .094, .151),
    ), joint, sides=26, contour=.69)
    mesh.loft((
        ((x, -.042, .028), .092, .148),
        ((x, -.043, .037), .099, .155),
        ((x, -.041, .061), .096, .152),
        ((x, -.034, .081), .091, .143),
        ((x, -.019, .108), .081, .120),
        ((x, -.007, .133), .075, .097),
        ((x, -.002, .154), .069, .081),
        ((x, -.003, .165), .063, .072),
    ), shell, sides=26, contour=.73)
    # The cyan shoe marker follows the profile-side lip. It sits inside the sole's silhouette.
    mesh.along((x + side * .094, -.073, .049), (x + side * .091, .037, .050), (
        (0, .001, .001),
        (.10, .004, .003),
        (.91, .004, .003),
        (1, .001, .001),
    ), glow, sides=8)


def create_body(parent, palette):
    """Author below-neck mechanics and shell and parent them to the idle rig."""
    shell = palette["pearl"]
    joint = palette["rubber"]
    metal = palette["steel"]
    glow = palette["cyan"]
    mesh = BodyMesh()
    body_core(mesh, shell, joint, metal)
    for side in (-1, 1):
        arm(mesh, side, shell, joint, metal, glow)
        leg(mesh, side, shell, joint, metal, glow)
    return {"body": mesh.build(parent)}
