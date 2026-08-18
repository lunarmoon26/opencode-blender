import { expect, test } from "bun:test"
import plugin from "../plugin/blender-mcp"

test("fills omitted optional Poly Haven arguments before dispatch", async () => {
  const hooks = await plugin({})
  const result = await hooks.tool.polyhaven.execute({ action: "scene_builder", preset: "invalid" }, { metadata() {} })

  expect(result.output).toContain("Scene preset must be showroom, outdoor, minimal, or dramatic")
  expect(result.output).not.toContain("value.split")
})
