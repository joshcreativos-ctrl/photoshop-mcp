// Suite de humo: crea un documento de prueba, ejercita las operaciones y lo cierra sin guardar. Uso: node test/suite.mjs [filtro]
import { op, stop } from "../ps-client.mjs";
const only = process.argv[2];
const results = [];
async function step(name, opName, args, check) {
  if (only && !name.includes(only)) return null;
  const t = Date.now();
  try {
    const r = await op(opName, args);
    if (check) check(r);
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`✔ ${name} (${Date.now() - t} ms)`);
    return r;
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`✘ ${name}: ${e.message}`);
    return null;
  }
}
const assert = (c, m) => { if (!c) throw new Error("assert: " + m); };

const doc = await step("nuevo documento", "newDocument", { name: "VZ suite", width: 1200, height: 1200, background: "#101510" }, (r) => assert(r.width === 1200, "ancho"));
if (doc) {
  await step("forma + degradado", "addShape", { shape: "rectangle", x: 0, y: 0, width: 1200, height: 1200, fill: { type: "gradient", stops: [{ color: "#0B3D1E", pos: 0 }, { color: "#050805", pos: 100 }], angle: 45 }, name: "Fondo degradado" });
  await step("texto", "addText", { text: "Hola mundo", x: 600, y: 200, anchor: "center", style: { font: "Montserrat-Black", size: 120, color: "#FFFFFF" }, name: "T1" });
  await step("estilo: bisel+satin+trazo", "layerStyle", { layer: "T1", effects: { bevelEmboss: { style: "inner", depth: 120, size: 6 }, satin: { opacity: 40 }, stroke: { size: 4, color: "#3FB950", position: "outside" }, innerGlow: { color: "#FFFFFF", opacity: 30, size: 20 }, gradientOverlay: { stops: [{ color: "#FFFFFF", pos: 0 }, { color: "#9BE8AA", pos: 100 }], angle: 90 } } }, (r) => assert(r.effects.stroke, "trazo no leído"));
  await step("ajuste: curvas", "addAdjustment", { type: "curves", name: "Curvas", params: { points: [[0, 0], [64, 50], [192, 210], [255, 255]] } });
  await step("ajuste: tono/saturación", "addAdjustment", { type: "hueSaturation", params: { hue: 10, saturation: -20, lightness: 0 }, name: "HSL" });
  await step("ajuste: niveles", "addAdjustment", { type: "levels", params: { inBlack: 10, inWhite: 240, gamma: 1.1 }, name: "Niveles" });
  await step("ajuste: color balance", "addAdjustment", { type: "colorBalance", params: { shadows: [0, 10, -5], highlights: [5, 0, 0] }, name: "CB" });
  await step("ajuste: mapa de degradado", "addAdjustment", { type: "gradientMap", params: { stops: [{ color: "#000000", pos: 0 }, { color: "#3FB950", pos: 100 }] }, name: "Mapa", blend: "softLight", opacity: 40 });
  await step("ajuste: B/N", "addAdjustment", { type: "blackAndWhite", name: "BN", params: {} });
  await step("ajuste: foto filtro", "addAdjustment", { type: "photoFilter", name: "Filtro", params: { color: "#3FB950", density: 20 } });
  await step("ajuste: vibrance", "addAdjustment", { type: "vibrance", name: "Vib", params: { vibrance: 20, saturation: 5 } });
  await step("ajuste: brillo/contraste", "addAdjustment", { type: "brightnessContrast", name: "BC", params: { brightness: 10, contrast: 15 } });
  await step("ajuste: exposición", "addAdjustment", { type: "exposure", name: "Exp", params: { exposure: 0.3 } });
  await step("ajuste: selective color", "addAdjustment", { type: "selectiveColor", name: "SC", params: { colors: { reds: { cyan: -10, yellow: 10 } } } });
  await step("capa vacía + relleno + ruido", "createLayer", { kind: "pixel", name: "Grano", fillColor: "#808080", blend: "overlay", opacity: 50 });
  await step("filtro: ruido (grano)", "filter", { layer: "Grano", filter: "addNoise", params: { amount: 12 } });
  await step("filtro: desenfoque gaussiano", "filter", { layer: "Grano", filter: "gaussianBlur", params: { radius: 1 } });
  await step("máscara de degradado", "mask", { layer: "Grano", type: "gradient", direction: "up" });
  await step("máscara rectangular redondeada", "mask", { layer: "Fondo degradado", type: "rect", rect: { x: 50, y: 50, width: 1100, height: 1100 }, radius: 80 });
  await step("Mezclar si", "blendIf", { layer: "Grano", this: [0, 20, 235, 255], under: [0, 0, 255, 255] });
  await step("grupo", "group", { layers: ["T1", "Curvas"], name: "Grupo A" });
  await step("capas (árbol)", "layers", {}, (r) => assert(r.layers.length > 3, "árbol vacío"));
  await step("info de capa", "layerInfo", { layer: "T1" }, (r) => assert(r.textInfo, "sin textInfo"));
  await step("alinear", "align", { layers: ["T1"], h: "center", v: "top" });
  await step("recursos", "resources", {}, (r) => assert(r.fonts.length >= 1, "sin fuentes"));
  await step("selección + relleno", "selection", { type: "rect", rect: { x: 100, y: 900, width: 300, height: 200 }, feather: 10, then: { deselect: true } });
  const TMP = (await import("node:os")).tmpdir().split("\\").join("/") + "/vz_suite";
  await step("exportar imagen de prueba", "exportDoc", { folder: TMP, name: "ref", format: "png" });
  const REF = TMP + "/ref.png";
  await step("colocar imagen (cover + marco redondeado)", "placeImage", { path: REF, box: { x: 100, y: 500, width: 500, height: 600 }, fit: "cover", radius: 60, name: "Imagen" }, (r) => assert(r.kind === "smart-object", "no es objeto inteligente: " + r.kind));
  await step("colocar imagen vinculada (contain)", "placeImage", { path: REF, linked: true, box: { x: 650, y: 500, width: 450, height: 300 }, fit: "contain", name: "Vinculada" });
  await step("objeto inteligente: incrustar", "smartObject", { layer: "Vinculada", action: "embed" });
  await step("máscara elíptica con difuminado", "mask", { layer: "Vinculada", type: "ellipse", rect: { x: 650, y: 500, width: 450, height: 300 }, feather: 20 });
  await step("selección subject (IA) - omitida si falla", "selection", { type: "all" });
  await step("relleno con degradado", "fill", { layer: "Grano", gradient: { stops: [{ color: "#000000", pos: 0 }, { color: "#FFFFFF", pos: 100 }] } });
  await step("duplicar capa", "duplicateLayer", { layer: "T1", name: "T1 copia", offset: { x: 0, y: 150 } });
  await step("distribuir", "align", { layers: ["T1", "T1 copia", "Imagen"], distribute: "v" });
  await step("capturar estilo", "captureStyle", { layer: "T1" }, (r) => assert(r.raw, "sin raw"));
  await step("action manager: leer", "actionManager", { get: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, (r) => assert(r.name, "sin nombre"));
  await step("script libre", "script", { code: "return {docs: app.documents.length, hasU: typeof U.rgb}" }, (r) => assert(r.hasU === "function", "U"));
  await step("ajustar documento: lienzo", "setDocument", { resizeCanvas: { width: 1200, height: 1400, anchor: "top" } });
  await step("exportar por cortes", "exportDoc", { folder: TMP + "/export", name: "suite", format: "png", mode: "slices", slices: [{ name: "a", x: 0, y: 0, width: 600, height: 700 }, { name: "b", x: 600, y: 0, width: 600, height: 700 }] }, (r) => assert(r.files.length === 2, "cortes"));
  await step("historial", "history", { action: "list" });
  await step("vista previa", "preview", { maxSize: 900 }, (r) => console.log("   →", r.path));
  await step("cerrar", "closeDocument", { doc: "VZ suite", save: false });
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} pasos correctos`);
stop();
process.exit(results.every((r) => r.ok) ? 0 : 1);
