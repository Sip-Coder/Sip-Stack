"""Build Hummin's rigid robot shell and three independent glTF animation clips."""

import argparse
from math import radians
from pathlib import Path
import sys

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from hummin_body import create_body
from hummin_head import create_head
from hummin_outfit import create_outfit


def linear_rgb(hex_color):
    srgb = [int(hex_color[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    return tuple(value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
                 for value in srgb)


def surface(name, color, metallic, roughness, emission=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    color = (*linear_rgb(color), 1)
    material.diffuse_color = color
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = color
        bsdf.inputs['Emission Strength'].default_value = emission
    return material


def robot_palette():
    return {
        'pearl': surface('Ivory ceramic', 'E5E1D5', .08, .32),
        'ceramicRim': surface('Satin silver trim', 'C2C9CE', .36, .29),
        'rubber': surface('Graphite seals', '232D34', .08, .66),
        'darkMetal': surface('Graphite hardware', '404C56', .40, .35),
        'cyan': surface('Cyan phosphor', '3AD1EE', .10, .30, 1.35),
        'steel': surface('Brushed silver', '8F9EAB', .44, .42),
        'visor': surface('Blue-black display glass', '122630', .14, .32),
    }


def stash_clip(owner, name):
    # The glTF exporter merges same-named NLA tracks across owners. Both eyes
    # therefore travel in one Blink clip, separate from the mouth and idle.
    animation = owner.animation_data
    action = animation.action
    action.name = name + ' ' + owner.name
    track = animation.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    slot = getattr(animation, 'action_slot', None)
    if slot is not None:
        strip.action_slot = slot
    animation.action = None


def face_clip(meshes, name, poses):
    for mesh in meshes:
        shapes = mesh.data.shape_keys
        shape = shapes.key_blocks[name]
        for frame, weight in poses:
            shape.value = weight
            shape.keyframe_insert('value', frame=frame)
        stash_clip(shapes, name)


def motion(head):
    pivot = head['head']
    pivot.rotation_mode = 'XYZ'
    # Feet stay planted while the head's servo makes a slow listening gesture.
    for frame, angles in (
        (1, (0, 0, 0)), (35, (.8, -.5, 3.5)), (74, (-.6, .7, -2.8)),
        (108, (.4, -.3, -.6)), (145, (0, 0, 0)),
    ):
        pivot.rotation_euler = tuple(radians(angle) for angle in angles)
        pivot.keyframe_insert('rotation_euler', frame=frame)
    stash_clip(pivot, 'Idle')
    face_clip(head['eyes'], 'Blink', ((1, 0), (3, .22), (5, 1), (7, .68), (10, 0)))
    face_clip([head['mouth']], 'Smile', ((1, 0), (9, 1), (28, 1), (44, 0)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='Uncompressed GLB path')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    args.output.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = 145
    root = bpy.data.objects.new('Hummin', None)
    bpy.context.collection.objects.link(root)
    palette = robot_palette()
    create_body(root, palette)
    create_outfit(root, palette)
    head = create_head(root, palette)
    motion(head)
    scene.frame_set(1)

    bpy.ops.export_scene.gltf(
        filepath=str(args.output.resolve()),
        export_format='GLB',
        export_animation_mode='NLA_TRACKS',
        export_morph_normal=False,
        export_cameras=False,
        export_lights=False,
    )


if __name__ == '__main__':
    main()
