import { tool, type Plugin } from "@opencode-ai/plugin"
import { blenderBridge, executeBlenderCode } from "./bridge"
import { polyhavenTool } from "./polyhaven"
import { threeJsExportTool } from "./threejs"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export default (async () => ({
  tool: {
    blender: tool({
      description:
        "Execute focused Python through Blender's local MCP bridge. The code must assign a JSON-serializable dictionary to result. Query scene state before mutating it; do not delete, reset, save, or render unless explicitly requested.",
      args: {
        code: tool.schema
          .string()
          .describe("Python executed in Blender. Assign a JSON-serializable dictionary to result."),
      },
      execute: async ({ code }, context) => {
        try {
          context.metadata({ title: "Blender: execute", metadata: blenderBridge })
          const response = await executeBlenderCode(code)
          return { title: "Blender: execute", output: JSON.stringify(response, null, 2) }
        } catch (error) {
          return { title: "Blender: execute", output: `Blender MCP call failed: ${errorMessage(error)}` }
        }
      },
    }),
    polyhaven: polyhavenTool(),
    threejs_export: threeJsExportTool(),
  },
})) satisfies Plugin
