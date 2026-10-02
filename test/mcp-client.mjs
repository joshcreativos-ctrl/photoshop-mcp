// Prueba por el protocolo MCP real (stdio): lista herramientas y ejecuta un flujo completo contra Photoshop.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(here, "..", "server.mjs")] });
const client = new Client({ name: "prueba", version: "1.0.0" });
await client.connect(transport);

const tools = (await client.listTools()).tools;
console.log(`${tools.length} herramientas: ${tools.map((t) => t.name).join(", ")}\n`);

let fails = 0;
async function call(name, args) {
  const t = Date.now();
  const r = await client.callTool({ name, arguments: args });
  const txt = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const img = r.content.find((c) => c.type === "image");
  console.log(`${r.isError ? "✘" : "✔"} ${name} (${Date.now() - t} ms)${img ? ` [imagen ${img.mimeType} ${Math.round(img.data.length / 1365)} KB]` : ""}${r.isError ? "\n   " + txt.slice(0, 400) : ""}`);
  if (r.isError) fails++;
  return { r, txt, img };
}

await call("ps_status", {});
await call("ps_new_document", { name: "MCP prueba", width: 1080, height: 1350, background: "#0A0F0B" });
await call("ps_add_shape", { shape: "roundRect", x: 90, y: 400, width: 900, height: 700, radius: 80, fill: { type: "gradient", stops: [{ color: "#0B3D1E", pos: 0 }, { color: "#050805", pos: 100 }], angle: 90 }, stroke: { width: 3, color: "#3FB950", align: "inside", opacity: 60 }, name: "Panel" });
await call("ps_add_text", { runs: [{ text: "EL COMBUSTIBLE", style: { font: "Montserrat-Light", size: 44, tracking: 440, color: "#FFFFFF" } }, { text: "\nPARA RESPLANDECER", style: { font: "Montserrat-Black", size: 44, tracking: 440, color: "#FFFFFF" } }], x: 540, y: 200, anchor: "center", align: "center", name: "Titulo", effects: { dropShadow: [{ color: "#211915", opacity: 77, angle: 90, distance: 1, size: 9 }, { color: "#211915", opacity: 35, angle: 90, distance: 1, size: 57 }], outerGlow: { color: "#419946", opacity: 30, size: 150, noise: 26, blend: "screen" } } });
await call("ps_add_adjustment", { type: "hueSaturation", params: { saturation: -10 }, name: "Tono", clip: false });
const li = await call("ps_layer_info", { layer: "Titulo" });
await call("ps_layers", {});
await call("ps_resources", {});
await call("ps_batch", { name: "Luz", steps: [{ tool: "add_shape", args: { shape: "ellipse", x: 240, y: 700, width: 600, height: 300, fill: "#7CFF8A", name: "Luz verde", blend: "screen", opacity: 60 } }, { tool: "filter", args: { layer: "Luz verde", filter: "gaussianBlur", params: { radius: 80 } } }] });
const pv = await call("ps_preview", { maxSize: 900 });
if (pv.img) { const fs = await import("node:fs"); const out = path.join(here, "..", "test", "ultima-vista.jpg"); fs.writeFileSync(out, Buffer.from(pv.img.data, "base64")); console.log("   vista guardada en", out); }
await call("ps_history", { action: "list" });
await call("ps_close", { doc: "MCP prueba", save: false });
console.log(fails ? `\n${fails} fallos` : "\nTodo bien");
await client.close();
process.exit(fails ? 1 : 0);
