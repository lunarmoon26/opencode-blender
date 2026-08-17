# OpenCode Blender

## Structure

- `plugin/blender-mcp.ts` is the runtime entrypoint. It communicates directly
  with Blender's NUL-delimited TCP bridge at `127.0.0.1:9876`.
- The bridge accepts only `execute` requests. It runs the supplied Python in
  Blender and requires a JSON-serializable dictionary assigned to `result`.
- The plugin exposes one native `blender` tool with a `code` argument.
- `skills/*/SKILL.md` contains adapted Blender workflow skills. They invoke
  the native `blender` tool and must preserve its `result` contract.

## Setup and verification

- Use Bun: `bun install`. This repository has no package scripts or test suite.
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
