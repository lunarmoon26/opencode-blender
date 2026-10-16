import { expect, test, mock } from "bun:test"
import net from "node:net"
import plugin from "../plugin/blender-mcp"

async function registered(assert = mock(async (_request: unknown) => {})) {
  const tools = new Map<string, any>()
  await plugin.setup({
    tool: { transform: async (transform: any) => transform({ add: (tool: any) => tools.set(tool.name, tool) }) },
    permission: { assert },
  } as any)
  return { tools, assert }
}

function context(signal = new AbortController().signal) {
  return { signal, sessionID: "session-test", agent: "build", messageID: "message-test", id: "tool-test" }
}

test("V2 registers all six tools and JSON schemas", async () => {
  const { tools } = await registered()
  expect(plugin.id).toBe("blender-mcp")
  expect([...tools.keys()].sort()).toEqual([
    "blender", "blender_object_info", "blender_scene_info", "blender_status", "polyhaven", "threejs_export",
  ])
  expect(tools.get("blender").input.required).toEqual(["code"])
  expect(tools.get("blender_scene_info").input.properties.limit.default).toBe(200)
  expect(tools.get("blender_scene_info").input.required ?? []).toEqual([])
  expect(tools.get("polyhaven").input.required).toEqual(["action"])
  expect(tools.get("threejs_export").input.properties.auto_rotate.default).toBe(true)
})

test("denied writes never reach Python, downloads or filesystem helpers", async () => {
  const deny = mock(async (_request: unknown) => { throw Error("Permission denied") })
  const { tools } = await registered(deny)
  for (const [name, input] of [
    ["blender", { code: "result = {}" }],
    ["polyhaven", { action: "apply_hdri", asset: "test" }],
    ["polyhaven", { action: "unknown" }],
    ["threejs_export", { output: "/not-created" }],
  ] as const) {
    await expect(tools.get(name).execute(input, context())).rejects.toThrow("Permission denied")
  }
  expect(deny).toHaveBeenCalledTimes(4)
  expect(deny.mock.calls[0][0]).toMatchObject({ action: "blender.write", sessionID: "session-test", resources: ["blender"] })
})

test("V2 validates inputs before permission and checks cancellation", async () => {
  const { tools, assert } = await registered()
  await expect(tools.get("blender").execute({ code: 12 }, context())).rejects.toThrow()
  await expect(tools.get("blender_status").execute({ code: "unexpected" }, context())).rejects.toThrow()
  const controller = new AbortController()
  controller.abort()
  await expect(tools.get("blender_status").execute({}, context(controller.signal))).rejects.toThrow()
  expect(assert).not.toHaveBeenCalled()
  const second = new AbortController()
  const { tools: afterApproval } = await registered(mock(async () => { second.abort() }))
  await expect(afterApproval.get("blender").execute({ code: "result = {}" }, context(second.signal))).rejects.toThrow()
})

test("Poly Haven search stays read-only and returns native error content", async () => {
  const { tools, assert } = await registered()
  const result = await tools.get("polyhaven").execute({ action: "search", asset_type: "invalid" }, context())
  expect(result.content).toContain("asset_type must be")
  expect(assert).not.toHaveBeenCalled()
})

test("V2 read-only tools return native content and apply omitted defaults", async () => {
  // A child process isolates bridge environment settings from the other tests.
  const requests: string[] = []
  const server = net.createServer(socket => {
    let buffer = ""
    socket.on("data", chunk => {
      buffer += chunk.toString()
      if (!buffer.includes("\0")) return
      requests.push(JSON.parse(buffer.split("\0")[0]).code)
      socket.end(JSON.stringify({ status: "ok", result: { inspected: true } }) + "\0")
    })
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address() as net.AddressInfo
    const code = `
      import plugin from "./plugin/blender-mcp.ts";
      const tools = new Map();
      let approvals = 0;
      await plugin.setup({tool:{transform:async f=>f({add:t=>tools.set(t.name,t)})},permission:{assert:async()=>{approvals++}}});
      const context = {signal:new AbortController().signal,sessionID:"session-test",agent:"build",messageID:"message-test",id:"tool-test"};
      for (const name of ["blender_status","blender_scene_info","blender_object_info"]) {
        const result = await tools.get(name).execute(name === "blender_object_info" ? {object:"Cube"} : {},context);
        if (!JSON.parse(result.content).result.inspected || "output" in result) throw Error("Invalid V2 result");
      }
      if (approvals !== 0) throw Error("Read requested write approval");
      await tools.get("blender").execute({code:"result = {}"},context);
      if (approvals !== 1) throw Error("Missing write approval");
    `
    const child = Bun.spawn([process.execPath, "-e", code], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, BLENDER_HOST: "127.0.0.1", BLENDER_PORT: String(address.port) },
      stdout: "pipe", stderr: "pipe",
    })
    const error = await new Response(child.stderr).text()
    expect(await child.exited, error).toBe(0)
    expect(requests).toHaveLength(4)
    expect(requests[1]).toContain("limit = 200")
    expect(requests[2]).toContain('bpy.data.objects.get("Cube")')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
