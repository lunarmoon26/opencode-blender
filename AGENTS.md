# OpenCode Blender

## Structure

- `plugin/blender-mcp.ts` is the runtime entrypoint. It communicates directly
  with Blender's NUL-delimited TCP bridge at `127.0.0.1:9876`.
- `BLENDER_HOST` and `BLENDER_PORT` optionally override the bridge address at
  plugin startup. Use only a trusted bridge; the port must be 1 through 65535.
- The bridge accepts only `execute` requests. It runs the supplied Python in
  Blender and requires a JSON-serializable dictionary assigned to `result`.
- The plugin exposes a native `blender` tool with a `code` argument and a
  `polyhaven` tool for first-party Poly Haven search, download, import, HDRI,
  PBR material, studio, scene-building, and comparison-render workflows. It
  also exposes `threejs_export` for selected-object GLB exports and standalone
  Three.js viewer generation, plus read-only `blender_status`,
  `blender_scene_info`, and `blender_object_info` tools.
- `skills/*/SKILL.md` contains adapted Blender workflow skills. They invoke
  the native `blender` tool and must preserve its `result` contract.

## Setup and verification

- Use Bun: `bun install`; run `bun test` for focused offline coverage.
- Blender must be running with its MCP extension enabled. Smoke-test the bridge:

  ```bash
  bun -e 'import plugin from "./plugin/blender-mcp.ts"; const hooks = await plugin({}); const result = await hooks.tool.blender.execute({ code: "import bpy\nresult = {\"version\": bpy.app.version_string}" }, { metadata() {} }); console.log(result.title)'
  ```

- Register `file:///absolute/path/to/opencode-blender/plugin/blender-mcp.ts`
  in OpenCode's global `plugin` configuration, then restart OpenCode.

## Blender workflow

- Begin with a focused scene query before any mutation.
- Every snippet must assign JSON-serializable data to `result`.
- Do not delete, reset, save over, or render scene content unless the user
  explicitly asks.
