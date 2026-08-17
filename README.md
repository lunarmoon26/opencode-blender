# OpenCode Blender

Native OpenCode plugin and focused skill for Blender's local MCP extension.

## Generation environment

- Blender 5.2.0 LTS
- Blender MCP TCP bridge at `127.0.0.1:9876`

The Blender extension exposes a NUL-delimited TCP protocol rather than a
standard HTTP MCP endpoint. This plugin adapts its `execute` operation into an
OpenCode-native `blender` tool. It also provides a `polyhaven` tool for
first-party asset search, download, import, HDRI, and PBR material workflows.

## Install Blender's MCP bridge

This plugin requires Blender 5.1 or later and the official [Blender Lab MCP
Server](https://www.blender.org/lab/mcp-server/) extension.

1. Download the extension from the [official release
   page](https://projects.blender.org/lab/blender_mcp/releases) or drag its
   `.zip` package into Blender. If you download it, use **Install from Disk**
   in Blender's Extensions preferences.
2. Enable the extension, open its preferences, and click **Start MCP Bridge
   Server**. It listens on `127.0.0.1:9876` by default; this plugin uses that
   bridge directly.
3. Keep Blender running while using the OpenCode `blender` tool.

Blender's bridge executes generated Python without sandboxing. Use it only
with a trusted model and Blender file; do not expose port 9876 beyond your
local machine.

## Install

The native plugin and skill install separately. The Skills CLI manages only
the `SKILL.md` file; it does not install OpenCode plugins.

### 1. Install the native plugin from this checkout

```bash
repo_dir=/absolute/path/to/opencode-blender
cd "$repo_dir"
bun install --frozen-lockfile
```

Register the absolute file URL in `~/.config/opencode/opencode.jsonc`. Merge
this entry with any existing `plugin` array; do not replace other plugins:

```jsonc
{
  "plugin": [
    "file:///absolute/path/to/opencode-blender/plugin/blender-mcp.ts"
  ]
}
```

### 2. Install the skill

Use the [Vercel Skills CLI](https://github.com/vercel-labs/skills) to manage
the skills globally for OpenCode:

```bash
bunx skills add "$repo_dir" --global --agent opencode \
  --skill '*' --yes --full-depth
```

Restart OpenCode after changing its plugin configuration or skills.

## Use

The `blender` tool accepts a focused Python snippet in `code`. The bridge
requires every snippet to assign a JSON-serializable dictionary to `result`:

```python
import bpy
result = {
  "version": bpy.app.version_string,
  "objects": [obj.name for obj in bpy.context.scene.objects],
}
```

Inspect scene state before mutations. Do not delete, reset, save, or render
unless explicitly requested.

## Included skills

Adapted from the local `blender-skills` workflows:

- `image-to-3d`, `multi-image-to-3d`
- `turntable`, `slow-zoom`, `dolly-rotate`, `crane-shot`
- `dynamic-full-loop`, `perfect-loop`
- `polyhaven-scene-builder`, `polyhaven-texture-apply`,
  `polyhaven-hdri-showcase`, `polyhaven-material-swap`,
  `polyhaven-studio-setup`
- `blender-product-polish`, `blender-threejs-export`, `blender-toolkit`

The image-to-3D skills require `MESHY_API_KEY`. The animation skills require
`ffmpeg` when encoding the rendered PNG sequence into a video.

The `polyhaven` tool uses the public [Poly Haven API](https://polyhaven.com/our-api)
with its required unique User-Agent and reports Poly Haven as every asset's
source. Poly Haven assets are CC0; the live API requires clear attribution.

## License

Licensed under [MIT](LICENSE).
