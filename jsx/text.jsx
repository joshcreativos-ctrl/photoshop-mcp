// Texto: crear, editar y leer con todo el control tipografico (fuentes, tracking, interlineado, estilos por tramo...).
(function () {
  var U = VZ.util, AM = VZ.am, OPS = VZ.ops;
  var CR = String.fromCharCode(13);

  // ---------- fuentes ----------
  var fontIndex = null;
  function loadFonts() {
    if (fontIndex) return fontIndex;
    fontIndex = [];
    for (var i = 0; i < app.fonts.length; i++) {
      var f = app.fonts[i];
      fontIndex.push({ ps: f.postScriptName, family: f.family, style: f.style, name: f.name });
    }
    return fontIndex;
  }
  U.fonts = loadFonts;
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  var WEIGHTS = { 100: "thin", 200: "extralight", 300: "light", 400: "regular", 500: "medium", 600: "semibold", 700: "bold", 800: "extrabold", 900: "black" };

  // Resuelve una fuente a {ps,family,style}. spec: "Montserrat-Black" | "Montserrat Black" | {family,style|weight}
  U.findFont = function (spec, fallbackWeight) {
    if (typeof spec === "string") { // camino rapido: nombre PostScript exacto, sin recorrer las 1000+ fuentes
      try { var ff = app.fonts.getByName(spec); if (ff) return { ps: ff.postScriptName, family: ff.family, style: ff.style, name: ff.name }; } catch (e0) {}
    }
    // Instancia de fuente variable ("Montserrat_736.000wght_0ital"): se traduce a la familia y al peso estatico mas cercano.
    if (typeof spec === "string" && spec.indexOf("wght") > 0 && spec.indexOf("_") > 0) {
      var wi = spec.indexOf("wght"), ui = spec.indexOf("_"), wv = parseFloat(spec.substring(ui + 1, wi));
      if (!isNaN(wv)) {
        var bestW = 400, bd = 9999;
        for (var wk in WEIGHTS) { if (WEIGHTS.hasOwnProperty(wk) && Math.abs(Number(wk) - wv) < bd) { bd = Math.abs(Number(wk) - wv); bestW = Number(wk); } }
        var italicVar = spec.indexOf("1ital") > 0;
        var resolved = U.findFont({ family: spec.substring(0, ui), weight: bestW, style: italicVar ? WEIGHTS[bestW] + " italic" : undefined });
        if (resolved) { resolved.fromVariable = spec; resolved.variableWeight = wv; return resolved; }
      }
    }
    var all = loadFonts(), i;
    var family = null, style = null;
    if (spec && typeof spec === "object") { family = spec.family; style = spec.style || (spec.weight ? WEIGHTS[spec.weight] : null); if (spec.ps) spec = spec.ps; }
    if (typeof spec === "string") {
      for (i = 0; i < all.length; i++) if (all[i].ps === spec) return all[i];
      var n = norm(spec);
      for (i = 0; i < all.length; i++) if (norm(all[i].ps) === n || norm(all[i].name) === n || norm(all[i].family + all[i].style) === n) return all[i];
      if (!family) family = spec;
    }
    if (family) {
      var nf = norm(family), cand = [];
      for (i = 0; i < all.length; i++) if (norm(all[i].family) === nf) cand.push(all[i]);
      if (!cand.length) { // la familia puede venir con el estilo pegado ("Montserrat Black")
        for (i = 0; i < all.length; i++) { var full = norm(all[i].family + all[i].style); if (full === nf || (nf.indexOf(norm(all[i].family)) === 0 && norm(all[i].style) === nf.substr(norm(all[i].family).length))) cand.push(all[i]); }
      }
      if (cand.length) {
        var want = style ? norm(style) : (fallbackWeight ? WEIGHTS[fallbackWeight] : "regular");
        for (i = 0; i < cand.length; i++) if (norm(cand[i].style) === want) return cand[i];
        for (i = 0; i < cand.length; i++) if (norm(cand[i].style) === "regular" || norm(cand[i].style) === "roman" || norm(cand[i].style) === "book") return cand[i];
        return cand[0];
      }
    }
    return null;
  };
  U.mustFont = function (spec) {
    var f = U.findFont(spec);
    if (!f) U.fail("No encontre la fuente " + VZ.json.stringify(spec) + ". Usa ps_fonts para buscar una instalada.");
    return f;
  };

  // ---------- lectura amigable ----------
  function colorOf(c) { return U.amHex(c); }
  function enumOf(e) { return e && e._e ? e._e[1] : e; }
  function unitOf(u) { return u && u.v !== undefined ? u.v : u; }

  var ALIGN = { left: "left", center: "center", right: "right", justifyAll: "justify-all", justifyLeft: "justify-left", justifyCenter: "justify-center", justifyRight: "justify-right" };

  U.textInfo = function (L, d) {
    d = d || U.layerDesc(L, false);
    var tk = d.textKey;
    if (!tk) return null;
    var info = { text: String(tk.textKey).split(CR).join("\n") };
    var tr = tk.transform || { xx: 1, xy: 0, yx: 0, yy: 1 };
    info.scale = U.round(Math.sqrt(tr.xx * tr.xx + tr.xy * tr.xy), 4);
    info.rotation = U.round(Math.atan2(tr.xy, tr.xx) * 180 / Math.PI, 2);
    var shape = tk.textShape && tk.textShape[0];
    info.kind = shape && enumOf(shape.char) === "box" ? "paragraph" : "point";
    info.orientation = enumOf(tk.orientation);
    info.antiAlias = enumOf(tk.antiAlias);
    if (tk.warp && enumOf(tk.warp.warpStyle) !== "warpNone") info.warp = { style: enumOf(tk.warp.warpStyle), bend: tk.warp.warpValue };
    var b = d.bounds;
    info.bounds = { x: unitOf(b.left), y: unitOf(b.top), width: unitOf(b.width), height: unitOf(b.height) };
    info.runs = [];
    var rs = tk.textStyleRange || [];
    for (var i = 0; i < rs.length; i++) {
      var s = rs[i].textStyle || {}, from = rs[i].from, to = rs[i].to;
      var run = { from: from, to: to, text: String(tk.textKey).substring(from, to).split(CR).join("\n") };
      run.font = s.fontPostScriptName; run.family = s.fontName; run.style = s.fontStyleName;
      run.size = U.round(unitOf(s.impliedFontSize !== undefined ? s.impliedFontSize : s.size), 2);
      run.sizeBase = U.round(unitOf(s.size), 2);
      run.color = colorOf(s.color);
      run.tracking = s.tracking === undefined ? 0 : s.tracking;
      if (s.autoLeading) run.leading = "auto"; else if (s.leading !== undefined) run.leading = U.round(unitOf(s.impliedLeading !== undefined ? s.impliedLeading : s.leading), 2);
      var caps = enumOf(s.fontCaps); if (caps && caps !== "normal") run.caps = caps;
      if (s.baselineShift && unitOf(s.baselineShift)) run.baselineShift = unitOf(s.baselineShift);
      if (s.horizontalScale !== undefined && s.horizontalScale !== 100) run.hScale = s.horizontalScale;
      if (s.verticalScale !== undefined && s.verticalScale !== 100) run.vScale = s.verticalScale;
      if (s.syntheticBold) run.fauxBold = true;
      if (s.syntheticItalic) run.fauxItalic = true;
      var ul = enumOf(s.underline); if (ul && ul !== "underlineOff") run.underline = true;
      var st = enumOf(s.strikethrough); if (st && st !== "strikethroughOff") run.strike = true;
      var kern = enumOf(s.autoKern); if (kern) run.kerning = kern === "metricsKern" ? "metrics" : (kern === "opticalKern" ? "optical" : kern);
      if (s.fontDesignAxes && s.fontDesignAxes.length) { run.variation = []; for (var a = 0; a < s.fontDesignAxes.length; a++) run.variation.push(s.fontDesignAxes[a].fontDesignAxesVectors); }
      if (s.fontAvailable === false) run.fontMissing = true;
      info.runs.push(run);
    }
    var ps = tk.paragraphStyleRange || [];
    if (ps.length) {
      var p0 = ps[0].paragraphStyle || {};
      info.align = ALIGN[enumOf(p0.align)] || enumOf(p0.align) || "left";
      if (p0.spaceBefore) info.spaceBefore = unitOf(p0.spaceBefore);
      if (p0.spaceAfter) info.spaceAfter = unitOf(p0.spaceAfter);
      if (p0.firstLineIndent) info.firstLineIndent = unitOf(p0.firstLineIndent);
    }
    return info;
  };

  // ---------- friendly -> estilo de tramo (Action Manager) ----------
  var CAPS = { none: "normal", all: "allCaps", small: "smallCaps" };
  function rgbObj(c) { var k = U.rgb(c); return { red: k.r, grain: k.g, blue: k.b, _c: "RGBColor" }; }
  U.rgbObj = rgbObj;
  U.styleToAM = function (st, base) {
    var o = base || {}, f;
    if (U.has(st, "font") || U.has(st, "weight") || U.has(st, "family")) {
      f = U.mustFont(U.has(st, "font") ? st.font : { family: st.family, weight: st.weight, style: st.fontStyle });
      o.fontPostScriptName = f.ps; o.fontName = f.family; o.fontStyleName = f.style; o.fontAvailable = true;
      delete o.fontDesignAxes;
    }
    if (U.has(st, "size")) { o.size = { _u: "pixelsUnit", v: st.size }; delete o.impliedFontSize; }
    if (U.has(st, "color")) o.color = rgbObj(st.color);
    if (U.has(st, "tracking")) o.tracking = { _i: Math.round(st.tracking) };
    if (U.has(st, "leading")) {
      if (st.leading === "auto") o.autoLeading = true;
      else { o.autoLeading = false; o.leading = { _u: "pixelsUnit", v: st.leading }; }
      delete o.impliedLeading;
    }
    if (U.has(st, "kerning")) {
      if (typeof st.kerning === "number") { o.autoKern = { _e: ["autoKern", "metricsKern"] }; o.kerning = { _i: st.kerning }; }
      else o.autoKern = { _e: ["autoKern", st.kerning === "optical" ? "opticalKern" : (st.kerning === "none" ? "manual" : "metricsKern")] };
    }
    if (U.has(st, "baselineShift")) o.baselineShift = { _u: "pixelsUnit", v: st.baselineShift };
    if (U.has(st, "caps")) o.fontCaps = { _e: ["fontCaps", CAPS[st.caps] || "normal"] };
    if (U.has(st, "hScale")) o.horizontalScale = st.hScale;
    if (U.has(st, "vScale")) o.verticalScale = st.vScale;
    if (U.has(st, "fauxBold")) o.syntheticBold = !!st.fauxBold;
    if (U.has(st, "fauxItalic")) o.syntheticItalic = !!st.fauxItalic;
    if (U.has(st, "underline")) o.underline = { _e: ["underline", st.underline ? "underlineOnLeftInVertical" : "underlineOff"] };
    if (U.has(st, "strike")) o.strikethrough = { _e: ["strikethrough", st.strike ? "strikethroughOn" : "strikethroughOff"] };
    if (U.has(st, "ligatures")) { o.ligature = !!st.ligatures; o.contextualLigatures = !!st.ligatures; }
    if (U.has(st, "variation")) { var ax = []; for (var i = 0; i < st.variation.length; i++) ax.push({ fontDesignAxesVectors: st.variation[i], _c: "fontDesignAxes" }); o.fontDesignAxes = ax; }
    return o;
  };

  var JUST = { left: "left", center: "center", right: "right", justify: "justifyLeft", "justify-left": "justifyLeft", "justify-center": "justifyCenter", "justify-right": "justifyRight", "justify-all": "justifyAll" };

  // Escribe textKey completo (con tramos y parrafos). runs: [{text, style}] ya concatenados en `contents`.
  function writeTextKey(L, tk) {
    var target = AM.ref("textLayer", "enum", "ordinal", "targetEnum");
    var d = new ActionDescriptor();
    d.putReference(AM.k("null"), target);
    tk._c = "textLayer";
    d.putObject(AM.k("to"), AM.k("textLayer"), AM.toDesc(tk));
    executeAction(AM.k("set"), d, DialogModes.NO);
  }

  // Aplica estilo de capa completo: base (A.style) + tramos (A.runs) + parrafo (A.paragraph)
  function applyText(L, A, creating) {
    var ti = L.textItem;
    var runs = A.runs, contents = null;
    if (runs && runs.length) { contents = ""; for (var i = 0; i < runs.length; i++) contents += runs[i].text; }
    else if (U.has(A, "text")) contents = A.text;
    if (contents !== null) ti.contents = String(contents).split("\r\n").join("\n").split("\n").join(CR);
    var st = A.style || {};
    // El estilo base se aplica por DOM (robusto); los tramos se aplican despues por Action Manager.
    if (U.has(st, "font") || U.has(st, "weight") || U.has(st, "family")) ti.font = U.mustFont(U.has(st, "font") ? st.font : { family: st.family, weight: st.weight }).ps;
    if (U.has(st, "size")) ti.size = UnitValue(st.size, "px");
    if (U.has(st, "color")) ti.color = U.solid(st.color);
    if (U.has(st, "tracking")) ti.tracking = st.tracking;
    if (U.has(st, "leading")) { if (st.leading === "auto") ti.useAutoLeading = true; else { ti.useAutoLeading = false; ti.leading = UnitValue(st.leading, "px"); } }
    if (U.has(st, "baselineShift")) ti.baselineShift = UnitValue(st.baselineShift, "px");
    if (U.has(st, "caps")) ti.capitalization = st.caps === "all" ? TextCase.ALLCAPS : (st.caps === "small" ? TextCase.SMALLCAPS : TextCase.NORMAL);
    if (U.has(st, "hScale")) ti.horizontalScale = st.hScale;
    if (U.has(st, "vScale")) ti.verticalScale = st.vScale;
    if (U.has(st, "fauxBold")) ti.fauxBold = !!st.fauxBold;
    if (U.has(st, "fauxItalic")) ti.fauxItalic = !!st.fauxItalic;
    if (U.has(st, "underline")) ti.underline = st.underline ? UnderlineType.UNDERLINEON : UnderlineType.UNDERLINEOFF;
    if (U.has(st, "strike")) ti.strikeThru = st.strike ? StrikeThruType.STRIKEHEIGHT : StrikeThruType.STRIKEOFF;
    if (U.has(st, "kerning") && typeof st.kerning === "string") ti.autoKerning = st.kerning === "optical" ? AutoKernType.OPTICAL : (st.kerning === "none" ? AutoKernType.MANUAL : AutoKernType.METRICS);
    if (U.has(st, "antiAlias")) { var aa = { none: AntiAlias.NONE, sharp: AntiAlias.SHARP, crisp: AntiAlias.CRISP, strong: AntiAlias.STRONG, smooth: AntiAlias.SMOOTH }[st.antiAlias]; if (aa) ti.antiAliasMethod = aa; }
    var pg = A.paragraph || {};
    var align = A.align || pg.align;
    if (align) { var j = { left: Justification.LEFT, center: Justification.CENTER, right: Justification.RIGHT, justify: Justification.LEFTJUSTIFIED, "justify-left": Justification.LEFTJUSTIFIED, "justify-center": Justification.CENTERJUSTIFIED, "justify-right": Justification.RIGHTJUSTIFIED, "justify-all": Justification.FULLYJUSTIFIED }[align]; if (j !== undefined) ti.justification = j; }
    if (U.has(pg, "spaceBefore")) ti.spaceBefore = pg.spaceBefore;
    if (U.has(pg, "spaceAfter")) ti.spaceAfter = pg.spaceAfter;
    if (U.has(pg, "firstLineIndent")) ti.firstLineIndent = pg.firstLineIndent;
    if (U.has(pg, "hyphenation")) ti.hyphenation = !!pg.hyphenation;
    if (U.has(A, "language")) { var lg = { es: Language.SPANISH, en: Language.ENGLISH, "en-us": Language.ENGLISHUSA, fr: Language.FRENCH, pt: Language.PORTUGUESE, "pt-br": Language.BRAZILLIANPORTUGUESE, de: Language.GERMAN, it: Language.ITALIAN }[String(A.language).toLowerCase()]; if (lg !== undefined) ti.language = lg; }
    // tramos con estilo propio
    if (runs && runs.length) {
      var d = U.layerDesc(L, true), tk = d.textKey;
      var baseStyle = tk.textStyleRange && tk.textStyleRange.length ? tk.textStyleRange[0].textStyle : {};
      var ranges = [], pos = 0;
      for (var r = 0; r < runs.length; r++) {
        var txt = String(runs[r].text).split("\r\n").join("\n").split("\n").join(CR);
        var copy = VZ.json.parse(VZ.json.stringify(baseStyle));
        // JSON.stringify pierde las etiquetas de entero {_i}? no: son objetos, se conservan.
        var merged = U.styleToAM(runs[r].style || {}, copy);
        ranges.push({ from: { _i: pos }, to: { _i: pos + txt.length }, textStyle: merged, _c: "textStyleRange" });
        pos += txt.length;
      }
      tk.textStyleRange = ranges;
      writeTextKey(L, tk);
    }
  }

  // Coloca el contorno visible de la capa con un ancla en (x,y)
  U.anchorPoint = function (b, anchor) { // b = [l,t,r,b] en px
    var l = b[0], t = b[1], r = b[2], bt = b[3], cx = (l + r) / 2, cy = (t + bt) / 2;
    var m = {
      topleft: [l, t], top: [cx, t], topright: [r, t], left: [l, cy], center: [cx, cy], middle: [cx, cy], right: [r, cy], bottomleft: [l, bt], bottom: [cx, bt], bottomright: [r, bt]
    };
    return m[String(anchor || "topleft").toLowerCase().replace(/[-_ ]/g, "")] || m.topleft;
  };
  U.layerBounds = function (L) { var b = L.bounds; return [U.px(b[0]), U.px(b[1]), U.px(b[2]), U.px(b[3])]; };
  U.moveTo = function (L, x, y, anchor) {
    var b = U.layerBounds(L), p = U.anchorPoint(b, anchor);
    var dx = (U.has({ v: x }, "v") && x !== null && x !== undefined) ? x - p[0] : 0;
    var dy = (y !== null && y !== undefined) ? y - p[1] : 0;
    if (dx || dy) L.translate(UnitValue(dx, "px"), UnitValue(dy, "px"));
  };

  OPS.addText = function (A) {
    var doc = U.useDoc(A.doc);
    var L = doc.artLayers.add();
    L.kind = LayerKind.TEXT;
    var ti = L.textItem;
    var box = A.box;
    if (box && U.has(box, "width")) {
      ti.kind = TextType.PARAGRAPHTEXT;
      ti.width = UnitValue(box.width, "px");
      ti.height = UnitValue(U.pick(box, "height", 100), "px");
    } else ti.kind = TextType.POINTTEXT;
    ti.contents = " ";
    ti.position = [UnitValue(0, "px"), UnitValue(0, "px")];
    // sin estilo explicito: tipografia por defecto sensata
    var a2 = U.extend({}, A);
    a2.style = U.extend({ size: 48 }, A.style || {});
    applyText(L, a2, true);
    if (A.name) L.name = A.name;
    if (U.has(A, "rotation") && A.rotation) L.rotate(A.rotation, AnchorPosition.MIDDLECENTER);
    // posicionar: x,y con ancla sobre el contorno visible
    if (U.has(A, "x") || U.has(A, "y")) U.moveTo(L, U.has(A, "x") ? A.x : null, U.has(A, "y") ? A.y : null, A.anchor || "topleft");
    // paragraph box: la posicion esta en la esquina; por defecto anclamos a topleft del cuadro
    if (U.has(A, "blend")) U.applyBasics(L, A);
    else U.applyBasics(L, A);
    if (A.effects) U.applyEffects(L, A.effects, A.effectsMode || "replace");
    if (A.parent) U.moveIntoGroup(L, A.parent, doc);
    return U.layerBrief(L);
  };

  OPS.editText = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    if (L.kind !== LayerKind.TEXT) U.fail("La capa '" + L.name + "' no es de texto.");
    U.selectLayer(L);
    applyText(L, A, false);
    if (A.box && U.has(A.box, "width") && L.textItem.kind === TextType.PARAGRAPHTEXT) { L.textItem.width = UnitValue(A.box.width, "px"); if (U.has(A.box, "height")) L.textItem.height = UnitValue(A.box.height, "px"); }
    if (U.has(A, "rotation") && A.rotation) L.rotate(A.rotation, AnchorPosition.MIDDLECENTER);
    if (U.has(A, "x") || U.has(A, "y")) U.moveTo(L, U.has(A, "x") ? A.x : null, U.has(A, "y") ? A.y : null, A.anchor || "topleft");
    U.applyBasics(L, A);
    if (A.effects) U.applyEffects(L, A.effects, A.effectsMode || "replace");
    return U.layerBrief(L);
  };

  OPS.textInfo = function (A) {
    var doc = U.doc(A.doc);
    var L = U.findLayer(A.layer, doc);
    if (L.kind !== LayerKind.TEXT) U.fail("La capa '" + L.name + "' no es de texto.");
    return U.textInfo(L);
  };

  OPS.fonts = function (A) {
    var all = loadFonts(), q = A.query ? norm(A.query) : null, out = [];
    for (var i = 0; i < all.length; i++) {
      var f = all[i];
      if (q && norm(f.ps + f.family + f.style).indexOf(q) < 0) continue;
      out.push(f);
      if (out.length >= (A.limit || 60)) break;
    }
    return { total: all.length, matches: out };
  };
})();
