import net from "node:net"
import { Buffer } from "node:buffer"
import { tool, type Plugin } from "@opencode-ai/plugin"

const host = "127.0.0.1"
const port = 9876
const timeoutMs = 15_000
const maxResponseBytes = 10 * 1024 * 1024

type BridgeResponse = {
  status?: string
  result?: unknown
  message?: string
  stdout?: string
  stderr?: string
}

function execute(code: string): Promise<BridgeResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    let responseBuffer = Buffer.alloc(0)
    let settled = false

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(error)
    }

    socket.setTimeout(timeoutMs)
    socket.once("connect", () => {
      socket.write(JSON.stringify({ type: "execute", code, strict_json: true }) + "\0")
    })
    socket.on("data", (chunk) => {
      if (responseBuffer.length + chunk.length > maxResponseBytes) {
        fail(new Error(`Blender MCP bridge response exceeds ${maxResponseBytes} bytes`))
        return
      }
      responseBuffer = Buffer.concat([responseBuffer, chunk])
      const delimiter = responseBuffer.indexOf(0)
      if (delimiter < 0 || settled) return

      try {
        const response = JSON.parse(responseBuffer.subarray(0, delimiter).toString("utf8")) as BridgeResponse
        settled = true
        socket.end()
        resolve(response)
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
    socket.once("timeout", () => fail(new Error(`Blender MCP bridge timed out after ${timeoutMs}ms`)))
    socket.once("error", fail)
    socket.once("close", () => {
      if (!settled) fail(new Error("Blender MCP bridge closed before returning a response"))
    })
  })
}

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
          context.metadata({ title: "Blender: execute", metadata: { host, port } })
          const response = await execute(code)
          return { title: "Blender: execute", output: JSON.stringify(response, null, 2) }
        } catch (error) {
          return { title: "Blender: execute", output: `Blender MCP call failed: ${errorMessage(error)}` }
        }
      },
    }),
  },
})) satisfies Plugin
