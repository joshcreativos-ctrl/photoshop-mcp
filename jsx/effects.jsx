// Estilos de capa (efectos): sombras multiples, resplandores, bisel, satinado, superposiciones, trazo.
// Esquema amigable (entrada y salida):
//  dropShadow / innerShadow: {color, opacity, blend, angle, distance, spread, size, noise, contour, knockout, useGlobalLight}
//  outerGlow / innerGlow:    {color, opacity, blend, technique:"softer"|"precise", spread, size, noise, range, source:"edge"|"center"}
//  bevelEmboss:              {style, technique, depth, direction, size, soften, angle, altitude, highlight:{color,opacity,blend}, shadow:{...}}
//  satin:                    {color, opacity, blend, angle, distance, size, invert}
//  colorOverlay:             {color, opacity, blend}
//  gradientOverlay:          {stops:[{color,pos,opacity}], style, angle, scale, reverse, align, dither, offset:{x,y}, opacity, blend}
//  stroke:                   {size, position:"outside"|"inside"|"center", color | stops, opacity, blend}
//  dropShadow, innerShadow, colorOverlay, gradientOverlay y stroke aceptan una lista (varias instancias).
//  raw: <layerEffects exacto> (receta capturada con ps_capture_style).
(function () {
  var U = VZ.util, AM = VZ.am, OPS = VZ.ops;

  function pct(v) { return { _u: "percentUnit", v: v }; }
  function px(v) { return { _u: "pixelsUnit", v: v }; }
  function ang(v) { return { _u: "angleUnit", v: v }; }
  function contour(name) { return { _c: "shapeCurveType", name: name || "$$$/Contours/Defaults/Linear=Linear" }; }
  function hex(c) { return U.amHex(c); }
  function en(e) { return e && e._e ? e._e[1] : e; }
  function base(s, defBlend) { return { enabled: s.enabled !== false, present: true, showInDialog: true, mode: U.blendAM(s.blend || defBlend) }; }
  function list(v) { return v instanceof Array ? v : [v]; }

  function shadowObj(s, cls, isDrop) {
    var o = base(s, "multiply");
    o._c = cls;
    o.color = U.rgbObj(s.color || "#000000");
    o.opacity = pct(U.pick(s, "opacity", 75));
    var glob = U.has(s, "useGlobalLight") ? !!s.useGlobalLight : !U.has(s, "angle");
    o.useGlobalAngle = glob;
    o.localLightingAngle = ang(U.pick(s, "angle", 120));
    o.distance = px(U.pick(s, "distance", 5));
    o.chokeMatte = px(U.pick(s, "spread", 0));
    o.blur = px(U.pick(s, "size", 5));
    o.noise = pct(U.pick(s, "noise", 0));
    o.antiAlias = !!s.antiAlias;
    o.transferSpec = contour(s.contour);
    if (isDrop) o.layerConceals = s.knockout !== false;
    return o;
  }
  function glowObj(s, cls) {
    var o = base(s, cls === "outerGlow" ? "screen" : "screen");
    o._c = cls;
    o.color = U.rgbObj(s.color || "#FFFFBE");
    o.opacity = pct(U.pick(s, "opacity", 75));
    o.glowTechnique = { _e: ["matteTechnique", s.technique === "precise" ? "preciseMatte" : "softMatte"] };
    o.chokeMatte = px(U.pick(s, "spread", 0));
    o.blur = px(U.pick(s, "size", 5));
    o.noise = pct(U.pick(s, "noise", 0));
    o.shadingNoise = pct(0);
    o.antiAlias = !!s.antiAlias;
    o.transferSpec = contour(s.contour);
    o.inputRange = pct(U.pick(s, "range", 50));
    if (cls === "innerGlow") o.innerGlowSource = { _e: ["innerGlowSourceType", s.source === "center" ? "centerGlow" : "edgeGlow"] };
    return o;
  }
  var BEVEL_STYLE = { outer: "outerBevel", inner: "innerBevel", emboss: "emboss", pillow: "pillowEmboss", strokeEmboss: "strokeEmboss" };
  var BEVEL_TECH = { smooth: "softMatte", chiselHard: "preciseMatte", chiselSoft: "slopeLimitMatte" };
  function bevelObj(s) {
    var hl = s.highlight || {}, sh = s.shadow || {};
    var o = base(s, "screen"); delete o.mode;
    o._c = "bevelEmboss";
    o.highlightMode = U.blendAM(hl.blend || "screen");
    o.highlightColor = U.rgbObj(hl.color || "#FFFFFF");
    o.highlightOpacity = pct(U.pick(hl, "opacity", 75));
    o.shadowMode = U.blendAM(sh.blend || "multiply");
    o.shadowColor = U.rgbObj(sh.color || "#000000");
    o.shadowOpacity = pct(U.pick(sh, "opacity", 75));
    o.bevelTechnique = { _e: ["bevelTechnique", BEVEL_TECH[s.technique || "smooth"] || "softMatte"] };
    o.bevelStyle = { _e: ["bevelEmbossStyle", BEVEL_STYLE[s.style || "inner"] || "innerBevel"] };
    o.useShape = false; o.useTexture = false;
    o.antialiasGloss = !!s.antiAlias;
    o.softness = px(U.pick(s, "soften", 0));
    o.useGlobalAngle = U.has(s, "useGlobalLight") ? !!s.useGlobalLight : !U.has(s, "angle");
    o.localLightingAngle = ang(U.pick(s, "angle", 120));
    o.localLightingAltitude = ang(U.pick(s, "altitude", 30));
    o.strengthRatio = { _i: Math.round(U.pick(s, "depth", 100)) };
    o.blur = px(U.pick(s, "size", 5));
    o.bevelDirection = { _e: ["bevelEmbossDirection", s.direction === "down" ? "stampOut" : "stampIn"] };
    o.transferSpec = contour(s.contour);
    return o;
  }
  function satinObj(s) {
    var o = base(s, "multiply");
    o._c = "chromeFX";
    o.color = U.rgbObj(s.color || "#000000");
    o.opacity = pct(U.pick(s, "opacity", 50));
    o.localLightingAngle = ang(U.pick(s, "angle", 19));
    o.distance = px(U.pick(s, "distance", 11));
    o.blur = px(U.pick(s, "size", 14));
    o.invert = s.invert !== false;
    o.antiAlias = !!s.antiAlias;
    o.transferSpec = contour(s.contour || "Gaussian");
    return o;
  }
  function colorOverlayObj(s) { var o = base(s, "normal"); o._c = "solidFill"; o.color = U.rgbObj(s.color || "#FFFFFF"); o.opacity = pct(U.pick(s, "opacity", 100)); return o; }
  function gradientOverlayObj(s) {
    var o = base(s, "normal");
    o._c = "gradientFill";
    o.opacity = pct(U.pick(s, "opacity", 100));
    o.gradient = U.gradientObj(s.gradient || s);
    o.angle = ang(U.pick(s, "angle", 90));
    o.type = { _e: ["gradientType", s.style || "linear"] };
    o.reverse = !!s.reverse;
    o.dither = !!s.dither;
    o["#gs99"] = { _e: ["gradientInterpolationMethodType", "smooth"] };
    o.align = s.align !== false;
    o.scale = pct(U.pick(s, "scale", 100));
    var off = s.offset || {};
    o.offset = { _c: "paint", horizontal: pct(U.pick(off, "x", 0)), vertical: pct(U.pick(off, "y", 0)) };
    return o;
  }
  function strokeObj(s) {
    var o = base(s, "normal");
    o._c = "frameFX";
    o.style = { _e: ["frameStyle", { outside: "outsetFrame", inside: "insetFrame", center: "centeredFrame" }[s.position || "outside"] || "outsetFrame"] };
    var grad = s.gradient || s.stops;
    o.paintType = { _e: ["frameFill", grad ? "gradientFill" : "solidColor"] };
    o.opacity = pct(U.pick(s, "opacity", 100));
    o.size = px(U.pick(s, "size", 3));
    if (grad) { o.gradient = U.gradientObj(s.gradient || s); o.angle = ang(U.pick(s, "angle", 90)); o.type = { _e: ["gradientType", s.style || "linear"] }; o.reverse = !!s.reverse; o.dither = !!s.dither; o.align = s.align !== false; o.scale = pct(U.pick(s, "scale", 100)); }
    else o.color = U.rgbObj(s.color || "#000000");
    o.overprint = false;
    return o;
  }
  function multi(v, fn) { var out = [], a = list(v); for (var i = 0; i < a.length; i++) out.push(fn(a[i])); return out; }

  // friendly -> objeto layerEffects (solo lo indicado)
  U.fxBuild = function (spec) {
    var o = {};
    if (spec.dropShadow) o.dropShadowMulti = multi(spec.dropShadow, function (s) { return shadowObj(s, "dropShadow", true); });
    if (spec.innerShadow) o.innerShadowMulti = multi(spec.innerShadow, function (s) { return shadowObj(s, "innerShadow", false); });
    if (spec.outerGlow) o.outerGlow = glowObj(spec.outerGlow, "outerGlow");
    if (spec.innerGlow) o.innerGlow = glowObj(spec.innerGlow, "innerGlow");
    if (spec.bevelEmboss) o.bevelEmboss = bevelObj(spec.bevelEmboss);
    if (spec.satin) o.chromeFX = satinObj(spec.satin);
    if (spec.colorOverlay) o.solidFillMulti = multi(spec.colorOverlay, colorOverlayObj);
    if (spec.gradientOverlay) o.gradientFillMulti = multi(spec.gradientOverlay, gradientOverlayObj);
    if (spec.stroke) o.frameFXMulti = multi(spec.stroke, strokeObj);
    return o;
  };

  // layerEffects (legible) -> esquema amigable
  function shadowF(s, drop) {
    var o = { blend: U.blendNameAM(s.mode), color: hex(s.color), opacity: s.opacity.v, angle: s.useGlobalAngle ? "global" : s.localLightingAngle.v, distance: s.distance.v, spread: s.chokeMatte.v, size: s.blur.v };
    if (s.noise && s.noise.v) o.noise = s.noise.v;
    if (drop && s.layerConceals === false) o.knockout = false;
    if (s.transferSpec && s.transferSpec.name && !/Linear|Lineal/.test(s.transferSpec.name)) o.contour = s.transferSpec.name;
    return o;
  }
  U.fxFriendly = function (fx) {
    var out = {}, disabled = 0;
    function add(key, v) { if (!out[key]) out[key] = []; out[key].push(v); }
    var i, a;
    a = fx.dropShadowMulti || (fx.dropShadow ? [fx.dropShadow] : []); for (i = 0; i < a.length; i++) { if (a[i].enabled) add("dropShadow", shadowF(a[i], true)); else disabled++; }
    a = fx.innerShadowMulti || (fx.innerShadow ? [fx.innerShadow] : []); for (i = 0; i < a.length; i++) { if (a[i].enabled) add("innerShadow", shadowF(a[i], false)); else disabled++; }
    ["outerGlow", "innerGlow"].forEach(function (k) {
      var g = fx[k]; if (!g) return;
      if (!g.enabled) { disabled++; return; }
      var o = { blend: U.blendNameAM(g.mode), color: hex(g.color), opacity: g.opacity.v, technique: en(g.glowTechnique) === "preciseMatte" ? "precise" : "softer", spread: g.chokeMatte.v, size: g.blur.v, range: g.inputRange && g.inputRange.v };
      if (g.noise && g.noise.v) o.noise = g.noise.v;
      if (k === "innerGlow" && g.innerGlowSource) o.source = en(g.innerGlowSource) === "centerGlow" ? "center" : "edge";
      if (g.gradient) o.gradient = gradientF(g.gradient);
      add(k, o);
    });
    if (fx.bevelEmboss) {
      var b = fx.bevelEmboss;
      if (b.enabled) add("bevelEmboss", { style: b.bevelStyle && en(b.bevelStyle), technique: b.bevelTechnique && en(b.bevelTechnique), depth: b.strengthRatio, size: b.blur && b.blur.v, soften: b.softness && b.softness.v, angle: b.useGlobalAngle ? "global" : b.localLightingAngle.v, altitude: b.localLightingAltitude && b.localLightingAltitude.v, direction: b.bevelDirection && en(b.bevelDirection), highlight: { blend: U.blendNameAM(b.highlightMode), color: hex(b.highlightColor), opacity: b.highlightOpacity && b.highlightOpacity.v }, shadow: { blend: U.blendNameAM(b.shadowMode), color: hex(b.shadowColor), opacity: b.shadowOpacity && b.shadowOpacity.v } }); else disabled++;
    }
    if (fx.chromeFX) { var c = fx.chromeFX; if (c.enabled) add("satin", { blend: U.blendNameAM(c.mode), color: hex(c.color), opacity: c.opacity.v, angle: c.localLightingAngle.v, distance: c.distance.v, size: c.blur.v, invert: c.invert }); else disabled++; }
    a = fx.solidFillMulti || (fx.solidFill ? [fx.solidFill] : []); for (i = 0; i < a.length; i++) { if (a[i].enabled) add("colorOverlay", { blend: U.blendNameAM(a[i].mode), color: hex(a[i].color), opacity: a[i].opacity.v }); else disabled++; }
    a = fx.gradientFillMulti || (fx.gradientFill ? [fx.gradientFill] : []); for (i = 0; i < a.length; i++) { var g2 = a[i]; if (g2.enabled) add("gradientOverlay", { blend: U.blendNameAM(g2.mode), opacity: g2.opacity.v, stops: gradientF(g2.gradient), style: en(g2.type), angle: g2.angle && g2.angle.v, scale: g2.scale && g2.scale.v, reverse: g2.reverse, align: g2.align, dither: g2.dither, offset: g2.offset ? { x: g2.offset.horizontal.v, y: g2.offset.vertical.v } : undefined }); else disabled++; }
    a = fx.frameFXMulti || (fx.frameFX ? [fx.frameFX] : []); for (i = 0; i < a.length; i++) { var s = a[i]; if (s.enabled) { var so = { blend: U.blendNameAM(s.mode), opacity: s.opacity.v, size: s.size.v, position: { outsetFrame: "outside", insetFrame: "inside", centeredFrame: "center" }[en(s.style)] || en(s.style) }; if (s.color) so.color = hex(s.color); if (s.gradient) so.stops = gradientF(s.gradient); add("stroke", so); } else disabled++; }
    if (fx.patternFill && fx.patternFill.enabled) add("patternOverlay", { blend: U.blendNameAM(fx.patternFill.mode), opacity: fx.patternFill.opacity.v });
    // si hay una sola instancia se entrega como objeto
    for (var k in out) if (out.hasOwnProperty(k) && out[k].length === 1) out[k] = out[k][0];
    if (disabled) out._disabledInstances = disabled;
    return out;
  };
  function gradientF(g) {
    var out = [];
    if (!g || !g.colors) return out;
    for (var i = 0; i < g.colors.length; i++) {
      var cs = g.colors[i], c = cs.color;
      var col = c && c.red !== undefined ? hex(c) : (c && c.redFloat !== undefined ? U.hex({ r: c.redFloat * 255, g: c.greenFloat * 255, b: c.blueFloat * 255 }) : null);
      var st = { color: col, pos: U.round(cs.location / 40.96, 1) };
      out.push(st);
    }
    if (g.transparency) { for (var j = 0; j < g.transparency.length && j < out.length; j++) if (g.transparency[j].opacity.v !== 100) out[j].opacity = g.transparency[j].opacity.v; }
    return out;
  }

  // ---------- aplicar ----------
  function layerEffectsRef() { return { _ref: [{ cls: "property", form: "property", value: "layerEffects" }, { cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }; }
  // Lee los efectos actuales en modo exacto
  U.fxExact = function (L) { var d = U.layerDesc(L, true); return d.layerEffects || null; };
  U.applyEffectsRaw = function (L, raw) {
    U.selectLayer(L);
    var o = VZ.json.parse(VZ.json.stringify(raw));
    o._c = "layerEffects";
    AM.play("set", { "null": layerEffectsRef(), to: o });
  };
  U.applyEffects = function (L, spec, mode) {
    U.selectLayer(L);
    if (spec.clear === true || spec === "clear") { AM.play("set", { "null": layerEffectsRef(), to: { _c: "layerEffects", scale: pct(100) } }); return; }
    var cur = (mode === "merge") ? U.fxExact(L) : null;
    var o = cur ? VZ.json.parse(VZ.json.stringify(cur)) : { scale: pct(100) };
    o._c = "layerEffects";
    if (spec.raw) { var r = VZ.json.parse(VZ.json.stringify(spec.raw)); for (var k in r) if (r.hasOwnProperty(k)) o[k] = r[k]; }
    var built = U.fxBuild(spec);
    for (var k2 in built) if (built.hasOwnProperty(k2)) o[k2] = built[k2];
    AM.play("set", { "null": layerEffectsRef(), to: o });
  };

  OPS.layerStyle = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    if (A.copyFrom) {
      var S = U.findLayer(A.copyFrom, doc);
      var fxs = U.fxExact(S);
      if (!fxs) U.fail("La capa '" + S.name + "' no tiene efectos para copiar.");
      U.applyEffectsRaw(L, fxs);
    }
    if (A.effects) U.applyEffects(L, A.effects, A.mode || "replace");
    if (A.disable === true || A.disable === false) { U.selectLayer(L); AM.play(A.disable ? "disableLayerStyle" : "enableLayerStyle", { "null": { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] } }); }
    var d = U.layerDesc(L, false);
    return { layer: L.name, effects: d.layerEffects ? U.fxFriendly(d.layerEffects) : {} };
  };

  // Captura el estilo de una capa como receta reutilizable (exacta) + version legible.
  OPS.captureStyle = function (A) {
    var doc = U.doc(A.doc);
    var L = U.findLayer(A.layer, doc);
    var exact = U.fxExact(L);
    var out = { layer: L.name, kind: U.kindName(U.layerDesc(L, false)) };
    if (exact) { out.effects = U.fxFriendly(U.layerDesc(L, false).layerEffects); out.raw = exact; }
    var d = U.layerDesc(L, false);
    out.blend = U.blendNameAM(d.mode); out.opacity = U.round(d.opacity / 2.55, 1); out.fill = d.fillOpacity !== undefined ? U.round(d.fillOpacity / 2.55, 1) : 100;
    if (d.textKey) out.text = U.textInfo(L, d);
    if (d.AGMStrokeStyleInfo) out.shapeStroke = U.strokeFriendly(d.AGMStrokeStyleInfo);
    return out;
  };
})();
