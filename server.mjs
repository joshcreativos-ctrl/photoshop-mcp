#!/usr/bin/env node
// Free Photoshop MCP by Videazo Super Intelligence · servidor MCP para Adobe Photoshop (Windows).
// Claude → (MCP/stdio) → este servidor → (COM) → Photoshop. Sin instalar nada dentro de Photoshop.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { op, callPS, info, reloadLib } from "./ps-client.mjs";
import * as styles from "./styles.mjs";

const server = new McpServer(
  { name: "photoshop", title: "Free Photoshop MCP by Videazo Super Intelligence", version: "0.1.0" },
  {
    instructions: [
      "Controla Adobe Photoshop (Windows): documentos, capas, texto, formas, efectos de capa, modos de fusión, máscaras, ajustes, filtros, objetos inteligentes y exportación.",
      "FLUJO: ps_status → (ps_style_get si la persona tiene un estilo guardado) → ps_new_document / ps_open → crear con ps_add_text, ps_add_shape, ps_place_image, ps_layer_style… → ps_preview para VER el resultado y corregir.",
      "SIEMPRE mira tu trabajo: ps_preview devuelve la imagen. Compara con el objetivo y ajusta antes de entregar.",
      "Medidas en píxeles del documento (origen arriba a la izquierda). Colores '#RRGGBB'. Cada herramienta que cambia algo queda en un solo paso del historial de Photoshop ('Videazo · …'): Ctrl+Z lo deshace.",
      "Capas: pásalas por nombre, 'Grupo/Subgrupo/Capa', id numérico o {id|name|path|index|nth}. Las capas nuevas van arriba del todo salvo que indiques parent, above o below.",
      "ESTILO: ps_style_analyze lee PSD de la persona y aprende su estilo (paleta, tipografía, efectos, mezclas, estructura). ps_style_get te da la guía; en ps_add_text puedes usar preset:'titulo' y en efectos recipe:'nombre' de ese estilo.",
      "MODOS DE FUSIÓN: " + "normal, multiply, screen, overlay, softLight, hardLight, vividLight, linearLight, pinLight, hardMix, colorDodge, linearDodge(add), colorBurn, linearBurn, darken, lighten, darkerColor, lighterColor, difference, exclusion, subtract, divide, hue, saturation, color, luminosity.",
      "Para lo que no tenga herramienta propia: ps_action_manager (cualquier evento de Photoshop en JSON) o ps_execute_script (ExtendScript completo, ES3: sin let/const/flechas).",
      "Photoshop no atiende órdenes mientras tenga un cuadro de diálogo abierto: si una orden no responde, pide que lo cierren.",
    ].join("\n"),
  }
);

// ---------- utilidades ----------
const MAX_TEXT = 60000;
const text = (data) => {
  let t = typeof data === "string" ? data : JSON.stringify(data, null, 1);
  if (t === undefined) t = "null";
  if (t.length > MAX_TEXT) t = t.slice(0, MAX_TEXT) + `\n… [recortado, ${t.length - MAX_TEXT} caracteres más; pide menos profundidad o filtra]`;
  return t;
};
const ok = (data) => ({ content: [{ type: "text", text: text(data) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e?.message ?? e) }] });
const tool = (name, meta, handler) =>
  server.registerTool(name, meta, async (args) => {
    try { return await handler(args ?? {}); } catch (e) { return fail(e); }
  });
// operación que cambia el documento: un paso de historial por llamada
const edit = (name, opName, label) => async (a) => ok(await op(opName, await styles.resolve(a), { history: `Videazo · ${label || name}` }));
const read = (opName) => async (a) => ok(await op(opName, a));

// ---------- esquemas compartidos ----------
const hex = z.string().describe('Color "#RRGGBB" (también "#RGB" o "rgb(r,g,b)")');
const layerRef = z
  .union([z.number().int(), z.string(), z.object({ id: z.number().int().optional(), name: z.string().optional(), path: z.string().optional(), index: z.number().int().optional(), nth: z.number().int().optional() })])
  .describe("Capa: nombre, 'Grupo/Capa', id numérico o {id|name|path|index|nth}");
const doc = z.union([z.string(), z.number().int()]).optional().describe("Documento (nombre o índice desde 1). Por defecto el activo.");
const BLEND = z.string().describe("Modo de fusión: normal, multiply, screen, overlay, softLight, hardLight, vividLight, linearLight, pinLight, hardMix, colorDodge, linearDodge, colorBurn, linearBurn, darken, lighten, darkerColor, lighterColor, difference, exclusion, subtract, divide, hue, saturation, color, luminosity, passThrough");
const stop = z.object({ color: hex, pos: z.number().min(0).max(100).optional().describe("Posición 0-100"), opacity: z.number().min(0).max(100).optional() });
const gradient = z.object({ stops: z.array(stop).min(2), style: z.enum(["linear", "radial", "angle", "reflected", "diamond"]).optional(), angle: z.number().optional().describe("Grados. 90 = de abajo hacia arriba (el primer color abajo)"), scale: z.number().optional(), reverse: z.boolean().optional(), dither: z.boolean().optional() });
const fillSpec = z.union([hex, gradient.extend({ type: z.literal("gradient") })]).describe("Relleno: '#RRGGBB' o {type:'gradient', stops:[{color,pos}], style, angle}");
const placement = {
  x: z.number().optional(), y: z.number().optional(),
  anchor: z.enum(["topleft", "top", "topright", "left", "center", "right", "bottomleft", "bottom", "bottomright"]).optional().describe("Punto de la capa que se coloca en (x,y). Por defecto topleft"),
  parent: layerRef.optional().describe("Grupo donde crearla"), above: layerRef.optional(), below: layerRef.optional(),
};
const basics = {
  name: z.string().optional(), opacity: z.number().min(0).max(100).optional(), fill: z.number().min(0).max(100).optional().describe("Relleno (no afecta efectos de capa)"), blend: BLEND.optional(), visible: z.boolean().optional(), clipped: z.boolean().optional().describe("Máscara de recorte sobre la capa de abajo"), label: z.enum(["none", "red", "orange", "yellow", "green", "blue", "violet", "gray"]).optional(),
};
const { fill: _fillOpacity, ...basicsNoFill } = basics;
const shadow = z.object({ color: hex.optional(), opacity: z.number().optional(), blend: BLEND.optional(), angle: z.number().optional(), distance: z.number().optional(), spread: z.number().optional(), size: z.number().optional(), noise: z.number().optional(), knockout: z.boolean().optional(), useGlobalLight: z.boolean().optional(), enabled: z.boolean().optional() });
const glow = z.object({ color: hex.optional(), opacity: z.number().optional(), blend: BLEND.optional(), technique: z.enum(["softer", "precise"]).optional(), spread: z.number().optional(), size: z.number().optional(), noise: z.number().optional(), range: z.number().optional(), source: z.enum(["edge", "center"]).optional() });
const colorOv = z.object({ color: hex, opacity: z.number().optional(), blend: BLEND.optional() });
const gradOv = z.object({ stops: z.array(stop).min(2), style: z.string().optional(), angle: z.number().optional(), scale: z.number().optional(), reverse: z.boolean().optional(), align: z.boolean().optional(), dither: z.boolean().optional(), opacity: z.number().optional(), blend: BLEND.optional(), offset: z.object({ x: z.number(), y: z.number() }).optional() });
const strokeFx = z.object({ size: z.number().optional(), position: z.enum(["outside", "inside", "center"]).optional(), color: hex.optional(), stops: z.array(stop).optional(), angle: z.number().optional(), opacity: z.number().optional(), blend: BLEND.optional() });
const one = (s) => z.union([s, z.array(s)]);
const effectsFull = z
  .object({
    dropShadow: one(shadow).optional().describe("Sombra paralela. Lista = varias sombras apiladas (como en tus diseños)"),
    innerShadow: one(shadow).optional(),
    outerGlow: glow.optional(), innerGlow: glow.optional(),
    bevelEmboss: z.object({ style: z.enum(["outer", "inner", "emboss", "pillow", "strokeEmboss"]).optional(), technique: z.enum(["smooth", "chiselHard", "chiselSoft"]).optional(), depth: z.number().optional(), direction: z.enum(["up", "down"]).optional(), size: z.number().optional(), soften: z.number().optional(), angle: z.number().optional(), altitude: z.number().optional(), highlight: z.object({ color: hex.optional(), opacity: z.number().optional(), blend: BLEND.optional() }).optional(), shadow: z.object({ color: hex.optional(), opacity: z.number().optional(), blend: BLEND.optional() }).optional() }).optional(),
    satin: z.object({ color: hex.optional(), opacity: z.number().optional(), blend: BLEND.optional(), angle: z.number().optional(), distance: z.number().optional(), size: z.number().optional(), invert: z.boolean().optional() }).optional(),
    colorOverlay: one(colorOv).optional(), gradientOverlay: one(gradOv).optional(), stroke: one(strokeFx).optional(),
    recipe: z.string().optional().describe("Nombre de una receta del estilo guardado (ps_style_get)"),
    raw: z.any().optional().describe("layerEffects exacto capturado con ps_capture_style"),
    clear: z.boolean().optional().describe("Quita todos los efectos"),
  })
  .describe("Estilos de capa. Cada clave es opcional.");
const effects = z.record(z.any()).describe("Efectos de capa con el mismo esquema que ps_layer_style.effects: {dropShadow:[{color,opacity,angle,distance,size,blend}], outerGlow:{color,opacity,size,noise,blend}, innerGlow, bevelEmboss, satin, colorOverlay, gradientOverlay:{stops,angle}, stroke:{size,position,color}, recipe:'nombre', raw, clear}");
const textStyle = z.object({
  font: z.string().optional().describe("Nombre PostScript ('Montserrat-Black') o 'Familia Estilo'. Búscalo con ps_fonts"), family: z.string().optional(), weight: z.number().optional().describe("100-900 (con family)"),
  size: z.number().optional().describe("px"), color: hex.optional(), tracking: z.number().optional().describe("1/1000 em (como Photoshop)"), leading: z.union([z.number(), z.literal("auto")]).optional().describe("px o 'auto'"),
  kerning: z.union([z.enum(["metrics", "optical", "none"]), z.number()]).optional(), baselineShift: z.number().optional(), caps: z.enum(["none", "all", "small"]).optional(), underline: z.boolean().optional(), strike: z.boolean().optional(),
  fauxBold: z.boolean().optional(), fauxItalic: z.boolean().optional(), hScale: z.number().optional(), vScale: z.number().optional(), ligatures: z.boolean().optional(), antiAlias: z.enum(["none", "sharp", "crisp", "strong", "smooth"]).optional(), variation: z.array(z.number()).optional().describe("Ejes de fuente variable, p. ej. [736] para peso"),
});

// ---------- estado y archivos ----------
tool("ps_status", { title: "Estado de Photoshop", description: "Conecta con Photoshop (lo abre si está cerrado) y devuelve versión, documentos abiertos, documento y capa activos.", inputSchema: {} }, async () => ok({ ...(await op("status", {})), bridge: info() }));

tool("ps_open", { title: "Abrir archivo", description: "Abre un PSD/PSB/imagen/PDF/AI en Photoshop y devuelve su configuración.", inputSchema: { path: z.string().describe("Ruta absoluta"), page: z.number().int().optional().describe("Página (PDF/AI)"), resolution: z.number().optional() } }, read("openDocument"));

tool(
  "ps_new_document",
  {
    title: "Documento nuevo",
    description: "Crea un documento con toda su configuración: tamaño, unidad, resolución, modo de color, profundidad, perfil ICC, fondo, guías y, para carruseles, diapositivas continuas (slides: {count, width}) con guías en cada corte.",
    inputSchema: {
      name: z.string().optional(), width: z.number(), height: z.number(), unit: z.enum(["px", "in", "cm", "mm", "pt"]).optional(), resolution: z.number().optional().describe("ppp, por defecto 72"),
      mode: z.enum(["rgb", "cmyk", "gray", "lab"]).optional(), bitDepth: z.union([z.literal(8), z.literal(16), z.literal(32)]).optional(), profile: z.string().optional().describe("Perfil de color, p. ej. 'sRGB IEC61966-2.1', 'Display P3', 'Adobe RGB (1998)'"),
      background: z.string().optional().describe("'white', 'transparent' o un color '#RRGGBB' (crea la capa Fondo)"),
      guides: z.array(z.object({ direction: z.enum(["vertical", "horizontal"]), position: z.number() })).optional(),
      slides: z.object({ count: z.number().int().min(1), width: z.number().optional(), height: z.number().optional() }).optional().describe("Carrusel panorámico: ancho total = count × width; pone una guía vertical en cada corte"),
    },
  },
  async (a) => ok(await op("newDocument", a))
);

tool("ps_document_info", { title: "Configuración del documento", description: "Todo lo que define el proyecto: tamaño, resolución, modo, profundidad, perfil, guías, artboards, canales, trazados, composiciones, conteo de capas por tipo e historial.", inputSchema: { doc, raw: z.boolean().optional().describe("Incluye el descriptor completo de Photoshop") } }, read("docInfo"));

tool("ps_project_report", { title: "Ficha técnica del proyecto", description: "Un solo informe en texto: configuración del documento, recursos que toma (fuentes, vinculados, bibliotecas CC, incrustados, problemas), estructura de capas en 2 niveles y cómo está definido el diseño (tipografía, color, efectos, mezcla, opacidad vs relleno, imágenes). Es lo primero que conviene leer al recibir un PSD ajeno.", inputSchema: { doc } }, async (a) => ok(await styles.projectReport(a)));
tool("ps_resources", { title: "Recursos del documento", description: "Qué recursos usa el proyecto y cómo están definidos: fuentes (instaladas o no), archivos vinculados (ruta, biblioteca de Creative Cloud, perdidos/modificados), objetos inteligentes incrustados, colores de texto y problemas detectados.", inputSchema: { doc } }, read("resources"));

tool(
  "ps_set_document",
  {
    title: "Ajustar documento",
    description: "Cambia la configuración del documento: tamaño de imagen/lienzo, resolución, modo, profundidad, perfil de color (convertir/asignar), recortar, rotar, guías.",
    inputSchema: {
      doc, resizeImage: z.object({ width: z.number().optional(), height: z.number().optional(), resolution: z.number().optional() }).optional(),
      resizeCanvas: z.object({ width: z.number().optional(), height: z.number().optional(), anchor: z.enum(["center", "top", "bottom", "left", "right", "topleft", "topright", "bottomleft", "bottomright"]).optional() }).optional(),
      resolution: z.number().optional(), mode: z.enum(["rgb", "cmyk", "gray", "lab"]).optional(), bitDepth: z.union([z.literal(8), z.literal(16), z.literal(32)]).optional(), convertProfile: z.string().optional(), assignProfile: z.string().optional(), trim: z.boolean().optional(), rotateCanvas: z.number().optional(), clearGuides: z.boolean().optional(),
      guides: z.array(z.object({ direction: z.enum(["vertical", "horizontal"]), position: z.number() })).optional(),
    },
  },
  edit("ps_set_document", "setDocument", "ajustar documento")
);

tool("ps_save", { title: "Guardar", description: "Guarda el documento (PSD, PSB, TIFF, PNG, JPG). Sin path guarda sobre su archivo. asCopy=true no cambia el documento abierto.", inputSchema: { doc, path: z.string().optional(), format: z.enum(["psd", "psb", "tif", "png", "jpg", "pdf"]).optional(), asCopy: z.boolean().optional(), quality: z.number().optional() } }, read("saveDocument"));
tool("ps_close", { title: "Cerrar documento", description: "Cierra un documento (sin guardar salvo save=true).", inputSchema: { doc, save: z.boolean().optional() } }, read("closeDocument"));

tool(
  "ps_export",
  {
    title: "Exportar",
    description: "Exporta copias sin tocar el documento: todo el documento, cada artboard, cada grupo de nivel superior, o recortes (slices). Para un carrusel panorámico usa mode:'slides'.",
    inputSchema: {
      doc, folder: z.string().describe("Carpeta de salida"), name: z.string().optional(), format: z.enum(["png", "jpg", "psd", "tif", "pdf"]).optional(), quality: z.number().optional(), scale: z.number().optional(),
      mode: z.enum(["document", "artboards", "groups", "slices", "slides"]).optional().describe("'slides' corta por las guías verticales (carrusel)"),
      slices: z.array(z.object({ name: z.string().optional(), x: z.number(), y: z.number(), width: z.number(), height: z.number() })).optional(),
      crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
    },
  },
  async (a) => {
    if (a.mode === "slides") {
      const d = await op("docInfo", { doc: a.doc });
      const cuts = d.guides.filter((g) => g.direction === "Vertical" || g.direction === "VERTICAL" || /vertical/i.test(g.direction)).map((g) => g.position).sort((x, y) => x - y);
      if (!cuts.length) throw new Error("No hay guías verticales para cortar. Crea el documento con slides:{count,width} o agrega guías con ps_set_document.");
      const edges = [0, ...cuts, d.width];
      a = { ...a, mode: "slices", slices: edges.slice(0, -1).map((x0, i) => ({ name: String(i + 1), x: x0, y: 0, width: edges[i + 1] - x0, height: d.height })) };
    }
    return ok(await op("exportDoc", a));
  }
);

tool(
  "ps_preview",
  {
    title: "Ver el diseño",
    description: "Renderiza el documento (o una parte) y te DEVUELVE LA IMAGEN para que la veas. Se usa un duplicado: el original no se toca. Úsala después de cada cambio importante. Opciones: crop (zona en px), layer/artboard (recorta a esa capa), showOnly/hide/show (aislar capas).",
    inputSchema: {
      doc, maxSize: z.number().optional().describe("Lado mayor en px (por defecto 1568)"), format: z.enum(["jpg", "png"]).optional(), quality: z.number().optional(),
      crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(), layer: layerRef.optional(), padding: z.number().optional(), artboard: layerRef.optional(),
      showOnly: z.array(layerRef).optional().describe("Muestra solo estas capas"), hide: z.array(layerRef).optional(), show: z.array(layerRef).optional(),
    },
  },
  async (a) => {
    const r = await op("preview", a);
    const buf = fs.readFileSync(r.path);
    try { fs.rmSync(r.path, { force: true }); } catch {}
    return { content: [{ type: "image", data: buf.toString("base64"), mimeType: r.format === "png" ? "image/png" : "image/jpeg" }, { type: "text", text: `Vista previa ${r.width}×${r.height} (escala ${r.scale} del original ${r.sourceWidth}×${r.sourceHeight}).` }] };
  }
);

// ---------- capas ----------
tool("ps_layers", { title: "Árbol de capas", description: "Lista las capas con tipo, visibilidad, opacidad, relleno, modo de fusión, contorno, máscaras, efectos activos, texto y objetos inteligentes (vinculado/incrustado). depth limita los niveles; group baja a un grupo.", inputSchema: { doc, depth: z.number().int().optional(), group: layerRef.optional(), includeHidden: z.boolean().optional(), raw: z.boolean().optional() } }, read("layers"));
tool("ps_layer_info", { title: "Detalle de una capa", description: "Todo sobre una capa: texto con cada tramo (fuente, tamaño real, tracking, interlineado, color), efectos en esquema amigable, trazo y radios de formas, máscara, objeto inteligente, mezcla. raw=true añade el descriptor completo.", inputSchema: { doc, layer: layerRef, raw: z.boolean().optional(), exact: z.boolean().optional() } }, read("layerInfo"));

tool(
  "ps_add_text",
  {
    title: "Agregar texto",
    description: "Crea una capa de texto con control tipográfico completo. Un solo estilo con 'style', o varios tramos con 'runs' (p. ej. una línea Light y otra Black). x,y + anchor colocan el contorno visible; box={width,height} crea texto de párrafo. Admite efectos en la misma llamada.",
    inputSchema: {
      doc, text: z.string().optional().describe("Texto (\\n = salto de párrafo). No uses a la vez que runs"), runs: z.array(z.object({ text: z.string(), style: textStyle.optional(), preset: z.string().optional() })).optional(),
      style: textStyle.optional(), preset: z.string().optional().describe("Preset tipográfico del estilo guardado (p. ej. 'titulo')"),
      align: z.enum(["left", "center", "right", "justify", "justify-center", "justify-right", "justify-all"]).optional(), paragraph: z.object({ spaceBefore: z.number().optional(), spaceAfter: z.number().optional(), firstLineIndent: z.number().optional(), hyphenation: z.boolean().optional() }).optional(),
      box: z.object({ width: z.number(), height: z.number().optional() }).optional(), rotation: z.number().optional(), language: z.string().optional().describe("es, en, fr, pt, de, it"),
      ...placement, ...basics, effects: effects.optional(), effectsMode: z.enum(["replace", "merge"]).optional(),
    },
  },
  edit("ps_add_text", "addText", "texto")
);

tool(
  "ps_edit_text",
  {
    title: "Editar texto",
    description: "Cambia el contenido y/o el estilo de una capa de texto existente (conserva lo que no indiques). También mover, rotar, efectos y mezcla.",
    inputSchema: { doc, layer: layerRef, text: z.string().optional(), runs: z.array(z.object({ text: z.string(), style: textStyle.optional(), preset: z.string().optional() })).optional(), style: textStyle.optional(), preset: z.string().optional(), align: z.enum(["left", "center", "right", "justify", "justify-center", "justify-right", "justify-all"]).optional(), paragraph: z.object({ spaceBefore: z.number().optional(), spaceAfter: z.number().optional(), firstLineIndent: z.number().optional() }).optional(), box: z.object({ width: z.number(), height: z.number().optional() }).optional(), rotation: z.number().optional(), x: z.number().optional(), y: z.number().optional(), anchor: placement.anchor, ...basics, effects: effects.optional(), effectsMode: z.enum(["replace", "merge"]).optional() },
  },
  edit("ps_edit_text", "editText", "editar texto")
);

tool("ps_fonts", { title: "Buscar fuentes", description: "Busca entre las fuentes instaladas (nombre PostScript, familia y estilo) para usar en ps_add_text.", inputSchema: { query: z.string().optional().describe("p. ej. 'montserrat', 'bold', 'serif display'"), limit: z.number().int().optional() } }, read("fonts"));
tool("ps_text_info", { title: "Leer texto", description: "Lee una capa de texto: contenido, tipo (punto/párrafo), rotación, escala y cada tramo con su estilo real.", inputSchema: { doc, layer: layerRef } }, read("textInfo"));

tool(
  "ps_add_shape",
  {
    title: "Agregar forma",
    description: "Crea una forma vectorial: rectangle, roundRect (radius número, [tl,tr,br,bl] o 'pill'), ellipse, circle, polygon, star, line o path (points). Relleno sólido o degradado, trazo (ancho, alineación, guiones), efectos, mezcla y opacidad.",
    inputSchema: {
      doc, shape: z.enum(["rectangle", "roundRect", "ellipse", "circle", "polygon", "star", "line", "path"]).optional(), width: z.number().optional(), height: z.number().optional(),
      radius: z.union([z.number(), z.array(z.number()).length(4), z.literal("pill")]).optional(), sides: z.number().int().optional(), innerRadius: z.number().optional().describe("Estrella: 0-1"), points: z.array(z.tuple([z.number(), z.number()])).optional(), closed: z.boolean().optional(), x2: z.number().optional(), y2: z.number().optional(), thickness: z.number().optional(),
      fill: z.union([fillSpec, z.null(), z.literal("none")]).optional().describe("null/'none' = sin relleno (solo trazo)"), rotation: z.number().optional(),
      stroke: z.object({ width: z.number().optional(), color: hex.optional(), gradient: gradient.optional(), align: z.enum(["center", "inside", "outside"]).optional(), cap: z.enum(["butt", "round", "square"]).optional(), join: z.enum(["miter", "round", "bevel"]).optional(), dash: z.array(z.number()).optional(), opacity: z.number().optional(), blend: BLEND.optional() }).optional(),
      ...placement, ...basicsNoFill, fillOpacity: z.number().min(0).max(100).optional().describe("Relleno de la CAPA (no confundir con 'fill', que es el color de la forma)"), effects: effects.optional(), effectsMode: z.enum(["replace", "merge"]).optional(),
    },
  },
  edit("ps_add_shape", "addShape", "forma")
);

tool(
  "ps_create_layer",
  {
    title: "Crear capa o grupo",
    description: "Crea una capa de píxeles (opcionalmente rellena), un grupo, o una capa de relleno sólido/degradado a todo el lienzo.",
    inputSchema: { doc, kind: z.enum(["pixel", "group", "solid", "gradient"]).optional(), color: hex.optional(), fillColor: hex.optional().describe("Rellena una capa de píxeles"), gradient: gradient.optional(), ...placement, ...basics },
  },
  edit("ps_create_layer", "createLayer", "crear capa")
);

tool(
  "ps_set_layer",
  {
    title: "Modificar capa",
    description: "Cambia casi todo de una capa: nombre, visibilidad, opacidad, relleno, modo de fusión, recorte, bloqueo, etiqueta de color; posición (x,y,anchor / moveBy), tamaño (size / resize %), rotación, sesgo, volteo; orden (order/parent/above/below); color de una forma, trazo de forma, 'Mezclar si' (blendIf), máscara y efectos.",
    inputSchema: {
      doc, layer: layerRef, ...basics, locked: z.boolean().optional(),
      x: z.number().optional(), y: z.number().optional(), anchor: placement.anchor, moveBy: z.object({ x: z.number().optional(), y: z.number().optional() }).optional(),
      size: z.object({ width: z.number().optional(), height: z.number().optional() }).optional().describe("Tamaño final en px (si falta uno, mantiene proporción)"), resize: z.object({ x: z.number().optional(), y: z.number().optional(), scale: z.number().optional() }).optional().describe("Escala en %"),
      rotate: z.number().optional(), skew: z.object({ x: z.number().optional(), y: z.number().optional() }).optional(), flip: z.enum(["horizontal", "vertical"]).optional(),
      order: z.enum(["front", "back", "up", "down"]).optional(), parent: layerRef.optional(), above: layerRef.optional(), below: layerRef.optional(),
      fillColor: hex.optional().describe("Nuevo color de una capa de relleno/forma"), shapeStroke: z.object({ width: z.number().optional(), color: hex.optional(), align: z.enum(["center", "inside", "outside"]).optional(), opacity: z.number().optional() }).optional(),
      blendIf: z.object({ channel: z.enum(["gray", "red", "green", "blue"]).optional(), this: z.array(z.number()).length(4).optional().describe("[negroMin,negroMax,blancoMin,blancoMax] 0-255"), under: z.array(z.number()).length(4).optional() }).optional().describe("Mezclar si (blend if)"),
      mask: z.any().optional().describe("Mismos parámetros que ps_mask (sin layer)"), effects: effects.optional(), effectsMode: z.enum(["replace", "merge"]).optional(), alignTo: z.object({ to: z.string().optional(), h: z.enum(["left", "center", "right"]).optional(), v: z.enum(["top", "middle", "bottom"]).optional() }).optional(),
    },
  },
  edit("ps_set_layer", "setLayer", "modificar capa")
);

tool(
  "ps_layer_style",
  {
    title: "Efectos de capa",
    description: "Aplica estilos de capa: sombras (varias apiladas), sombra interior, resplandores, bisel y relieve, satinado, superposición de color/degradado, trazo. mode:'replace' (por defecto) reemplaza los efectos; 'merge' conserva los demás. copyFrom copia los efectos de otra capa. Devuelve los efectos resultantes leídos de Photoshop.",
    inputSchema: { doc, layer: layerRef, effects: effectsFull.optional(), mode: z.enum(["replace", "merge"]).optional(), copyFrom: layerRef.optional(), disable: z.boolean().optional().describe("Oculta/muestra los efectos sin borrarlos") },
  },
  edit("ps_layer_style", "layerStyle", "efectos de capa")
);

tool("ps_capture_style", { title: "Capturar estilo de una capa", description: "Lee los efectos, mezcla, relleno y (si es texto) la tipografía de una capa como receta reutilizable. Con name la guarda en el estilo activo para usarla luego con effects:{recipe}.", inputSchema: { doc, layer: layerRef, name: z.string().optional().describe("Guardarla como receta con este nombre") } }, async (a) => {
  const r = await op("captureStyle", a);
  if (a.name) { await styles.saveRecipe(a.name, r); r.savedAs = a.name; }
  return ok(r);
});

tool(
  "ps_place_image",
  {
    title: "Colocar imagen",
    description: "Coloca un archivo como objeto inteligente (incrustado o vinculado). Con box={x,y,width,height} y fit ('cover' recorta con máscara, 'contain', 'stretch') la encaja en un marco; radius redondea el marco. También escala/posición libres.",
    inputSchema: { doc, path: z.string().optional().describe("Ruta local"), url: z.string().optional().describe("URL de la imagen (se descarga a una carpeta temporal)"), linked: z.boolean().optional().describe("Vinculado en vez de incrustado"), box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(), fit: z.enum(["cover", "contain", "stretch"]).optional(), radius: z.union([z.number(), z.literal("pill")]).optional(), offsetX: z.number().optional(), offsetY: z.number().optional(), scale: z.number().optional().describe("% si no usas box"), width: z.number().optional(), height: z.number().optional(), rotation: z.number().optional(), ...placement, ...basics, effects: effects.optional() },
  },
  async (a) => {
    if (!a.path && a.url) {
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`No pude descargar la imagen (${res.status}).`);
      const ext = (a.url.split("?")[0].match(/\.(png|jpe?g|webp|gif|svg)$/i) || [".png"])[0];
      const p = path.join(os.tmpdir(), `vz_img_${Date.now()}${ext}`);
      fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
      a = { ...a, path: p.replace(/\\/g, "/") };
    }
    if (!a.path) throw new Error("Indica path o url.");
    return ok(await op("placeImage", await styles.resolve(a), { history: "Videazo · colocar imagen" }));
  }
);

tool(
  "ps_smart_object",
  { title: "Objetos inteligentes", description: "Convertir una capa en objeto inteligente, reemplazar su contenido por otro archivo, abrir su contenido para editar, revincular, incrustar o convertir a vinculado.", inputSchema: { doc, layer: layerRef, action: z.enum(["convert", "replace", "edit", "relink", "embed", "toLinked", "rasterize"]).optional(), path: z.string().optional() } },
  edit("ps_smart_object", "smartObject", "objeto inteligente")
);

tool(
  "ps_mask",
  {
    title: "Máscaras",
    description: "Máscaras de capa: revealAll, hideAll, rect/ellipse (con radius y feather), selection (usa la selección actual), gradient (desvanecido lineal o radial, direction: up/down/left/right/radial), delete, apply, clip/unclip (máscara de recorte). density y maskFeather ajustan la máscara.",
    inputSchema: { doc, layer: layerRef, type: z.enum(["revealAll", "hideAll", "rect", "ellipse", "selection", "gradient", "delete", "apply", "clip", "unclip"]).optional(), rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(), radius: z.union([z.number(), z.literal("pill")]).optional(), feather: z.number().optional(), direction: z.enum(["up", "down", "left", "right", "radial"]).optional().describe("Hacia dónde se REVELA la capa"), start: z.number().optional(), end: z.number().optional(), reverse: z.boolean().optional(), density: z.number().optional(), maskFeather: z.number().optional() },
  },
  edit("ps_mask", "mask", "máscara")
);

tool(
  "ps_add_adjustment",
  {
    title: "Capa de ajuste",
    description: "Crea una capa de ajuste no destructiva. type y params: brightnessContrast{brightness,contrast} · levels{inBlack,inWhite,gamma,outBlack,outWhite,channel} · curves{points:[[x,y]..],channel | channels:{red,green,blue}} · hueSaturation{hue,saturation,lightness,colorize} · vibrance{vibrance,saturation} · colorBalance{shadows,midtones,highlights:[c-r,m-g,y-b]} · blackAndWhite{red,yellow,green,cyan,blue,magenta,tint} · photoFilter{color,density} · gradientMap{stops} · exposure{exposure,offset,gamma} · selectiveColor{colors:{reds:{cyan,magenta,yellow,black}}} · invert · threshold{level} · posterize{levels}. clip=true la limita a la capa de abajo.",
    inputSchema: { doc, type: z.enum(["brightnessContrast", "levels", "curves", "hueSaturation", "vibrance", "colorBalance", "blackAndWhite", "photoFilter", "gradientMap", "exposure", "selectiveColor", "invert", "threshold", "posterize"]), params: z.record(z.any()).optional(), clip: z.boolean().optional(), mask: z.any().optional(), ...placement, ...basics },
  },
  edit("ps_add_adjustment", "addAdjustment", "ajuste")
);

tool(
  "ps_filter",
  {
    title: "Filtros",
    description: "Aplica un filtro a una capa: gaussianBlur{radius} · motionBlur{angle,distance} · radialBlur{amount,method} · addNoise/grain{amount,distribution,monochrome} · unsharpMask{amount,radius,threshold} · highPass{radius} · median{radius} · sharpen · dustAndScratches · surfaceBlur · smartSharpen · filmGrain · diffuseGlow · cameraRaw{exposure,contrast,highlights,shadows,whites,blacks,texture,clarity,dehaze,vibrance,saturation,temperature,tint,vignette,grain}. toSmart=true lo hace como filtro inteligente (editable).",
    inputSchema: { doc, layer: layerRef, filter: z.string(), params: z.record(z.any()).optional(), toSmart: z.boolean().optional() },
  },
  edit("ps_filter", "filter", "filtro")
);

tool(
  "ps_selection",
  {
    title: "Selecciones",
    description: "Crea o modifica la selección: all, none, invert, rect, ellipse, polygon, layer (transparencia de una capa), subject (IA), colorRange. mode: replace/add/subtract/intersect. grow/shrink/smooth/border/feather. then: fill, clear, stroke, copyToLayer, cutToLayer, saveAs, mask, deselect.",
    inputSchema: { doc, type: z.enum(["all", "none", "invert", "rect", "ellipse", "polygon", "layer", "subject", "colorRange"]).optional(), mode: z.enum(["replace", "add", "subtract", "intersect"]).optional(), rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(), radius: z.union([z.number(), z.literal("pill")]).optional(), points: z.array(z.tuple([z.number(), z.number()])).optional(), layer: layerRef.optional(), color: hex.optional(), fuzziness: z.number().optional(), sampleAllLayers: z.boolean().optional(), grow: z.number().optional(), shrink: z.number().optional(), smooth: z.number().optional(), border: z.number().optional(), feather: z.number().optional(), then: z.record(z.any()).optional() },
  },
  edit("ps_selection", "selection", "selección")
);

tool("ps_fill", { title: "Rellenar píxeles", description: "Rellena la selección (o toda la capa) con un color, un degradado, o con relleno según contenido (contentAware).", inputSchema: { doc, layer: layerRef.optional(), color: hex.optional(), opacity: z.number().optional(), gradient: gradient.optional(), from: z.tuple([z.number(), z.number()]).optional(), to: z.tuple([z.number(), z.number()]).optional(), contentAware: z.boolean().optional(), preserveTransparency: z.boolean().optional() } }, edit("ps_fill", "fill", "rellenar"));

tool("ps_remove_background", { title: "Quitar fondo (IA)", description: "Quita el fondo de una capa con la IA de Photoshop (crea una máscara).", inputSchema: { doc, layer: layerRef } }, edit("ps_remove_background", "removeBackground", "quitar fondo"));

tool("ps_create_artboard", { title: "Mesa de trabajo", description: "Crea una mesa de trabajo (artboard) con nombre, posición y tamaño exactos, y color de fondo opcional. Útil para varias piezas (diapositivas, formatos) en un mismo documento; luego ps_export mode:\"artboards\" las exporta una por una.", inputSchema: { doc, name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), width: z.number(), height: z.number(), background: hex.optional() } }, edit("ps_create_artboard", "createArtboard", "mesa de trabajo"));
tool("ps_delete_layer", { title: "Borrar capas", description: "Borra una o varias capas.", inputSchema: { doc, layer: layerRef.optional(), layers: z.array(layerRef).optional() } }, edit("ps_delete_layer", "deleteLayer", "borrar capa"));
tool("ps_duplicate_layer", { title: "Duplicar capa", description: "Duplica una capa (en el mismo documento u otro con toDocument), con nombre, desplazamiento o posición nuevos.", inputSchema: { doc, layer: layerRef, name: z.string().optional(), toDocument: doc, offset: z.object({ x: z.number().optional(), y: z.number().optional() }).optional(), x: z.number().optional(), y: z.number().optional(), anchor: placement.anchor, opacity: z.number().optional(), blend: BLEND.optional(), fill: z.number().optional() } }, edit("ps_duplicate_layer", "duplicateLayer", "duplicar capa"));
tool("ps_group", { title: "Agrupar / desagrupar", description: "Agrupa capas en un grupo (con nombre, modo de fusión, efectos) o desagrupa un grupo.", inputSchema: { doc, layers: z.array(layerRef).optional(), name: z.string().optional(), ungroup: layerRef.optional(), blend: BLEND.optional(), opacity: z.number().optional(), effects: effects.optional() } }, async (a) => ok(a.ungroup ? await op("ungroup", { doc: a.doc, layer: a.ungroup }, { history: "Videazo · desagrupar" }) : await op("group", a, { history: "Videazo · agrupar" })));
tool("ps_merge_rasterize", { title: "Combinar / rasterizar", description: "Combina capas (merge), crea una capa de sello con todo lo visible (mode:'stamp'), o rasteriza (what: layer|style|text|shape).", inputSchema: { doc, layers: z.array(layerRef).optional(), layer: layerRef.optional(), mode: z.enum(["merge", "stamp"]).optional(), name: z.string().optional(), rasterize: z.enum(["layer", "style", "text", "shape"]).optional() } }, async (a) => ok(a.rasterize ? await op("rasterize", { doc: a.doc, layer: a.layer, what: a.rasterize }, { history: "Videazo · rasterizar" }) : await op("mergeLayers", a, { history: "Videazo · combinar" })));
tool("ps_align", { title: "Alinear y distribuir", description: "Alinea capas al lienzo, a la primera capa, a un artboard o a un rectángulo {x,y,width,height}; distribuye en h/v con espacios iguales.", inputSchema: { doc, layers: z.array(layerRef), to: z.union([z.enum(["canvas", "first", "artboard"]), z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })]).optional(), h: z.enum(["left", "center", "right"]).optional(), v: z.enum(["top", "middle", "bottom"]).optional(), distribute: z.enum(["h", "v"]).optional(), artboard: layerRef.optional() } }, edit("ps_align", "align", "alinear"));

tool("ps_history", { title: "Historial", description: "Lista los pasos del historial, deshace/rehace (steps), vuelve a un paso (revert con index) o crea una instantánea.", inputSchema: { doc, action: z.enum(["list", "undo", "redo", "revert", "snapshot"]).optional(), steps: z.number().int().optional(), index: z.number().int().optional(), name: z.string().optional() } }, read("history"));

tool(
  "ps_batch",
  {
    title: "Varias operaciones en una",
    description: "Ejecuta varias herramientas en orden y las agrupa en UN solo paso del historial. Cada elemento: {tool:'add_shape'|'add_text'|'place_image'|'layer_style'|'set_layer'|'create_layer'|'add_adjustment'|'filter'|'mask'|'group'|'align'|'duplicate_layer'|'delete_layer'|'selection'|'fill', args:{...}} con los mismos parámetros que la herramienta ps_<tool>. Ideal para armar una composición completa. Se detiene en el primer error y dice cuál fue.",
    inputSchema: { doc, name: z.string().optional().describe("Nombre del paso de historial"), steps: z.array(z.object({ tool: z.string(), args: z.record(z.any()).optional() })).min(1) },
  },
  async (a) => {
    const MAP = { add_shape: "addShape", add_text: "addText", edit_text: "editText", place_image: "placeImage", layer_style: "layerStyle", set_layer: "setLayer", create_layer: "createLayer", add_adjustment: "addAdjustment", filter: "filter", mask: "mask", group: "group", align: "align", duplicate_layer: "duplicateLayer", delete_layer: "deleteLayer", selection: "selection", fill: "fill", smart_object: "smartObject", set_document: "setDocument", create_artboard: "createArtboard" };
    const results = [];
    const steps = [];
    for (const [i, s] of a.steps.entries()) {
      const name = MAP[s.tool.replace(/^ps_/, "")];
      if (!name) throw new Error(`Paso ${i + 1}: herramienta '${s.tool}' no válida para ps_batch. Válidas: ${Object.keys(MAP).join(", ")}`);
      steps.push({ name, args: { ...(await styles.resolve(s.args ?? {})), doc: a.doc ?? s.args?.doc } });
    }
    const r = await callPS(`var out = []; for (var i = 0; i < A.steps.length; i++) { try { out.push(VZ.ops[A.steps[i].name](A.steps[i].args)); } catch (e) { throw new Error("Paso " + (i + 1) + " (" + A.steps[i].name + "): " + e.message); } } return out;`, { steps }, { history: `Videazo · ${a.name || "composición"}`, timeout: 600000 });
    return ok({ steps: r.length, results: r });
  }
);

tool("ps_action_manager", { title: "Action Manager directo", description: "Ejecuta cualquier evento de Photoshop con un descriptor en JSON etiquetado (objeto {_c:'clase'}, unidad {_u:'pixelsUnit',v}, enum {_e:[tipo,valor]}, entero {_i}, referencia {_ref:[{cls,form,...}]}). get:[referencia] lee propiedades. Es la salida para cualquier herramienta avanzada que no tenga ps_* propio.", inputSchema: { doc, layer: layerRef.optional(), event: z.string().optional().describe("p. ej. 'make', 'set', 'select', 'Grdn'. Con # usa ID de 4 letras: '#Grdn'"), descriptor: z.record(z.any()).optional(), get: z.array(z.any()).optional(), exact: z.boolean().optional() } }, edit("ps_action_manager", "actionManager", "Action Manager"));
tool("ps_execute_script", { title: "Ejecutar ExtendScript", description: "Ejecuta código ExtendScript (JS ES3) dentro de Photoshop con acceso total a app, documentos, capas y a las ayudas VZ/U/AM. `code` es el CUERPO de una función: usa `return` para devolver datos. Variables: A (args), U (utilidades), AM (Action Manager JSON), VZ.", inputSchema: { code: z.string(), args: z.record(z.any()).optional(), history: z.string().optional(), timeoutSeconds: z.number().optional() } }, async (a) => ok(await op("script", { code: a.code, args: a.args }, { history: a.history ? `Videazo · ${a.history}` : null, timeout: (a.timeoutSeconds || 120) * 1000 })));
tool("ps_run_action", { title: "Ejecutar acción grabada", description: "Reproduce una acción grabada en Photoshop (nombre y conjunto).", inputSchema: { name: z.string(), set: z.string() } }, read("playAction"));
tool("ps_run_script_file", { title: "Ejecutar archivo .jsx", description: "Ejecuta un script .jsx/.jsxbin del disco dentro de Photoshop.", inputSchema: { path: z.string() } }, read("scriptFile"));

// ---------- estilo ----------
tool(
  "ps_style_analyze",
  {
    title: "Aprender un estilo",
    description: "Lee uno o varios PSD (abiertos o por ruta; los abre y los cierra sin guardar) y aprende el estilo de la persona: formato del lienzo, paleta (incluida la real del render), tipografía por jerarquía, recetas de efectos, hábitos de mezcla/opacidad/relleno, formas, recursos, estructura de capas y maquetación. Lo guarda como estilo con nombre y genera una guía. Úsalo con trabajos terminados de la persona.",
    inputSchema: { name: z.string().describe("Nombre del estilo, p. ej. 'mi-estilo'"), files: z.array(z.string()).optional().describe("Rutas de PSD a analizar"), docs: z.array(z.string()).optional().describe("Documentos ya abiertos"), merge: z.boolean().optional().describe("Suma los hallazgos a un estilo existente"), description: z.string().optional() },
  },
  async (a) => ok(await styles.analyze(a))
);
tool("ps_style_list", { title: "Estilos guardados", description: "Lista los estilos guardados y cuál está activo.", inputSchema: {} }, async () => ok(styles.list()));
tool("ps_style_get", { title: "Guía del estilo", description: "Devuelve la guía de un estilo (dirección de arte en palabras, paleta con roles, tipografía por jerarquía, presets de texto, recetas de efectos, hábitos y reglas de composición). Léela ANTES de diseñar para la persona y sigue sus reglas. section limita: guide | tokens | recipes | presets | raw.", inputSchema: { name: z.string().optional().describe("Por defecto el activo"), section: z.enum(["guide", "tokens", "recipes", "presets", "raw"]).optional() } }, async (a) => {
  const r = styles.get(a.name, a.section);
  const imgs = !a.section || a.section === "guide" ? styles.refImages(a.name) : [];
  return { content: [{ type: "text", text: text(r) }, ...imgs.map((i) => ({ type: "image", data: i.data, mimeType: i.mimeType })), ...(imgs.length ? [{ type: "text", text: "Imágenes: referencias del propio estilo de la persona. Míralas: el estilo se entiende mejor viéndolo." }] : [])] };
});
tool("ps_style_set", { title: "Editar estilo", description: "Activa un estilo, o agrega/edita presets de texto, recetas de efectos o colores con nombre. Útil para afinar lo que el análisis dedujo.", inputSchema: { name: z.string().optional(), activate: z.boolean().optional(), textPreset: z.object({ name: z.string(), style: textStyle, align: z.string().optional() }).optional(), color: z.object({ name: z.string(), hex }).optional(), recipe: z.object({ name: z.string(), effects: effects.optional(), blend: BLEND.optional(), fill: z.number().optional(), opacity: z.number().optional() }).optional(), note: z.string().optional().describe("Regla o nota para la guía"), delete: z.object({ kind: z.enum(["textPreset", "recipe", "color", "note"]), name: z.string() }).optional() } }, async (a) => ok(styles.edit(a)));
tool("ps_palette", { title: "Paleta del render", description: "Calcula los colores dominantes de lo que se VE en el documento (no solo de las capas), con porcentaje.", inputSchema: { doc, colors: z.number().int().min(2).max(16).optional() } }, async (a) => ok(await styles.renderedPalette(a)));

// ---------- arranque ----------
const transport = new StdioServerTransport();
await server.connect(transport);
