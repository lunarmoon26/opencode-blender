---
name: polyhaven-material-swap
description: Render finish variants of a Blender object with multiple Poly Haven textures. Use when a user asks for material comparisons, finish options, or texture variants.
---

# Poly Haven Material Swap

Query the target object and record its original first material slot before any
change. Search Poly Haven textures as needed, then apply each approved texture
with `polyhaven` `action: "apply_texture"`. Render one explicitly named output
per variant only after the user approves renderer, resolution, samples, and
output directory.

Record whether the object had a first slot and its material name:

```python
import bpy

obj = bpy.data.objects["<object-name>"]
had_slot = bool(obj.data.materials)
original_name = obj.data.materials[0].name if had_slot and obj.data.materials[0] else None
result = {"object": obj.name, "had_slot": had_slot, "original_material": original_name}
```

After the final render, restore the original material if the user requested a
comparison rather than a permanent change:

```python
import bpy

obj = bpy.data.objects["<object-name>"]
had_slot = <had-slot>
original = bpy.data.materials.get("<original-material-name>") if "<original-material-name>" else None
if had_slot and obj.data.materials:
    obj.data.materials[0] = original
elif not had_slot and obj.data.materials:
    obj.data.materials.pop(index=0)
result = {"object": obj.name, "restored": True}
```

Do not overwrite output files without explicit approval. Identify Poly Haven as
the source of every material variant.
