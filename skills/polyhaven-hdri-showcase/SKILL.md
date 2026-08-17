---
name: polyhaven-hdri-showcase
description: Compare a Blender product under several Poly Haven HDRIs. Use when a user asks to test environments, compare lighting, or create an HDRI render comparison.
---

# Poly Haven HDRI Showcase

Use `polyhaven` `action: "search"` with `asset_type: "hdri"` to choose a small
set of environments. Before changing the world, query and retain the current
world image path or confirm that restoring the original environment is not
needed.

For each approved HDRI:

1. Apply it using `polyhaven` `action: "apply_hdri"`.
2. Set a unique, approved PNG output path with `blender`.
3. Render only after confirming engine, resolution, samples, and overwrite
   behavior.

```python
import bpy

scene = bpy.context.scene
scene.render.filepath = "/absolute/output/path/environment.png"
bpy.ops.render.render(write_still=True)
result = {"render": scene.render.filepath}
```

Restore the saved environment when requested. Attribute all selected HDRIs to
Poly Haven.
