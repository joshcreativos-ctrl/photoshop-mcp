// Estilos: aprende el estilo de una persona a partir de sus PSD, lo guarda y lo aplica (presets de texto, recetas de efectos).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { op } from "./ps-client.mjs";

const ROOT = process.env.VIDEAZO_PS_DIR || path.join(process.env.APPDATA || os.homedir(), "Videazo", "photoshop-mcp");
const DIR = path.join(ROOT, "styles");
const ACTIVE = path.join(ROOT, "active.json");
fs.mkdirSync(DIR, { recursive: true });

const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "estilo";
const file = (name) => path.join(DIR, slug(name) + ".json");
const guideFile = (name) => path.join(DIR, slug(name) + ".md");
const read = (name) => { try { return JSON.parse(fs.readFileSync(file(name), "utf8")); } catch { return null; } };
const write = (p) => { fs.writeFileSync(file(p.name), JSON.stringify(p, null, 1)); fs.writeFileSync(guideFile(p.name), buildGuide(p)); return p; };
const activeName = () => { try { return JSON.parse(fs.readFileSync(ACTIVE, "utf8")).name; } catch { return null; } };
const setActive = (name) => fs.writeFileSync(ACTIVE, JSON.stringify({ name: slug(name) }));

// ---------- color ----------
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [0, 0, 0]; };
const rgb2hex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function colorName(h) {
  const [hh, s, l] = hsl(hex2rgb(h));
  if (l < 0.07) return "negro";
  if (l > 0.93) return "blanco";
  if (s < 0.12) return l < 0.35 ? "gris oscuro" : l > 0.7 ? "gris claro" : "gris";
  const base = hh < 15 || hh >= 345 ? "rojo" : hh < 40 ? "naranja" : hh < 65 ? "amarillo" : hh < 90 ? "lima" : hh < 165 ? "verde" : hh < 190 ? "turquesa" : hh < 250 ? "azul" : hh < 290 ? "violeta" : "rosa";
  return l < 0.22 ? base + " profundo" : l > 0.7 ? base + " claro" : s > 0.7 && l > 0.4 ? base + " vivo" : base;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------- paleta del render (BMP pequeño → k-means) ----------
function parseBmp(buf) {
  const off = buf.readUInt32LE(10), w = buf.readInt32LE(18), hRaw = buf.readInt32LE(22), bpp = buf.readUInt16LE(28);
  const h = Math.abs(hRaw), bytes = bpp / 8, rowSize = Math.floor((bpp * w + 31) / 32) * 4, px = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = off + y * rowSize + x * bytes; px.push([buf[o + 2], buf[o + 1], buf[o]]); }
  return px;
}
function kmeans(px, k) {
  const sorted = px.slice().sort((a, b) => hsl(a)[2] - hsl(b)[2]);
  let cs = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]);
  let asg = new Array(px.length).fill(0);
  for (let it = 0; it < 12; it++) {
    asg = px.map((p) => { let bi = 0, bd = 1e9; cs.forEach((c, i) => { const d = dist(p, c); if (d < bd) { bd = d; bi = i; } }); return bi; });
    cs = cs.map((c, i) => { const m = px.filter((_, j) => asg[j] === i); return m.length ? [0, 1, 2].map((ch) => m.reduce((s, p) => s + p[ch], 0) / m.length) : c; });
  }
  const out = cs.map((c, i) => ({ hex: rgb2hex(c), pct: Math.round((asg.filter((a) => a === i).length / px.length) * 1000) / 10 })).filter((c) => c.pct > 0.2);
  return out.sort((a, b) => b.pct - a.pct);
}
export async function renderedPalette({ doc, colors = 8 } = {}) {
  const p = path.join(os.tmpdir(), `vz_pal_${Date.now()}.bmp`).replace(/\\/g, "/");
  const r = await op("preview", { doc, format: "bmp", maxSize: 96, path: p });
  const buf = fs.readFileSync(p);
  try { fs.rmSync(p, { force: true }); } catch {}
  const pal = kmeans(parseBmp(buf), colors).map((c) => ({ ...c, name: colorName(c.hex) }));
  return { sampled: `${r.width}×${r.height}`, palette: pal };
}

// ---------- análisis ----------
export async function analyze({ name, files = [], docs = [], merge = false, description }) {
  const targets = [...docs.map((d) => ({ doc: d })), ...files.map((f) => ({ path: f }))];
  if (!targets.length) {
    const st = await op("status", {});
    if (!st.active) throw new Error("Indica files:[rutas de PSD] o abre el PSD y pasa docs:[nombre].");
    targets.push({ doc: st.active });
  }
  let profile = (merge && read(name)) || { name: slug(name), title: name, description: description || "", created: new Date().toISOString(), sources: [], agg: null };
  for (const t of targets) {
    let docRef = t.doc, opened = false;
    if (t.path) {
      const st = await op("status", {});
      const norm = (s) => String(s).replace(/\\/g, "/").toLowerCase();
      const already = st.documents.find((d) => d.path && norm(d.path) === norm(t.path));
      if (already) docRef = already.name;
      else { const o = await op("openDocument", { path: t.path }); docRef = o.name; opened = true; }
    }
    try {
      const findings = await op("analyzeStyle", { doc: docRef }, { timeout: 900000 });
      let palette = null;
      try { palette = (await renderedPalette({ doc: docRef, colors: 8 })).palette; } catch {}
      const refPath = path.join(DIR, `${slug(name)}-ref-${(profile.refs || []).length + 1}.jpg`);
      try { await op("preview", { doc: docRef, maxSize: 1568, format: "jpg", quality: 80, path: refPath.split("\\").join("/") }); (profile.refs ||= []).push(refPath); } catch {}
      profile.sources.push({ file: findings.document.path || docRef, name: findings.document.name, analyzedAt: new Date().toISOString(), layers: findings.structure.layers });
      profile.agg = mergeAgg(profile.agg, findings, palette);
    } finally {
      if (opened) { try { await op("closeDocument", { doc: docRef, save: false }); } catch {} }
    }
  }
  profile = derive(profile);
  write(profile);
  setActive(profile.name);
  return { saved: file(profile.name), guide: guideFile(profile.name), active: profile.name, summary: profile.summary, sources: profile.sources.map((s) => s.name) };
}

function mergeAgg(agg, f, renderPalette) {
  agg = agg || { colors: {}, gradients: [], typography: {}, effects: {}, blends: {}, fill: { fill: [], opacity: [] }, shapes: [], adjustments: {}, images: { smart: 0, linked: 0, embedded: 0, pixel: 0, libraries: {} }, structure: { layers: 0, groups: 0, hidden: 0, clipped: 0, pixelMasks: 0, vectorMasks: 0, copies: 0, defaultNames: 0, customNames: 0, groupNames: [], maxDepth: 0 }, texts: [], canvases: [], render: [] };
  agg.canvases.push({ name: f.document.name, width: f.document.width, height: f.document.height, resolution: f.document.resolution, mode: f.document.mode, bits: f.document.bitsPerChannel, profile: f.document.colorProfile, slides: f.slides, guides: f.guides.length });
  for (const c of f.colors) { const a = (agg.colors[c.hex] ||= { n: 0, src: {} }); a.n += c.n; for (const [k, v] of Object.entries(c.src)) a.src[k] = (a.src[k] || 0) + v; }
  agg.gradients.push(...f.gradients);
  for (const t of f.typography) { const k = `${t.font}|${t.size}|${t.tracking}`; const a = (agg.typography[k] ||= { ...t, n: 0, samples: [] }); a.n += t.n; for (const s of t.samples) if (a.samples.length < 3 && !a.samples.includes(s)) a.samples.push(s); }
  for (const e of f.effects) { const k = JSON.stringify(e.friendly); const a = (agg.effects[k] ||= { n: 0, layers: [], kinds: {}, friendly: e.friendly, raw: e.raw }); a.n += e.n; for (const l of e.layers) if (a.layers.length < 5 && !a.layers.includes(l)) a.layers.push(l); for (const [kk, v] of Object.entries(e.kinds)) a.kinds[kk] = (a.kinds[kk] || 0) + v; }
  for (const [k, v] of Object.entries(f.blends)) { const a = (agg.blends[k] ||= { n: 0, kinds: {}, names: [] }); a.n += v.n; for (const [kk, c] of Object.entries(v.kinds || {})) a.kinds[kk] = (a.kinds[kk] || 0) + c; for (const nm of v.names || []) if (a.names.length < 4 && !a.names.includes(nm)) a.names.push(nm); }
  agg.fill.fill.push(...f.fillHabit.fill); agg.fill.opacity.push(...f.fillHabit.opacity);
  agg.shapes.push(...f.shapes);
  for (const [k, v] of Object.entries(f.adjustments)) { const a = (agg.adjustments[k] ||= { n: 0, names: [] }); a.n += v.n; }
  for (const k of ["smart", "linked", "embedded", "pixel"]) agg.images[k] += f.images[k];
  for (const [k, v] of Object.entries(f.images.libraries)) agg.images.libraries[k] = (agg.images.libraries[k] || 0) + v;
  for (const k of ["layers", "groups", "hidden", "clipped", "pixelMasks", "vectorMasks", "copies", "defaultNames", "customNames"]) agg.structure[k] += f.structure[k];
  agg.structure.maxDepth = Math.max(agg.structure.maxDepth, f.structure.maxDepth);
  for (const g of f.structure.groupNames) if (agg.structure.groupNames.length < 12 && !agg.structure.groupNames.includes(g)) agg.structure.groupNames.push(g);
  agg.texts.push(...f.texts.map((t) => ({ ...t, canvasW: f.document.width, canvasH: f.document.height, slideW: f.slides.width })));
  if (renderPalette) agg.render.push(renderPalette);
  return agg;
}

// ---------- derivar perfil ----------
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function derive(p) {
  const a = p.agg, out = p;
  const c0 = a.canvases[0];
  out.canvas = { name: c0.name, width: c0.width, height: c0.height, resolution: c0.resolution, mode: c0.mode, bitsPerChannel: c0.bits, colorProfile: c0.profile, slides: c0.slides, hasGuides: c0.guides > 0 };

  // paleta: render + capas
  const total = Object.values(a.colors).reduce((s, c) => s + c.n, 0) || 1;
  const layerColors = Object.entries(a.colors).map(([hex, c]) => ({ hex, n: c.n, src: c.src })).sort((x, y) => y.n - x.n);
  const render = {};
  for (const r of a.render) for (const c of r) { const near = Object.keys(render).find((h) => dist(hex2rgb(h), hex2rgb(c.hex)) < 28); if (near) render[near] += c.pct; else render[c.hex] = c.pct; }
  const rc = Object.entries(render).map(([hex, v]) => ({ hex, share: Math.round((v / (a.render.length || 1)) * 10) / 10 })).sort((x, y) => y.share - x.share);
  const pal = [];
  const add = (hex, role, extra = {}) => { if (!hex || pal.some((q) => dist(hex2rgb(q.hex), hex2rgb(hex)) < 22)) return; pal.push({ name: colorName(hex), hex, role, ...extra }); };
  const textColors = layerColors.filter((c) => c.src["texto"]).sort((x, y) => (y.src["texto"] || 0) - (x.src["texto"] || 0));
  const bg = rc.find((c) => hsl(hex2rgb(c.hex))[2] < 0.12) || rc[0];
  if (bg) add(bg.hex, "fondo", { share: bg.share });
  if (textColors[0]) add(textColors[0].hex, "texto", { uses: textColors[0].src["texto"] });
  const glowish = layerColors.filter((c) => (c.src["resplandor"] || c.src["trazo"] || c.src["gradient"] || c.src["resplandor-interno"]) && hsl(hex2rgb(c.hex))[1] > 0.25);
  glowish.sort((x, y) => hsl(hex2rgb(y.hex))[1] * Math.log(y.n + 1) - hsl(hex2rgb(x.hex))[1] * Math.log(x.n + 1));
  if (glowish[0]) add(glowish[0].hex, "acento (brillo)", { uses: glowish[0].n });
  const darkTint = rc.filter((c) => { const [, s, l] = hsl(hex2rgb(c.hex)); return s > 0.25 && l < 0.35; })[0];
  if (darkTint) add(darkTint.hex, "color de marca profundo", { share: darkTint.share });
  for (const c of rc.slice(0, 8)) add(c.hex, "dominante del render", { share: c.share });
  for (const c of layerColors.slice(0, 10)) add(c.hex, "usado en capas", { uses: c.n });
  out.palette = { roles: pal.slice(0, 14), render: rc.slice(0, 8).map((c) => ({ ...c, name: colorName(c.hex) })), gradients: dedupGradients(a.gradients).slice(0, 8) };

  // tipografía
  const tl = Object.values(a.typography).sort((x, y) => y.size - x.size);
  const families = {};
  for (const t of tl) { const f = (families[t.family || t.font] ||= { family: t.family || t.font, styles: {}, n: 0 }); const sk = t.fromVariable ? `variable ${t.variableWeight}` : (t.style || t.font); f.styles[sk] = (f.styles[sk] || 0) + t.n; f.n += t.n; }
  const clusters = [];
  for (const t of tl) { const cl = clusters.find((c) => Math.abs(c.size - t.size) / c.size < 0.2 && c.font === t.font && Math.abs((c.items[0].tracking || 0) - (t.tracking || 0)) < 150); if (cl) { cl.n += t.n; cl.items.push(t); } else clusters.push({ size: t.size, font: t.font, n: t.n, items: [t] }); }
  clusters.sort((x, y) => y.size - x.size);
  const slideH = out.canvas.slides?.height || out.canvas.height;
  const weightOf = (t) => (t.variableWeight ? t.variableWeight : /thin|hairline/i.test(t.style || t.font) ? 100 : /extralight|ultralight/i.test(t.style || t.font) ? 200 : /light/i.test(t.style || t.font) ? 300 : /medium/i.test(t.style || t.font) ? 500 : /semibold|demi/i.test(t.style || t.font) ? 600 : /extrabold|heavy/i.test(t.style || t.font) ? 800 : /black|ultra/i.test(t.style || t.font) ? 900 : /bold/i.test(t.style || t.font) ? 700 : 400);
  // como mucho 6 presets: los más usados (ignora textos de un solo carácter)
  const keepSet = clusters.filter((c) => c.items.some((t) => (t.samples || []).some((x) => String(x).trim().length > 1))).sort((x, y) => y.n - x.n || y.size - x.size).slice(0, 6);
  const kept = (keepSet.length ? keepSet : clusters.slice(0, 6)).sort((x, y) => y.size - x.size);
  const heavy = kept.filter((c) => weightOf(c.items[0]) >= 650), light = kept.filter((c) => weightOf(c.items[0]) < 650);
  const roleOf = new Map();
  heavy.forEach((c, i) => roleOf.set(c, heavy.length === 1 ? "titular" : i === 0 ? "display" : i === 1 ? "titular" : `titular-${i}`));
  light.forEach((c, i) => roleOf.set(c, light.length === 1 ? "apoyo" : i === 0 ? "apoyo" : i === 1 ? "etiqueta" : `etiqueta-${i}`));
  const textPresets = {};
  for (const c of kept) {
    const t = c.items[0];
    let nm = roleOf.get(c), k = 2; while (textPresets[nm]) nm = `${roleOf.get(c)}-${k++}`;
    textPresets[nm] = { style: { font: t.staticFont || t.font, size: t.size, tracking: t.tracking, leading: (t.leading === "auto" || typeof t.leading !== "number" || t.leading < t.size * 1.05) ? "auto" : t.leading, color: t.color || "#FFFFFF", caps: t.caps !== "none" ? t.caps : undefined, variation: t.variation }, align: "center", sizeRel: Math.round((t.size / slideH) * 10000) / 10000, uses: c.n, examples: c.items.flatMap((x) => x.samples).slice(0, 3), ...(t.fromVariable ? { note: `fuente variable ${t.font} (peso ${t.variableWeight}); se usa ${t.staticFont}` } : {}) };
  }
  const uppers = a.texts.filter((t) => t.upper).length;
  const multi = a.texts.filter((t) => t.multiRun).length;
  const aligns = {}; a.texts.forEach((t) => { aligns[t.align] = (aligns[t.align] || 0) + 1; });
  const rotated = a.texts.filter((t) => Math.abs(t.rotation) > 1).length;
  out.typography = { families: Object.values(families).sort((x, y) => y.n - x.n), sizes: clusters.map((c) => ({ size: c.size, font: c.font, uses: c.n })), allCapsPct: pct(uppers, a.texts.length), mixedWeightsInOneBlock: multi, alignment: aligns, rotatedTexts: rotated };
  out.textPresets = { ...textPresets, ...(out.textPresets || {}) };

  // efectos: recetas
  const recipes = out.effectRecipes || {};
  const ef = Object.values(a.effects).sort((x, y) => y.n - x.n);
  ef.slice(0, 8).forEach((e) => {
    const nm = recipeName(e.friendly);
    let key = nm, i = 2; while (recipes[key] && recipes[key].auto !== true) key = `${nm}-${i++}`;
    recipes[key] = { auto: true, uses: e.n, onKinds: e.kinds, layers: e.layers, effects: e.friendly, raw: e.raw };
  });
  out.effectRecipes = recipes;

  // mezcla y opacidad
  const bl = Object.entries(a.blends).map(([k, v]) => ({ mode: k, uses: v.n, kinds: v.kinds, examples: v.names })).sort((x, y) => y.uses - x.uses);
  const totalL = a.structure.layers;
  const fillV = a.fill.fill.map((x) => x.v), opV = a.fill.opacity.map((x) => x.v);
  out.blendHabits = { modes: bl, fillOverOpacity: { fillAdjusted: fillV.length, opacityAdjusted: opV.length, typicalFill: median(fillV), fillRange: fillV.length ? [Math.min(...fillV), Math.max(...fillV)] : null, typicalOpacity: median(opV) } };

  // formas
  const rr = a.shapes.filter((s) => s.radiusRatio !== undefined);
  out.shapes = { count: a.shapes.length, rounded: rr.length, typicalRadiusRatio: median(rr.map((s) => s.radiusRatio)), fills: [...new Set(a.shapes.map((s) => s.fill).filter(Boolean))].slice(0, 6), withStroke: a.shapes.filter((s) => s.stroke).length, vectorMasks: a.shapes.filter((s) => s.vectorMask).length };

  out.images = { ...a.images };
  out.adjustments = Object.entries(a.adjustments).map(([k, v]) => ({ type: k, uses: v.n }));
  out.structure = { ...a.structure, hiddenPct: pct(a.structure.hidden, totalL), clippedPct: pct(a.structure.clipped, totalL), defaultNamesPct: pct(a.structure.defaultNames, totalL) };

  // maquetación de texto
  const centered = a.texts.filter((t) => Math.abs(t.cx - (Math.floor(t.cx / t.slideW) + 0.5) * t.slideW) < t.slideW * 0.12).length;
  out.layout = { textCenteredInSlidePct: pct(centered, a.texts.length), textBlocks: a.texts.length };

  out.summary = {
    canvas: `${out.canvas.width}×${out.canvas.height} (${out.canvas.slides?.count > 1 ? out.canvas.slides.count + " diapositivas " + out.canvas.slides.ratio : out.canvas.slides?.ratio || "único"})`,
    palette: out.palette.roles.slice(0, 5).map((c) => `${c.name} ${c.hex}`).join(", "),
    typography: out.typography.families.slice(0, 2).map((f) => f.family).join(" + "),
    recipes: Object.keys(out.effectRecipes),
    presets: Object.keys(out.textPresets),
  };
  return out;
}

function dedupGradients(gs) {
  const seen = new Set(), out = [];
  for (const g of gs) { const k = g.stops.map((s) => s.color + s.pos).join(); if (!seen.has(k)) { seen.add(k); out.push(g); } }
  return out;
}

function recipeName(fx) {
  const parts = [];
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const ds = arr(fx.dropShadow);
  if (ds.length) parts.push(ds.length > 1 ? `sombra-x${ds.length}` : "sombra");
  if (fx.innerShadow) parts.push("sombra-interna");
  if (fx.outerGlow) parts.push(`resplandor-${colorName(fx.outerGlow.color || "#888888").split(" ")[0]}`);
  if (fx.innerGlow) parts.push("brillo-interno");
  if (fx.bevelEmboss) parts.push("bisel");
  if (fx.satin) parts.push("satinado");
  if (fx.colorOverlay) parts.push("color");
  if (fx.gradientOverlay) parts.push("degradado");
  if (fx.stroke) parts.push("trazo");
  return parts.join("+") || "efecto";
}

// ---------- guía en palabras ----------
function buildGuide(p) {
  const L = [];
  const c = p.canvas, t = p.typography, b = p.blendHabits, s = p.shapes, st = p.structure, im = p.images;
  L.push(`# Estilo «${p.title || p.name}»`);
  if (p.description) L.push(p.description);
  L.push(`Aprendido de: ${p.sources.map((x) => x.name).join(", ")}.`);
  L.push("");
  L.push("## Lienzo y configuración");
  L.push(`- ${c.width}×${c.height} px · ${c.resolution} ppp · ${c.mode} ${c.bitsPerChannel} bits · perfil ${c.colorProfile || "sRGB"}.`);
  if (c.slides?.count > 1) L.push(`- Carrusel **panorámico continuo**: ${c.slides.count} diapositivas ${c.slides.ratio} de ${c.slides.width}×${c.slides.height} en un solo lienzo (el diseño fluye de una a otra). Crea el documento con ps_new_document slides:{count:${c.slides.count}, width:${c.slides.width}, height:${c.slides.height}} y exporta con ps_export mode:'slides'.`);
  else L.push(`- Formato por pieza: ${c.slides?.ratio || "libre"}.`);
  L.push("");
  L.push("## Paleta");
  for (const k of p.palette.roles) L.push(`- **${k.name}** \`${k.hex}\` — ${k.role}${k.share ? ` (${k.share}% del render)` : ""}`);
  if (p.palette.gradients.length) L.push(`- Degradados frecuentes: ` + p.palette.gradients.slice(0, 3).map((g) => g.stops.map((x) => x.color).join("→")).join(" · "));
  L.push("");
  L.push("## Tipografía");
  for (const f of t.families.slice(0, 3)) L.push(`- **${f.family}**: ${Object.entries(f.styles).map(([k, v]) => `${k} (${v})`).join(", ")}`);
  L.push(`- ${t.allCapsPct}% de los textos en MAYÚSCULAS · alineación ${Object.entries(t.alignment).map(([k, v]) => `${k} ${v}`).join(", ")}${t.mixedWeightsInOneBlock ? ` · ${t.mixedWeightsInOneBlock} bloques mezclan pesos (p. ej. Light + Black en el mismo título)` : ""}${t.rotatedTexts ? ` · ${t.rotatedTexts} textos girados (firma vertical)` : ""}.`);
  for (const [name, pr] of Object.entries(p.textPresets)) L.push(`- preset **${name}**: ${pr.style.font} ${pr.style.size}px, tracking ${pr.style.tracking}${pr.style.leading ? `, interlineado ${pr.style.leading}` : ""}, ${pr.style.color}${pr.examples?.length ? ` — ej. «${pr.examples[0]}»` : ""}`);
  L.push("");
  L.push("## Efectos (recetas)");
  for (const [name, r] of Object.entries(p.effectRecipes)) L.push(`- **${name}** (${r.uses} usos${r.onKinds ? ", sobre " + Object.keys(r.onKinds).join("/") : ""}): ${describeFx(r.effects)}`);
  L.push("");
  L.push("## Mezcla, opacidad y relleno");
  for (const m of b.modes.filter((x) => x.mode !== "passThrough" && x.mode !== "normal").slice(0, 6)) L.push(`- **${m.mode}** ×${m.uses}: ${Object.entries(m.kinds).map(([k, v]) => `${k} ${v}`).join(", ")}${m.examples?.length ? ` (p. ej. ${m.examples.slice(0, 2).join(", ")})` : ""}`);
  const fo = b.fillOverOpacity;
  if (fo.fillAdjusted > fo.opacityAdjusted) L.push(`- Prefiere bajar el **relleno (fill)** y no la opacidad: ${fo.fillAdjusted} capas con relleno ajustado (típico ${fo.typicalFill}%, rango ${fo.fillRange?.join("–")}%) frente a ${fo.opacityAdjusted} con opacidad. Así los efectos de capa conservan toda su fuerza.`);
  L.push("");
  L.push("## Formas, imágenes y estructura");
  if (s.count) L.push(`- ${s.count} formas; ${s.rounded} con esquinas redondeadas (${s.typicalRadiusRatio >= 0.9 ? "radio completo: forma de **arco/píldora**" : s.typicalRadiusRatio !== null ? "radio ≈ " + Math.round(s.typicalRadiusRatio * 100) + "% de la mitad del lado corto" : "radio n/d"}); ${s.vectorMasks} con máscara vectorial; ${s.withStroke} con trazo fino.`);
  L.push(`- Imágenes: ${im.smart} objetos inteligentes (${im.linked} vinculados, ${im.embedded} incrustados), ${im.pixel} fotos rasterizadas${Object.keys(im.libraries).length ? ", bibliotecas CC: " + Object.keys(im.libraries).join(", ") : ""}. Las fotos se recortan con máscaras de recorte (${st.clippedPct}% de las capas) y máscaras (${st.pixelMasks} de píxeles, ${st.vectorMasks} vectoriales).`);
  L.push(`- Capas: ${st.layers} en total, ${st.groups} grupos (hasta ${st.maxDepth + 1} niveles), ${st.hiddenPct}% ocultas (guarda versiones alternativas), ${st.copies} duplicados («copia»). ${st.defaultNamesPct}% con nombres por defecto: al construir, **nombra las capas con claridad**.`);
  if (p.adjustments.length) L.push(`- Ajustes: ${p.adjustments.map((x) => `${x.type} ×${x.uses}`).join(", ")}.`);
  if (p.layout.textBlocks) L.push(`- Maquetación: ${p.layout.textCenteredInSlidePct}% de los textos centrados en su diapositiva.`);
  if (p.notes?.length) { L.push(""); L.push("## Notas del diseñador"); p.notes.forEach((n) => L.push(`- ${n}`)); }
  L.push("");
  L.push("## Cómo construir una pieza en este estilo");
  L.push("1. Documento con el formato de arriba. Fondo oscuro con degradado hacia el color de marca profundo.");
  L.push("2. Fotos como objetos inteligentes recortadas en formas redondeadas; luz con capas en **screen**; textura de grano en **overlay**.");
  L.push("3. Titular con el preset más grande, apoyo en el más ligero con tracking amplio; mezcla pesos dentro del mismo bloque.");
  L.push("4. Efectos: usa las recetas de arriba (effects:{recipe:'nombre'}); sombras suaves apiladas + resplandor grande con ruido.");
  L.push("5. Mira el resultado con ps_preview y compara con las referencias antes de entregar.");
  return L.join("\n");
}

function describeFx(fx) {
  const out = [], arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const ds = arr(fx.dropShadow);
  if (ds.length) out.push(`${ds.length > 1 ? ds.length + " sombras apiladas" : "sombra"} (${ds.map((d) => `${d.size}px ${d.opacity}%`).join(", ")}; ${ds[0].color}, ${ds[0].blend})`);
  if (fx.innerShadow) out.push("sombra interior");
  if (fx.outerGlow) out.push(`resplandor ${fx.outerGlow.color} ${fx.outerGlow.size}px ${fx.outerGlow.opacity}% ${fx.outerGlow.blend}${fx.outerGlow.noise ? ", ruido " + fx.outerGlow.noise + "%" : ""}`);
  if (fx.innerGlow) out.push(`brillo interior ${fx.innerGlow.color}`);
  if (fx.bevelEmboss) out.push("bisel y relieve");
  if (fx.satin) out.push("satinado");
  if (fx.colorOverlay) out.push(`superposición de color ${arr(fx.colorOverlay).map((c) => c.color).join(", ")}`);
  if (fx.gradientOverlay) out.push("superposición de degradado " + arr(fx.gradientOverlay).map((g) => g.stops.map((s) => s.color).join("→")).join(" | "));
  if (fx.stroke) out.push(`trazo ${arr(fx.stroke).map((s) => `${s.size}px ${s.color || "degradado"} ${s.position}`).join(", ")}`);
  return out.join(" + ") || "—";
}

// ---------- API pública ----------
export function list() {
  const names = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [];
  return { active: activeName(), styles: names.map((n) => { const p = read(n); return { name: n, title: p?.title, summary: p?.summary, sources: p?.sources?.map((s) => s.name) }; }), folder: DIR };
}
export function get(name, section) {
  const n = name || activeName();
  if (!n) throw new Error("No hay estilo guardado. Usa ps_style_analyze con un PSD de la persona.");
  const p = read(n);
  if (!p) throw new Error(`No existe el estilo '${n}'. Guardados: ${list().styles.map((s) => s.name).join(", ") || "ninguno"}`);
  if (section === "guide" || !section) { const g = fs.readFileSync(guideFile(n), "utf8"); return section ? g : { guide: g, textPresets: Object.keys(p.textPresets), effectRecipes: Object.keys(p.effectRecipes), file: file(n) }; }
  if (section === "tokens") return { canvas: p.canvas, palette: p.palette, typography: p.typography, blendHabits: p.blendHabits, shapes: p.shapes, structure: p.structure };
  if (section === "recipes") return Object.fromEntries(Object.entries(p.effectRecipes).map(([k, v]) => [k, { uses: v.uses, effects: v.effects }]));
  if (section === "presets") return p.textPresets;
  return p;
}
export function refImages(name, max = 2) {
  const n = name || activeName();
  const p = n && read(n);
  return (p?.refs || []).filter((f) => fs.existsSync(f)).slice(0, max).map((f) => ({ data: fs.readFileSync(f).toString("base64"), mimeType: "image/jpeg", file: f }));
}
export function edit(a) {
  const n = a.name || activeName();
  const p = read(n);
  if (!p) throw new Error(`No existe el estilo '${n}'.`);
  if (a.textPreset) p.textPresets[a.textPreset.name] = { style: a.textPreset.style, align: a.textPreset.align || "center", user: true };
  if (a.recipe) p.effectRecipes[a.recipe.name] = { user: true, effects: a.recipe.effects || {}, blend: a.recipe.blend, fill: a.recipe.fill, opacity: a.recipe.opacity };
  if (a.color) { p.palette.roles = p.palette.roles.filter((c) => c.name !== a.color.name); p.palette.roles.unshift({ name: a.color.name, hex: a.color.hex.toUpperCase(), role: "definido por la persona" }); }
  if (a.note) (p.notes ||= []).push(a.note);
  if (a.delete) {
    const d = a.delete;
    if (d.kind === "textPreset") delete p.textPresets[d.name]; else if (d.kind === "recipe") delete p.effectRecipes[d.name]; else if (d.kind === "color") p.palette.roles = p.palette.roles.filter((c) => c.name !== d.name); else if (d.kind === "note") p.notes = (p.notes || []).filter((x) => x !== d.name);
  }
  write(p);
  if (a.activate || !activeName()) setActive(p.name);
  return { name: p.name, active: activeName(), presets: Object.keys(p.textPresets), recipes: Object.keys(p.effectRecipes) };
}
export async function saveRecipe(name, captured) {
  const n = activeName();
  const p = n && read(n);
  if (!p) throw new Error("No hay estilo activo donde guardar la receta. Crea uno con ps_style_analyze o ps_style_set.");
  p.effectRecipes[name] = { user: true, effects: captured.effects || {}, raw: captured.raw, blend: captured.blend, fill: captured.fill, opacity: captured.opacity };
  if (captured.text) {
    const r0 = captured.text.runs?.[0];
    if (r0) p.textPresets[name] = { style: { font: r0.font, size: r0.size, tracking: r0.tracking, leading: r0.leading, color: r0.color, caps: r0.caps === "allCaps" ? "all" : undefined }, align: captured.text.align || "center", user: true };
  }
  write(p);
}

// Sustituye preset / recipe por su contenido antes de llamar a Photoshop.
export async function resolve(a) {
  if (!a || typeof a !== "object") return a;
  const needs = a.preset || (a.effects && a.effects.recipe) || (a.runs || []).some((r) => r.preset);
  if (!needs) return a;
  const n = activeName();
  const p = n && read(n);
  if (!p) throw new Error("Usaste preset/recipe pero no hay estilo guardado. Crea uno con ps_style_analyze.");
  const out = { ...a };
  let k = 1;
  if (a.preset || (a.runs || []).some((r) => r.preset)) {
    try { const st = await op("status", {}); const d = st.documents.find((x) => x.name === st.active) || st.documents[0]; const slideH = p.canvas.slides?.height || p.canvas.height; if (d && slideH) k = d.height / slideH; } catch {}
  }
  const expand = (name, extra) => {
    const pr = p.textPresets[name];
    if (!pr) throw new Error(`No existe el preset '${name}'. Disponibles: ${Object.keys(p.textPresets).join(", ")}`);
    const style = { ...pr.style };
    if (style.size) style.size = Math.round(style.size * k * 10) / 10;
    if (typeof style.leading === "number") style.leading = Math.round(style.leading * k * 10) / 10;
    return { style: { ...style, ...(extra || {}) }, align: pr.align };
  };
  if (a.preset) {
    const e = expand(a.preset, a.style);
    out.style = e.style;
    if (!a.align && e.align) out.align = e.align;
    delete out.preset;
  }
  if (a.runs) out.runs = a.runs.map((r) => (r.preset ? { text: r.text, style: expand(r.preset, r.style).style } : r));
  if (a.effects && a.effects.recipe) {
    const r = p.effectRecipes[a.effects.recipe];
    if (!r) throw new Error(`No existe la receta '${a.effects.recipe}'. Disponibles: ${Object.keys(p.effectRecipes).join(", ")}`);
    const { recipe, ...rest } = a.effects;
    out.effects = r.raw ? { raw: r.raw, ...rest } : { ...r.effects, ...rest };
    if (r.blend && !a.blend) out.blend = r.blend;
    if (r.fill !== undefined && a.fill === undefined) out.fill = r.fill;
  }
  return out;
}

// ---------- ficha técnica del proyecto (configuración + recursos + estructura + estilo) ----------
export async function projectReport({ doc } = {}) {
  const [info, res, find, tree] = await Promise.all([op("docInfo", { doc }), op("resources", { doc }), op("analyzeStyle", { doc, budgetMs: 60000 }), op("layers", { doc, depth: 2 })]);
  const L = [];
  L.push(`# Ficha del proyecto · ${info.name}`);
  L.push("", "## Configuración");
  L.push(`- Tamaño ${info.width}×${info.height} px · ${info.resolution} ppp · ${info.mode} ${info.bitsPerChannel} bits · perfil ${info.colorProfile || "sin perfil incrustado"} · píxel ${info.pixelAspectRatio}`);
  if (find.slides.count > 1) L.push(`- Parece un carrusel panorámico: ${find.slides.count} diapositivas ${find.slides.ratio} de ${find.slides.width}×${find.slides.height}${info.guides.length ? " (con guías en los cortes)" : " (sin guías de corte: créalas con ps_set_document)"}.`);
  else L.push(`- Formato ${find.slides.ratio}.`);
  L.push(`- Archivo: ${info.path || "sin guardar"} · ${info.layerCount} capas (${Object.entries(info.kinds).map(([k, v]) => `${k} ${v}`).join(", ")}), ${info.groups} grupos, ${info.hiddenLayers} ocultas · canales ${info.channels.join("/")}${info.artboards.length ? " · " + info.artboards.length + " artboards" : ""}`);
  L.push("", "## Recursos que toma");
  L.push(`- **Fuentes** (${res.fonts.length}): ` + res.fonts.map((f) => `${f.postScriptName}${f.installed ? "" : " ⚠ no instalada"} → ${f.layers.slice(0, 3).join(", ")}`).join(" · "));
  L.push(`- **Vinculados** (${res.linkedFiles.length}): ` + (res.linkedFiles.map((f) => `${f.file}${f.library ? ` [biblioteca CC «${f.library}»]` : ""}${f.missing ? " ⚠ perdido" : ""}${f.changed ? " ⚠ modificado" : ""}`).join(" · ") || "ninguno"));
  L.push(`- **Incrustados** (${res.embeddedSmartObjects.length}): ` + (res.embeddedSmartObjects.map((f) => f.file || f.layer).slice(0, 12).join(", ") || "ninguno"));
  if (Object.keys(res.textColors).length) L.push(`- **Colores de texto**: ${Object.entries(res.textColors).map(([k, v]) => `${k} ×${v}`).join(", ")}`);
  if (res.problems.length) L.push(`- **Problemas**: ${res.problems.join("; ")}`);
  L.push("", "## Estructura (2 niveles)");
  const walk = (nodes, d) => { for (const n of nodes) { L.push(`${"  ".repeat(d)}- ${n.name} · ${n.kind}${n.blend ? " · " + n.blend : ""}${n.fill ? " · fill " + n.fill + "%" : ""}${n.clipped ? " · recortada" : ""}${n.mask ? " · máscara" : ""}${n.effects ? " · fx: " + n.effects.join("+") : ""}${n.visible === false ? " · oculta" : ""}${n.text ? ` · «${String(n.text).replace(/\n/g, " / ").slice(0, 40)}»` : ""}`); if (n.children) walk(n.children, d + 1); } };
  walk(tree.layers.slice(0, 40), 0);
  L.push("", "## Cómo está definido el diseño");
  L.push("- **Tipografía**: " + (find.typography.slice(0, 6).map((t) => `${t.staticFont || t.font} ${t.size}px tracking ${t.tracking}`).join(" · ") || "sin texto"));
  L.push("- **Color** (capas): " + find.colors.slice(0, 8).map((c) => `${c.hex} ${colorName(c.hex)}`).join(", "));
  L.push("- **Efectos**: " + (find.effects.slice(0, 4).map((e) => `${e.n}× ${describeFx(e.friendly)}`).join(" | ") || "ninguno"));
  L.push("- **Mezcla**: " + Object.entries(find.blends).filter(([k]) => k !== "passThrough" && k !== "normal").map(([k, v]) => `${k} ×${v.n}`).join(", "));
  const fo = find.fillHabit;
  if (fo.fill.length || fo.opacity.length) L.push(`- **Opacidad vs relleno**: ${fo.fill.length} capas con fill ajustado, ${fo.opacity.length} con opacidad ajustada.`);
  L.push(`- **Imágenes**: ${find.images.smart} objetos inteligentes (${find.images.linked} vinculados), ${find.images.pixel} fotos rasterizadas; ${find.structure.clipped} capas recortadas, ${find.structure.pixelMasks} máscaras de píxeles, ${find.structure.vectorMasks} vectoriales.`);
  return L.join("\n");
}
