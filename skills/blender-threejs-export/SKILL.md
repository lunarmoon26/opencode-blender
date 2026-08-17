---
name: blender-threejs-export
description: Export approved Blender meshes to GLB and create a Three.js viewer. Use when a user asks to export a model for the web, build a Three.js preview, or produce an interactive GLB viewer.
---

# Blender Three.js Export

Confirm the output directory, filename, selected objects, whether existing
files may be replaced, and whether the viewer may use the Three.js CDN. Export
only after those decisions are explicit.

```python
import bpy
import os

path = "/absolute/output/path/model.glb"
if os.path.exists(path):
    raise RuntimeError("Refusing to overwrite existing GLB without approval")
selected = list(bpy.context.selected_objects)
if not selected:
    raise RuntimeError("Select one or more objects before exporting")
bpy.ops.object.select_all(action="DESELECT")
for obj in selected:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True)
result = {"glb": path}
```

Then create a standalone HTML viewer that imports Three.js, `GLTFLoader`, and
`OrbitControls` from a pinned CDN release. Configure responsive canvas sizing,
orbit controls, optional auto-rotation, a neutral environment, and a camera
framed from the loaded model bounds. Do not embed the GLB unless the user asks.
