import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join, resolve, sep } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { tool } from "@opencode-ai/plugin"
import { executeBlenderCode } from "./bridge"

const apiBase = "https://api.polyhaven.com"
const userAgent = "opencode-blender/0.1"
const cacheRoot = join(homedir(), ".cache", "opencode-blender", "polyhaven")
const maxDownloadBytes = 128 * 1024 * 1024

type RecordValue = Record<string, unknown>
type Asset = {
  name?: string
  category?: string
  tags?: string[]
  type?: number
}
type FileEntry = {
  url: string
  size?: number
  md5?: string
  include?: Record<string, FileEntry>
}

let catalogPromise: Promise<Record<string, Asset>> | undefined

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFileEntry(value: unknown): value is FileEntry {
  return isRecord(value) && typeof value.url === "string"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function python(value: string | number | Record<string, string>) {
  return JSON.stringify(value)
}

function requireAssetId(value: string) {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Poly Haven asset IDs may contain only lowercase letters, numbers, and underscores")
  return value
}

function normalizeResolution(value: string) {
  if (!/^(1|2|4|8)k$/.test(value)) throw new Error("Resolution must be one of 1k, 2k, 4k, or 8k")
  return value
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { headers: { "User-Agent": userAgent } })
  if (!response.ok) throw new Error(`Poly Haven API returned HTTP ${response.status} for ${path}`)
  return response.json() as Promise<T>
}

function catalog() {
  catalogPromise ??= fetchJson<Record<string, Asset>>("/assets").catch((error) => {
    catalogPromise = undefined
    throw error
  })
  return catalogPromise
}

function resolutionKeys(branch: RecordValue, requested: string) {
  const requestedNumber = Number.parseInt(requested, 10)
  return Object.keys(branch)
    .filter((key) => /^(1|2|4|8)k$/.test(key))
    .sort((left, right) => Math.abs(Number.parseInt(left, 10) - requestedNumber) - Math.abs(Number.parseInt(right, 10) - requestedNumber))
}

function fileFor(files: RecordValue, mapName: string, requested: string, formats: string[]) {
  const map = files[mapName]
  if (!isRecord(map)) return undefined
  for (const resolution of resolutionKeys(map, requested)) {
    const variants = map[resolution]
    if (!isRecord(variants)) continue
    for (const format of formats) {
      const entry = variants[format]
      if (isFileEntry(entry)) return entry
    }
  }
  return undefined
}

function modelFor(files: RecordValue, requested: string) {
  const formats = files.gltf
  if (!isRecord(formats)) return undefined
  for (const resolution of resolutionKeys(formats, requested)) {
    const variants = formats[resolution]
    if (!isRecord(variants)) continue
    for (const entry of Object.values(variants)) {
      if (isFileEntry(entry) && /\.gltf(?:$|\?)/i.test(entry.url)) return entry
    }
  }
  return undefined
}

async function fileExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function responseBytes(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Poly Haven response has no readable body")

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return Buffer.concat(chunks)
      total += value.length
      if (total > maxDownloadBytes) throw new Error(`Poly Haven download exceeds ${maxDownloadBytes} bytes`)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function cachePath(root: string, requestedPath: string) {
  const target = resolve(root, requestedPath)
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("Poly Haven download path escapes its cache directory")
  return target
}

async function download(entry: FileEntry, root: string, requestedPath = basename(new URL(entry.url).pathname)) {
  const destination = cachePath(root, requestedPath)
  if (await fileExists(destination)) {
    const existing = await stat(destination)
    if ((!entry.size || existing.size === entry.size) && (!entry.md5 || createHash("md5").update(await readFile(destination)).digest("hex") === entry.md5)) {
      return destination
    }
    await unlink(destination)
  }

  if (entry.size && entry.size > maxDownloadBytes) {
    throw new Error(`Poly Haven download is ${entry.size} bytes; select a lower resolution or download it manually`)
  }

  const response = await fetch(entry.url, { headers: { "User-Agent": userAgent } })
  if (!response.ok) throw new Error(`Poly Haven download returned HTTP ${response.status}`)
  const length = Number(response.headers.get("content-length"))
  if (Number.isFinite(length) && length > maxDownloadBytes) {
    throw new Error(`Poly Haven download is ${length} bytes; select a lower resolution or download it manually`)
  }

  const bytes = await responseBytes(response)
  if (entry.size && bytes.length !== entry.size) throw new Error("Poly Haven download size does not match its metadata")
  if (entry.md5 && createHash("md5").update(bytes).digest("hex") !== entry.md5) {
    throw new Error("Poly Haven download checksum does not match its metadata")
  }
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.${randomUUID()}.partial`
  await writeFile(temporary, bytes)
  await rename(temporary, destination)
  return destination
}

async function downloadEntry(entry: FileEntry, root: string) {
  const primary = await download(entry, root)
  for (const [includedPath, included] of Object.entries(entry.include ?? {})) {
    await download(included, root, includedPath)
  }
  return primary
}

async function bridge(code: string) {
  const response = await executeBlenderCode(code)
  if (response.status !== "ok") throw new Error(response.message ?? "Blender rejected the Poly Haven operation")
  return response.result
}

async function filesFor(asset: string) {
  return fetchJson<RecordValue>(`/files/${asset}`)
}

async function applyHdri(asset: string, requestedResolution: string) {
  const files = await filesFor(asset)
  const entry = fileFor(files, "hdri", requestedResolution, ["hdr", "exr"])
  if (!entry) throw new Error(`No HDR or EXR file is available for '${asset}'`)

  const localPath = await downloadEntry(entry, join(cacheRoot, asset, requestedResolution))
  const result = await bridge(`
import bpy

image = bpy.data.images.load(${python(localPath)}, check_existing=True)
world = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.use_nodes = True
nodes = world.node_tree.nodes
links = world.node_tree.links
background = nodes.get("Background") or nodes.new("ShaderNodeBackground")
environment = nodes.get("OpenCode Poly Haven HDRI") or nodes.new("ShaderNodeTexEnvironment")
environment.name = "OpenCode Poly Haven HDRI"
environment.label = "Poly Haven: ${asset}"
environment.image = image
links.new(environment.outputs["Color"], background.inputs["Color"])
result = {"asset": ${python(asset)}, "image": image.name, "path": image.filepath, "source": "Poly Haven"}
`)
  return { ...asResult(result), source: "Poly Haven", cached_path: localPath }
}

async function applyTexture(asset: string, objectName: string, requestedResolution: string) {
  const files = await filesFor(asset)
  const requested = [
    ["Diffuse", ["jpg", "png"]],
    ["Rough", ["jpg", "png"]],
    ["nor_gl", ["jpg", "png"]],
    ["Metalness", ["jpg", "png"]],
    ["AO", ["jpg", "png"]],
  ] as const
  const paths: Record<string, string> = {}
  for (const [map, formats] of requested) {
    const entry = map === "Metalness"
      ? fileFor(files, "Metalness", requestedResolution, formats) ?? fileFor(files, "Metal", requestedResolution, formats)
      : fileFor(files, map, requestedResolution, formats)
    if (entry) paths[map] = await downloadEntry(entry, join(cacheRoot, asset, requestedResolution))
  }
  if (!paths.Diffuse) throw new Error(`No diffuse map is available for '${asset}'`)

  const materialName = `OpenCode Poly Haven ${asset} ${objectName}`
  const result = await bridge(`
import bpy

obj = bpy.data.objects.get(${python(objectName)})
if obj is None or not hasattr(obj.data, "materials"):
    raise RuntimeError("Object " + ${python(objectName)} + " does not support materials")

paths = ${python(paths)}
material = obj.data.materials[0] if obj.data.materials else None
if (
    material is None
    or material.get("opencode_polyhaven_asset") != ${python(asset)}
    or material.get("opencode_polyhaven_object") != obj.name
    or material.get("opencode_polyhaven_resolution") != ${python(requestedResolution)}
    or material.users > 1
):
    material = bpy.data.materials.new(${python(materialName)})
material["opencode_polyhaven_asset"] = ${python(asset)}
material["opencode_polyhaven_object"] = obj.name
material["opencode_polyhaven_resolution"] = ${python(requestedResolution)}
material.use_nodes = True
nodes = material.node_tree.nodes
links = material.node_tree.links
nodes.clear()
output = nodes.new("ShaderNodeOutputMaterial")
principled = nodes.new("ShaderNodeBsdfPrincipled")
links.new(principled.outputs["BSDF"], output.inputs["Surface"])
texture_coordinate = nodes.new("ShaderNodeTexCoord")
mapping = nodes.new("ShaderNodeMapping")
links.new(texture_coordinate.outputs["Generated"], mapping.inputs["Vector"])

def image_node(label, path, non_color=False):
    image = bpy.data.images.load(path, check_existing=True)
    if non_color:
        image.colorspace_settings.name = "Non-Color"
    node = nodes.new("ShaderNodeTexImage")
    node.label = label
    node.image = image
    links.new(mapping.outputs["Vector"], node.inputs["Vector"])
    return node

diffuse = image_node("Poly Haven Diffuse", paths["Diffuse"])
links.new(diffuse.outputs["Color"], principled.inputs["Base Color"])
if "Rough" in paths:
    roughness = image_node("Poly Haven Roughness", paths["Rough"], True)
    links.new(roughness.outputs["Color"], principled.inputs["Roughness"])
if "Metalness" in paths:
    metalness = image_node("Poly Haven Metalness", paths["Metalness"], True)
    links.new(metalness.outputs["Color"], principled.inputs["Metallic"])
if "nor_gl" in paths:
    normal_texture = image_node("Poly Haven Normal", paths["nor_gl"], True)
    normal = nodes.new("ShaderNodeNormalMap")
    links.new(normal_texture.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], principled.inputs["Normal"])

if obj.data.materials:
    obj.data.materials[0] = material
else:
    obj.data.materials.append(material)
result = {"asset": ${python(asset)}, "object": obj.name, "material": material.name, "maps": sorted(paths), "source": "Poly Haven"}
`)
  return { ...asResult(result), source: "Poly Haven", cached_maps: paths }
}

async function importModel(asset: string, requestedResolution: string) {
  const files = await filesFor(asset)
  const entry = modelFor(files, requestedResolution)
  if (!entry) throw new Error(`No glTF model is available for '${asset}'`)

  const root = join(cacheRoot, asset, requestedResolution)
  const localPath = await downloadEntry(entry, root)
  const result = await bridge(`
import bpy

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=${python(localPath)})
result = {"asset": ${python(asset)}, "imported": [obj.name for obj in bpy.data.objects if obj not in before], "source": "Poly Haven"}
`)
  return { ...asResult(result), source: "Poly Haven", cached_path: localPath }
}

function asResult(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { result: value }
}

async function search(query: string, assetType: string) {
  const typeByName: Record<string, number | undefined> = { all: undefined, hdri: 0, texture: 1, model: 2 }
  if (!(assetType in typeByName)) throw new Error("asset_type must be all, hdri, texture, or model")
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = Object.entries(await catalog())
    .filter(([, asset]) => typeByName[assetType] === undefined || asset.type === typeByName[assetType])
    .filter(([id, asset]) => {
      const text = [id, asset.name ?? "", asset.category ?? "", ...(asset.tags ?? [])].join(" ").toLowerCase()
      return terms.every((term) => text.includes(term))
    })
    .slice(0, 20)
    .map(([id, asset]) => ({ id, name: asset.name, category: asset.category, type: asset.type }))
  return { source: "Poly Haven", query, asset_type: assetType, matches }
}

export function polyhavenTool() {
  return tool({
    description:
      "Search and import CC0 Poly Haven assets through its public API. Actions: search, apply_hdri, apply_texture, or import_model. Downloads cache locally and reports Poly Haven as the source.",
    args: {
      action: tool.schema.string().describe("One of: search, apply_hdri, apply_texture, import_model."),
      asset: tool.schema.string().default("").describe("Poly Haven asset ID for non-search actions."),
      query: tool.schema.string().default("").describe("Search words used only by the search action."),
      asset_type: tool.schema.string().default("all").describe("Search filter: all, hdri, texture, or model."),
      object: tool.schema.string().default("").describe("Blender object name used by apply_texture."),
      resolution: tool.schema.string().default("2k").describe("Preferred asset resolution: 1k, 2k, 4k, or 8k."),
    },
    execute: async (args, context) => {
      try {
        context.metadata({ title: `Poly Haven: ${args.action}`, metadata: { action: args.action, asset: args.asset } })
        const resolution = normalizeResolution(args.resolution)
        let result: Record<string, unknown>
        if (args.action === "search") result = await search(args.query, args.asset_type)
        else if (args.action === "apply_hdri") result = await applyHdri(requireAssetId(args.asset), resolution)
        else if (args.action === "apply_texture") {
          if (!args.object) throw new Error("apply_texture requires an object name")
          result = await applyTexture(requireAssetId(args.asset), args.object, resolution)
        } else if (args.action === "import_model") result = await importModel(requireAssetId(args.asset), resolution)
        else throw new Error("Unknown Poly Haven action")
        return { title: `Poly Haven: ${args.action}`, output: JSON.stringify(result, null, 2) }
      } catch (error) {
        return { title: `Poly Haven: ${args.action}`, output: `Poly Haven call failed: ${errorMessage(error)}` }
      }
    },
  })
}
