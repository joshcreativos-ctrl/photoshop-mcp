// Segunda suite: filtros, selecciones, edición de texto, máscaras, agrupar/combinar/rasterizar, ajustes restantes.
import { op, stop } from "../ps-client.mjs";
const results = [];
async function step(name, opName, args, check) {
  const t = Date.now();
  try {
    const r = await op(opName, args);
    if (check) check(r);
    results.push({ name, ok: true });
    console.log(`✔ ${name} (${Date.now() - t} ms)`);
    return r;
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`✘ ${name}: ${e.message.slice(0, 220)}`);
    return null;
  }
}
const assert = (c, m) => { if (!c) throw new Error("assert: " + m); };

await step("doc", "newDocument", { name: "VZ suite2", width: 1000, height: 1000, background: "#202020" });
await step("capa foto simulada", "createLayer", { kind: "pixel", name: "Foto", fillColor: "#8899AA" });
for (const [f, params] of [["motionBlur", { angle: 30, distance: 25 }], ["radialBlur", { amount: 10 }], ["unsharpMask", { amount: 80, radius: 2 }], ["highPass", { radius: 4 }], ["median", { radius: 2 }], ["sharpen", {}], ["dustAndScratches", { radius: 1 }], ["surfaceBlur", { radius: 5, threshold: 15 }], ["smartSharpen", { amount: 100, radius: 1 }], ["filmGrain", { grain: 8 }], ["diffuseGlow", { graininess: 6 }], ["cameraRaw", { contrast: 10, clarity: 15, vignette: -10 }]])
  await step("filtro " + f, "filter", { layer: "Foto", filter: f, params });
await step("filtro inteligente (toSmart)", "filter", { layer: "Foto", filter: "gaussianBlur", params: { radius: 3 }, toSmart: true }, (r) => assert(r.kind === "smart-object", "tipo " + r.kind));
await step("ajuste invert", "addAdjustment", { type: "invert", name: "Inv" });
await step("ajuste threshold", "addAdjustment", { type: "threshold", params: { level: 100 }, name: "Umbral" });
await step("ajuste posterize", "addAdjustment", { type: "posterize", params: { levels: 5 }, name: "Poster" });
await step("ajuste curvas por canal", "addAdjustment", { type: "curves", params: { channels: { red: [[0, 0], [128, 140], [255, 255]], blue: [[0, 10], [255, 245]] } }, name: "CurvasRGB", clip: true });
await step("selección elipse", "selection", { type: "ellipse", rect: { x: 100, y: 100, width: 300, height: 300 }, feather: 5 });
await step("selección añadir rect", "selection", { type: "rect", mode: "add", rect: { x: 300, y: 300, width: 200, height: 200 } });
await step("selección polígono", "selection", { type: "polygon", points: [[600, 600], [800, 650], [700, 800]] });
await step("selección de capa", "selection", { type: "layer", layer: "Foto", grow: 5 });
await step("selección none", "selection", { type: "none" });
await step("texto", "addText", { text: "Hola", x: 500, y: 500, anchor: "center", style: { font: "Montserrat-Black", size: 100, color: "#FFFFFF" }, name: "Txt" });
await step("editar texto (contenido+estilo)", "editText", { layer: "Txt", text: "Chao mundo", style: { size: 80, color: "#FFCC00", tracking: 200 } }, (r) => assert(r.bounds[2] - r.bounds[0] > 300, "ancho"));
await step("editar texto (runs)", "editText", { layer: "Txt", runs: [{ text: "AB", style: { font: "Montserrat-Light" } }, { text: "CD", style: { font: "Montserrat-Black", color: "#FF0000" } }] });
await step("leer texto", "textInfo", { layer: "Txt" }, (r) => assert(r.runs.length === 2 && r.runs[1].color === "#FF0000", "runs " + JSON.stringify(r.runs && r.runs.map((x) => x.color))));
await step("párrafo con caja", "addText", { text: "Texto de párrafo largo que se ajusta dentro de una caja de ancho fijo para probar el salto de línea.", box: { width: 400, height: 200 }, x: 50, y: 700, align: "justify", style: { font: "Montserrat-Regular", size: 24, color: "#FFFFFF", leading: 32 }, name: "Parrafo" }, (r) => assert(r.size[0] <= 420, "ancho caja"));
await step("máscara hideAll", "mask", { layer: "Txt", type: "hideAll" });
await step("máscara borrar", "mask", { layer: "Txt", type: "delete" });
await step("máscara de recorte", "mask", { layer: "Txt", type: "clip" });
await step("agrupar", "group", { layers: ["Txt", "Parrafo"], name: "Textos", blend: "normal" });
await step("desagrupar", "ungroup", { layer: "Textos" });
await step("rasterizar texto", "rasterize", { layer: "Txt", what: "text" }, (r) => assert(r.kind === "pixel", "kind " + r.kind));
await step("combinar", "mergeLayers", { layers: ["Txt", "Parrafo"], name: "Fusion" });
await step("sello visible", "mergeLayers", { mode: "stamp", name: "Sello" });
await step("forma línea y polígono", "addShape", { shape: "line", x: 50, y: 50, x2: 400, y2: 120, thickness: 6, fill: "#FF00AA", name: "Linea" });
await step("forma path", "addShape", { shape: "path", points: [[500, 50], [700, 80], [650, 200]], fill: "#00FFAA", name: "Triangulo" });
await step("forma sin relleno solo trazo", "addShape", { shape: "ellipse", x: 700, y: 300, width: 200, height: 200, fill: null, stroke: { width: 8, color: "#FFFFFF", dash: [4, 2] }, name: "Aro" });
await step("document info", "docInfo", {}, (r) => assert(r.layerCount > 5, "capas"));
await step("historial: deshacer", "history", { action: "undo", steps: 1 });
await step("mesa de trabajo A", "createArtboard", { name: "Pieza A", x: 0, y: 0, width: 400, height: 500, background: "#112233" }, (r) => assert(r.size[0] === 400 && r.size[1] === 500, "tamaño " + r.size));
await step("mesa de trabajo B", "createArtboard", { name: "Pieza B", x: 450, y: 0, width: 400, height: 500 });
await step("artboards en docInfo", "docInfo", {}, (r) => assert(r.artboards.length === 2, "artboards " + r.artboards.length));
await step("exportar artboards", "exportDoc", { folder: (await import("node:os")).tmpdir().split("\\").join("/") + "/vz_export2", name: "ab", format: "png", mode: "artboards" }, (r) => assert(r.files.length === 2, "archivos"));
await step("cerrar", "closeDocument", { doc: "VZ suite2", save: false });
console.log(`\n${results.filter((r) => r.ok).length}/${results.length}`);
stop();
process.exit(results.every((r) => r.ok) ? 0 : 1);
