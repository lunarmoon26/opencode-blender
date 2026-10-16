import { Plugin } from "@opencode/plugin"
import { z } from "zod"
import legacy from "./legacy"

const readOnly = new Set(["blender_status", "blender_scene_info", "blender_object_info"])

export default Plugin.define({
  id: "blender-mcp",
  async setup(ctx) {
    const { tool: tools } = await legacy()
    await ctx.tool.transform((editor) => {
      for (const [name, definition] of Object.entries(tools)) {
        const schema = z.object(definition.args).strict()
        editor.add({
          name,
          description: definition.description,
          input: z.toJSONSchema(schema, { io: "input" }),
          async execute(input, context) {
            context.signal.throwIfAborted()
            const args = schema.parse(input)
            if (!readOnly.has(name) && !(name === "polyhaven" && "action" in args && args.action === "search")) {
              await ctx.permission.assert({
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.messageID, id: context.id },
                action: "blender.write",
                resources: [name],
                save: [name],
                metadata: { tool: name, arguments: args },
              })
              context.signal.throwIfAborted()
            }
            // Metadata is returned by V2 rather than delivered via V1's callback.
            const result = await definition.execute(args as never, { metadata() {} })
            return { title: result.title, content: result.output }
          },
        })
      }
    })
  },
})
