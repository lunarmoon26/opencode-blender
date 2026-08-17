---
name: polyhaven-studio-setup
description: Set up Blender product lighting with a Poly Haven HDRI and optional textured ground. Use when a user asks for a studio setup, HDRI lighting, product photography, or a showroom scene.
---

# Poly Haven Studio Setup

Query the current world first and obtain approval before replacing its
environment. Then use `polyhaven` to search and apply an HDRI, followed by an
optional Poly Haven texture on a new ground plane. Default to a `1k` HDRI for
previews and `2k` for final renders. Confirm higher resolutions before
downloading.

After applying the HDRI, set world strength and the environment rotation through
a focused `blender` call:

```python
import bpy
import math

rotation_degrees = 0.0  # replace with the approved rotation
world = bpy.context.scene.world
background = world.node_tree.nodes.get("Background") if world and world.use_nodes else None
environment = world.node_tree.nodes.get("OpenCode Poly Haven HDRI") if world and world.use_nodes else None
if background:
    background.inputs["Strength"].default_value = 1.0
if environment:
    environment.texture_mapping.rotation[2] = math.radians(rotation_degrees)
result = {"world": world.name if world else None, "strength": 1.0, "rotation_degrees": rotation_degrees}
```

Do not alter the user's existing world, ground, or camera without confirmation.
Attribute the HDRI and textures to Poly Haven.
