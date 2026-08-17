---
name: polyhaven-scene-builder
description: Build a product scene with Poly Haven HDRIs, materials, ground planes, pedestals, and optional props. Use when a user asks for a product showcase, pedestal, showroom, or styled Blender scene.
---

# Poly Haven Scene Builder

Use the native `polyhaven` tool—never the legacy port-9876 scripts. Credit
Poly Haven in user-facing output. Begin by querying the product object and its
bounds with `blender`.

1. Use `polyhaven` with `action: "search"` to find an HDRI, texture, or model.
2. Apply the selected HDRI with `action: "apply_hdri"`.
3. For a ground plane or pedestal, create the mesh with `blender`, return its
   name in `result`, then use `polyhaven` with `action: "apply_texture"`.
4. Only add a prop when the user approves it; import it with
   `action: "import_model"`.

Do not remove existing scene objects. A typical ground-plane call is:

```python
import bpy

bpy.ops.mesh.primitive_plane_add(size=15, location=(0, 0, -0.01))
ground = bpy.context.active_object
ground.name = "OpenCode Ground"
result = {"ground": ground.name}
```

Create a pedestal only after confirming its dimensions against the product
bounds. Report every downloaded asset as sourced from Poly Haven.
