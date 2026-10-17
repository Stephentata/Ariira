import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build Ari's soft 3D tutor mascot.")
    parser.add_argument("--output", required=True, help="Absolute path for the exported GLB.")
    parser.add_argument("--preview", help="Optional absolute path for a rendered PNG preview.")
    return parser.parse_args(argv)


def make_material(name, color, roughness=0.58, emission=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return material


def add_uv_sphere(name, location, scale, material, segments=48, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(material)
    return obj


def build_body(material):
    field = bpy.data.metaballs.new("Tutor body sculpt")
    field.resolution = 0.035
    field.render_resolution = 0.025
    field.threshold = 0.68
    body = bpy.data.objects.new("Tutor body sculpt", field)
    bpy.context.collection.objects.link(body)

    head = field.elements.new()
    head.type = "ELLIPSOID"
    head.radius = 1.0
    head.size_x = 1.0
    head.size_y = 0.83
    head.size_z = 1.04

    for side in (-1, 1):
        flipper = field.elements.new()
        flipper.type = "ELLIPSOID"
        flipper.radius = 0.46
        flipper.size_x = 0.72
        flipper.size_y = 0.78
        flipper.size_z = 0.68
        flipper.co = (side * 0.76, -0.015, -0.15)

    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.convert(target="MESH")
    body = bpy.context.object
    body.name = "TutorBody"
    body.data.materials.append(material)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    modifier = body.modifiers.new("Soft polished surface", "SUBSURF")
    modifier.levels = 1
    modifier.render_levels = 1
    return body


def build_scene(args):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    shell = make_material("TutorShell", (0.92, 0.96, 1.0), roughness=0.52)
    eye_material = make_material("EyePearl", (1.0, 0.985, 0.94), roughness=0.34, emission=0.08)
    accent = make_material("TutorAccent", (0.72, 0.92, 0.96), roughness=0.48)

    body = build_body(shell)
    body["description"] = "Single smooth head-and-flippers mesh; spin reveals a continuous back."

    for name, x in (("EyeLeft", -0.205), ("EyeRight", 0.205)):
        eye = add_uv_sphere(name, (x, -0.38, 0.245), (0.095, 0.062, 0.165), eye_material)
        eye["blink"] = True

    bpy.ops.mesh.primitive_cone_add(
        vertices=32,
        radius1=0.08,
        radius2=0.004,
        depth=0.20,
        location=(-0.12, -0.20, 0.57),
    )
    cowlick = bpy.context.object
    cowlick.name = "AriCowlick"
    cowlick.rotation_euler[1] = math.radians(-32)
    bpy.ops.object.shade_smooth()
    cowlick.data.materials.append(accent)
    cowlick.hide_render = True
    cowlick["tutor"] = "Ari"

    curl = add_uv_sphere("IraCurl", (0.49, -0.26, 0.20), (0.11, 0.10, 0.11), accent)
    curl.hide_render = True
    curl["tutor"] = "Ira"

    if args.preview:
        bpy.ops.object.camera_add(location=(0, -4.9, 0.18))
        camera = bpy.context.object
        camera.name = "PreviewCamera"
        camera.rotation_euler = (Vector((0, 0, 0.04)) - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 3.55
        bpy.context.scene.camera = camera

        for name, location, power, size, color in (
            ("Key softbox", (-3.4, -4.0, 4.5), 440, 4.0, (0.80, 0.92, 1.0)),
            ("Front fill", (3.8, -3.0, 1.6), 230, 3.5, (1.0, 0.84, 0.94)),
            ("Rim light", (0.8, 2.4, 3.5), 360, 3.0, (0.48, 0.90, 1.0)),
        ):
            bpy.ops.object.light_add(type="AREA", location=location)
            light = bpy.context.object
            light.name = name
            light.data.energy = power
            light.data.shape = "DISK"
            light.data.size = size
            light.data.color = color
            light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()

        scene = bpy.context.scene
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x = 720
        scene.render.resolution_y = 720
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.film_transparent = True
        scene.world.color = (0.12, 0.12, 0.12)
        scene.view_settings.view_transform = "AgX"
        scene.camera.data.lens = 55
        scene.render.filepath = os.path.abspath(args.preview)
        bpy.ops.render.render(write_still=True)

        for obj in list(bpy.context.scene.objects):
            if obj.type in {"CAMERA", "LIGHT"}:
                bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(args.output),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


if __name__ == "__main__":
    build_scene(parse_args())
