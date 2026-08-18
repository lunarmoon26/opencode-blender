import { expect, test } from "bun:test"
import net from "node:net"
import { executeBlenderCode, resolveBlenderBridge } from "../plugin/bridge"

async function bridgeServer() {
  let received = ""
  const server = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      received += chunk.toString("utf8")
      if (!received.includes("\0")) return
      socket.write('{"status":"ok",')
      socket.end('"result":{"answer":42}}\0')
    })
  })
  await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve()))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Could not determine test bridge port")
  return {
    port: address.port,
    request: () => JSON.parse(received.slice(0, received.indexOf("\0"))),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

test("resolves explicit bridge configuration", () => {
  expect(resolveBlenderBridge({ BLENDER_HOST: "bridge.example", BLENDER_PORT: "4321" })).toEqual({ host: "bridge.example", port: 4321 })
  expect(() => resolveBlenderBridge({ BLENDER_PORT: "0" })).toThrow("BLENDER_PORT")
  expect(() => resolveBlenderBridge({ BLENDER_PORT: "70000" })).toThrow("BLENDER_PORT")
})

test("sends NUL-delimited commands and accepts a fragmented response", async () => {
  const server = await bridgeServer()
  try {
    await expect(executeBlenderCode("result = {'answer': 42}", { host: "127.0.0.1", port: server.port })).resolves.toEqual({
      status: "ok",
      result: { answer: 42 },
    })
    expect(server.request()).toEqual({ type: "execute", code: "result = {'answer': 42}", strict_json: true })
  } finally {
    await server.close()
  }
})
