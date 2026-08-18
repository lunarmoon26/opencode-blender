import { expect, test } from "bun:test"
import { buildViewerHtml } from "../plugin/threejs"

test("creates a responsive viewer with escaped configuration", () => {
  const html = buildViewerHtml({
    title: "Product <Preview>",
    modelSource: "./product.glb?label=</script>",
    background: "#123456",
    autoRotate: false,
  })

  expect(html).toContain("Product &lt;Preview&gt;")
  expect(html).toContain("three@0.180.0")
  expect(html).toContain("OrbitControls")
  expect(html).toContain("GLTFLoader")
  expect(html).toContain('background: "#123456"')
  expect(html).toContain("aria-pressed=\"false\"")
  expect(html).not.toContain("./product.glb?label=</script>")
})
