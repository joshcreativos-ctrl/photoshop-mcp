// Ajustes (capas de ajuste), filtros, selecciones, relleno, historial y acceso directo a Action Manager.
(function () {
  var U = VZ.util, AM = VZ.am, OPS = VZ.ops;
  function I(v) { return { _i: Math.round(v) }; }
  function chRef(name) { return { _ref: [{ cls: "channel", form: "enum", enumType: "channel", value: name || "composite" }] }; }
  function layerTarget() { return { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }; }

  // ---------- capas de ajuste ----------
  // type + params -> objeto "type" de la capa de ajuste
  var BUILD = {
    brightnessContrast: function (p) { return { _c: "brightnessEvent", brightness: I(U.pick(p, "brightness", 0)), contrast: I(U.pick(p, "contrast", 0)), useLegacy: !!p.legacy }; },
    levels: function (p) {
      var ch = p.channel || "composite";
      return { _c: "levels", adjustment: [{ _c: "levelsAdjustment", channel: chRef(ch), input: [I(U.pick(p, "inBlack", 0)), I(U.pick(p, "inWhite", 255))], gamma: U.pick(p, "gamma", 1), output: [I(U.pick(p, "outBlack", 0)), I(U.pick(p, "outWhite", 255))] }] };
    },
    curves: function (p) {
      // points: [[x,y],...] 0-255 en el canal indicado (por defecto compuesto). Tambien channels:{red:[[..]],green:..,blue:..}
      var adj = [];
      function one(ch, pts) { var cv = []; for (var i = 0; i < pts.length; i++) cv.push({ _c: "paint", horizontal: pts[i][0], vertical: pts[i][1] }); adj.push({ _c: "curvesAdjustment", channel: chRef(ch), curve: cv }); }
      if (p.points) one(p.channel || "composite", p.points);
      if (p.channels) for (var k in p.channels) if (p.channels.hasOwnProperty(k)) one(k, p.channels[k]);
      if (!adj.length) one("composite", [[0, 0], [255, 255]]);
      return { _c: "curves", presetKind: { _e: ["presetKindType", "presetKindCustom"] }, adjustment: adj };
    },
    hueSaturation: function (p) {
      return { _c: "hueSaturation", presetKind: { _e: ["presetKindType", "presetKindCustom"] }, colorize: !!p.colorize, adjustment: [{ _c: "hueSatAdjustmentV2", hue: I(U.pick(p, "hue", 0)), saturation: I(U.pick(p, "saturation", 0)), lightness: I(U.pick(p, "lightness", 0)) }] };
    },
    vibrance: function (p) { return { _c: "vibrance", vibrance: I(U.pick(p, "vibrance", 0)), saturation: I(U.pick(p, "saturation", 0)) }; },
    colorBalance: function (p) {
      function t(a) { return [I(a ? a[0] : 0), I(a ? a[1] : 0), I(a ? a[2] : 0)]; }
      return { _c: "colorBalance", shadowLevels: t(p.shadows), midtoneLevels: t(p.midtones), highlightLevels: t(p.highlights), preserveLuminosity: p.preserveLuminosity !== false };
    },
    blackAndWhite: function (p) {
      var o = { _c: "blackAndWhite", red: I(U.pick(p, "red", 40)), yellow: I(U.pick(p, "yellow", 60)), green: I(U.pick(p, "green", 40)), cyan: I(U.pick(p, "cyan", 60)), blue: I(U.pick(p, "blue", 20)), magenta: I(U.pick(p, "magenta", 80)), useTint: !!p.tint, tintColor: U.rgbObj(p.tint || "#E1D3B3"), presetKind: { _e: ["presetKindType", "presetKindDefault"] } };
      return o;
    },
    photoFilter: function (p) { return { _c: "photoFilter", color: U.rgbObj(p.color || "#EC8A00"), density: I(U.pick(p, "density", 25)), preserveLuminosity: p.preserveLuminosity !== false }; },
    gradientMap: function (p) { return { _c: "gradientMapClass", gradient: U.gradientObj(p.gradient || p), reverse: !!p.reverse, dither: !!p.dither }; },
    exposure: function (p) { return { _c: "exposure", presetKind: { _e: ["presetKindType", "presetKindDefault"] }, exposure: U.pick(p, "exposure", 0), offset: U.pick(p, "offset", 0), gammaCorrection: U.pick(p, "gamma", 1) }; },
    invert: function () { return { _c: "invert" }; },
    threshold: function (p) { return { _c: "thresholdClassEvent", level: I(U.pick(p, "level", 128)) }; },
    posterize: function (p) { return { _c: "posterization", levels: I(U.pick(p, "levels", 4)) }; },
    selectiveColor: function (p) {
      // p.colors: { reds:{cyan,magenta,yellow,black}, ... } valores -100..100
      var list = [];
      var names = { reds: "reds", yellows: "yellows", greens: "greens", cyans: "cyans", blues: "blues", magentas: "magentas", whites: "whites", neutrals: "neutrals", blacks: "blacks" };
      for (var k in (p.colors || {})) { if (!names[k]) continue; var c = p.colors[k]; list.push({ _c: "colorCorrection", colors: { _e: ["colors", names[k]] }, cyan: { _u: "percentUnit", v: U.pick(c, "cyan", 0) }, magenta: { _u: "percentUnit", v: U.pick(c, "magenta", 0) }, yellowColor: { _u: "percentUnit", v: U.pick(c, "yellow", 0) }, black: { _u: "percentUnit", v: U.pick(c, "black", 0) } }); }
      return { _c: "selectiveColor", correctionMethod: { _e: ["correctionMethod", p.absolute ? "absolute" : "relative"] }, colorCorrection: list };
    }
  };

  OPS.addAdjustment = function (A) {
    var doc = U.useDoc(A.doc);
    var type = A.type;
    if (!BUILD[type]) U.fail("Ajuste no soportado: " + type + ". Validos: " + U.keys(BUILD).join(", "));
    var using = { _c: "adjustmentLayer", type: BUILD[type](A.params || {}) };
    if (A.name) using.name = A.name;
    AM.play("make", { "null": { _ref: [{ cls: "adjustmentLayer", form: "class" }] }, using: using });
    var L = doc.activeLayer;
    if (A.name) L.name = A.name;
    U.placeNew(L, A, doc);
    if (A.clip) L.grouped = true;
    U.applyBasics(L, A);
    if (A.mask) OPS.mask(U.extend({ layer: L.id }, A.mask));
    return U.layerBrief(L);
  };

  // ---------- filtros ----------
  OPS.filter = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    U.selectLayer(L);
    if (A.toSmart && L.kind !== LayerKind.SMARTOBJECT) { AM.play("newPlacedLayer"); L = doc.activeLayer; }
    var p = A.params || {}, f = A.filter;
    if (f === "gaussianBlur") L.applyGaussianBlur(U.pick(p, "radius", 5));
    else if (f === "motionBlur") L.applyMotionBlur(U.pick(p, "angle", 0), U.pick(p, "distance", 20));
    else if (f === "radialBlur") L.applyRadialBlur(U.pick(p, "amount", 20), p.method === "zoom" ? RadialBlurMethod.ZOOM : RadialBlurMethod.SPIN, RadialBlurQuality.GOOD);
    else if (f === "addNoise" || f === "grain") L.applyAddNoise(U.pick(p, "amount", 8), p.distribution === "uniform" ? NoiseDistribution.UNIFORM : NoiseDistribution.GAUSSIAN, p.monochrome !== false);
    else if (f === "unsharpMask") L.applyUnSharpMask(U.pick(p, "amount", 80), U.pick(p, "radius", 1.5), U.pick(p, "threshold", 0));
    else if (f === "highPass") L.applyHighPass(U.pick(p, "radius", 3));
    else if (f === "median") L.applyMedianNoise(U.pick(p, "radius", 2));
    else if (f === "sharpen") L.applySharpen();
    else if (f === "dustAndScratches") L.applyDustAndScratches(U.pick(p, "radius", 1), U.pick(p, "threshold", 0));
    else if (f === "offset") L.applyOffset(U.pick(p, "x", 0), U.pick(p, "y", 0), OffsetUndefinedAreas.WRAPAROUND);
    else if (f === "surfaceBlur") AM.play("surfaceBlur", { radius: { _u: "pixelsUnit", v: U.pick(p, "radius", 5) }, threshold: I(U.pick(p, "threshold", 15)) });
    else if (f === "smartSharpen") AM.play("smartSharpen", { presetKind: { _e: ["presetKindType", "presetKindCustom"] }, amount: { _u: "percentUnit", v: U.pick(p, "amount", 100) }, radius: { _u: "pixelsUnit", v: U.pick(p, "radius", 1) }, noiseReduction: { _u: "percentUnit", v: U.pick(p, "noiseReduction", 10) }, blur: { _e: ["blurType", "gaussianBlur"] } });
    else if (f === "filmGrain") AM.play("filmGrain", { grain: I(U.pick(p, "grain", 8)), highlightArea: I(U.pick(p, "highlight", 4)), intensity: I(U.pick(p, "intensity", 2)) });
    else if (f === "diffuseGlow") AM.play("diffuseGlow", { graininess: I(U.pick(p, "graininess", 6)), glowAmount: I(U.pick(p, "amount", 6)), clearAmount: I(U.pick(p, "clear", 15)) });
    else if (f === "cameraRaw") {
      // Filtro Camera Raw con ajustes basicos: p = {exposure, contrast, highlights, shadows, whites, blacks, texture, clarity, dehaze, vibrance, saturation, temperature, tint, vignette, grain}
      var cr = { _c: "Adobe Camera Raw Filter" };
      var map = { exposure: "exposure2012", contrast: "contrast2012", highlights: "highlights2012", shadows: "shadows2012", whites: "whites2012", blacks: "blacks2012", texture: "texture", clarity: "clarity2012", dehaze: "dehaze", vibrance: "vibrance", saturation: "saturation", temperature: "temperature", tint: "tint", vignette: "postCropVignetteAmount", grain: "grainAmount" };
      for (var k in p) if (p.hasOwnProperty(k) && map[k]) cr[map[k]] = p[k];
      AM.play("Adobe Camera Raw Filter", cr);
    } else U.fail("Filtro no soportado: " + f + ". Validos: gaussianBlur, motionBlur, radialBlur, addNoise, unsharpMask, highPass, median, sharpen, dustAndScratches, offset, surfaceBlur, smartSharpen, filmGrain, diffuseGlow, cameraRaw");
    return U.layerBrief(doc.activeLayer);
  };

  // ---------- selecciones ----------
  var SELMODE = { replace: "set", add: "addTo", subtract: "subtractFrom", intersect: "intersectWith" };
  function pxu(v) { return { _u: "pixelsUnit", v: v }; }
  OPS.selection = function (A) {
    var doc = U.useDoc(A.doc);
    var type = A.type || "all";
    var ev = SELMODE[A.mode || "replace"] || "set";
    var selRef = { _ref: [{ cls: "channel", form: "property", value: "selection" }] };
    if (type === "all") doc.selection.selectAll();
    else if (type === "none") doc.selection.deselect();
    else if (type === "invert") doc.selection.invert();
    else if (type === "rect" || type === "ellipse") {
      var r = A.rect || U.fail("Indica rect:{x,y,width,height}");
      var geom = type === "ellipse" ? { _c: "ellipse", top: pxu(r.y), left: pxu(r.x), bottom: pxu(r.y + r.height), right: pxu(r.x + r.width) } : { _c: "rectangle", unitValueQuadVersion: I(1), top: pxu(r.y), left: pxu(r.x), bottom: pxu(r.y + r.height), right: pxu(r.x + r.width) };
      if (type === "rect" && A.radius) { var rr = A.radius === "pill" ? Math.min(r.width, r.height) / 2 : A.radius; geom.topLeft = pxu(rr); geom.topRight = pxu(rr); geom.bottomLeft = pxu(rr); geom.bottomRight = pxu(rr); }
      AM.play(ev, { "null": selRef, to: geom });
    } else if (type === "polygon") {
      var pts = A.points, arr = [];
      for (var i = 0; i < pts.length; i++) arr.push([pts[i][0], pts[i][1]]);
      doc.selection.select(arr, A.mode === "add" ? SelectionType.EXTEND : (A.mode === "subtract" ? SelectionType.DIMINISH : (A.mode === "intersect" ? SelectionType.INTERSECT : SelectionType.REPLACE)), U.pick(A, "feather", 0), true);
    } else if (type === "layer") { // transparencia de una capa
      var L = U.findLayer(A.layer, doc);
      AM.play(ev === "set" ? "set" : ev, { "null": selRef, to: { _ref: [{ cls: "channel", form: "enum", enumType: "channel", value: "transparencyEnum" }, { cls: "layer", form: "id", value: L.id }] } });
    } else if (type === "subject") {
      AM.play("autoCutout", { sampleAllLayers: A.sampleAllLayers !== false });
    } else if (type === "colorRange") {
      AM.play("colorRange", { colors: { _e: ["colors", A.colors || "sampledColors"] }, fuzziness: I(U.pick(A, "fuzziness", 40)), minimum: U.rgbObj(A.color || "#000000"), maximum: U.rgbObj(A.color || "#000000"), colorModel: I(0) });
    } else U.fail("selection.type no valido: all, none, invert, rect, ellipse, polygon, layer, subject, colorRange");
    if (A.grow) doc.selection.expand(A.grow);
    if (A.shrink) doc.selection.contract(A.shrink);
    if (A.smooth) AM.play("smoothness", { radius: pxu(A.smooth) });
    if (A.border) doc.selection.selectBorder(A.border);
    if (A.feather) doc.selection.feather(UnitValue(A.feather, "px"));
    var out = { selection: true };
    try { var b = doc.selection.bounds; out.bounds = [U.px(b[0]), U.px(b[1]), U.px(b[2]), U.px(b[3])]; } catch (e) { out.selection = false; }
    if (A.then) {
      var t = A.then;
      if (t.fill) { var lay = A.layer ? U.findLayer(A.layer, doc) : doc.activeLayer; doc.activeLayer = doc.activeLayer; doc.selection.fill(U.solid(t.fill.color || t.fill), t.fill.blend ? ColorBlendMode.NORMAL : ColorBlendMode.NORMAL, U.pick(t.fill, "opacity", 100), false); }
      if (t.clear) doc.selection.clear();
      if (t.stroke) doc.selection.stroke(U.solid(t.stroke.color || "#000000"), U.pick(t.stroke, "width", 2), t.stroke.location === "inside" ? StrokeLocation.INSIDE : (t.stroke.location === "outside" ? StrokeLocation.OUTSIDE : StrokeLocation.CENTER), ColorBlendMode.NORMAL, U.pick(t.stroke, "opacity", 100), false);
      if (t.copyToLayer) AM.play("copyToLayer");
      if (t.cutToLayer) AM.play("cutToLayer");
      if (t.saveAs) doc.channels.add().name = t.saveAs, doc.selection.store(doc.channels.getByName(t.saveAs));
      if (t.mask) OPS.mask({ layer: doc.activeLayer.id, type: "selection" });
      if (t.deselect) doc.selection.deselect();
      out.then = U.layerBrief(doc.activeLayer);
    }
    return out;
  };

  // Relleno de pixeles de una capa o seleccion (colores, degradados)
  OPS.fill = function (A) {
    var doc = U.useDoc(A.doc);
    var L = A.layer ? U.selectLayer(U.findLayer(A.layer, doc)) : doc.activeLayer;
    if (A.contentAware) { AM.play("fill", { using: { _e: ["fillContents", "contentAware"] }, opacity: { _u: "percentUnit", v: 100 }, mode: { _e: ["blendMode", "normal"] } }); return U.layerBrief(L); }
    if (A.gradient) {
      var b = U.layerBounds(L), W = U.px(doc.width), H = U.px(doc.height);
      var ox = A.from ? A.from[0] : (b[0] + b[2]) / 2, oy = A.from ? A.from[1] : b[3], tx = A.to ? A.to[0] : (b[0] + b[2]) / 2, ty = A.to ? A.to[1] : b[1];
      AM.play("#Grdn", { from: { _c: "paint", horizontal: pxu(ox), vertical: pxu(oy) }, to: { _c: "paint", horizontal: pxu(tx), vertical: pxu(ty) }, type: { _e: ["gradientType", A.gradient.style || "linear"] }, gradient: U.gradientObj(A.gradient), dither: true, reverse: !!A.gradient.reverse });
    } else {
      var hasSel = true;
      try { doc.selection.bounds; } catch (e) { hasSel = false; }
      if (!hasSel) doc.selection.selectAll();
      doc.selection.fill(U.solid(A.color || "#000000"), ColorBlendMode.NORMAL, U.pick(A, "opacity", 100), !!A.preserveTransparency);
      if (!hasSel && !A.keepSelection) doc.selection.deselect();
    }
    return U.layerBrief(L);
  };

  // ---------- historial ----------
  OPS.history = function (A) {
    var doc = U.useDoc(A.doc);
    var act = A.action || "list";
    var hs = doc.historyStates, out = { states: [], active: null };
    if (act === "undo") { var idx = 0; for (var i = 0; i < hs.length; i++) if (hs[i] === doc.activeHistoryState) idx = i; doc.activeHistoryState = hs[Math.max(0, idx - U.pick(A, "steps", 1))]; }
    else if (act === "redo") { var j = 0; for (var k = 0; k < hs.length; k++) if (hs[k] === doc.activeHistoryState) j = k; doc.activeHistoryState = hs[Math.min(hs.length - 1, j + U.pick(A, "steps", 1))]; }
    else if (act === "revert") doc.activeHistoryState = hs[Math.max(0, Math.min(hs.length - 1, A.index))];
    else if (act === "snapshot") { AM.play("make", { "null": { _ref: [{ cls: "snapshotClass", form: "class" }] }, from: { _ref: [{ cls: "historyState", form: "property", value: "currentHistoryState" }] }, name: A.name || "Instantanea", using: { _e: ["historyState", "fullDocument"] } }); }
    for (var m = 0; m < doc.historyStates.length; m++) out.states.push(doc.historyStates[m].name);
    out.active = doc.activeHistoryState.name;
    return out;
  };

  // ---------- Action Manager directo y scripts ----------
  OPS.actionManager = function (A) {
    var doc = null;
    if (A.doc !== undefined || app.documents.length) { try { doc = U.useDoc(A.doc); } catch (e) {} }
    if (A.layer && doc) U.selectLayer(U.findLayer(A.layer, doc));
    if (A.get) { return AM.get(A.get, !!A.exact); }
    if (!A.event) U.fail("Indica event (p. ej. 'make') y descriptor, o get:[referencia].");
    return AM.play(A.event, A.descriptor || {}, !!A.exact);
  };

  OPS.playAction = function (A) {
    app.doAction(A.name, A.set);
    return { played: A.name, set: A.set };
  };

  OPS.script = function (A) {
    var fn = new Function("A", "U", "AM", "VZ", A.code);
    return fn(A.args || {}, U, AM, VZ);
  };

  OPS.scriptFile = function (A) {
    var f = new File(A.path);
    if (!f.exists) U.fail("No existe el script: " + A.path);
    return $.evalFile(f);
  };

  // IA de Photoshop: quitar fondo
  OPS.removeBackground = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    U.selectLayer(L);
    AM.play("removeBackground");
    return U.layerBrief(doc.activeLayer);
  };

  // ---------- recursos del documento ----------
  OPS.resources = function (A) {
    var doc = U.doc(A.doc);
    var fonts = {}, linked = [], embedded = [], libs = {}, colors = {}, problems = [];
    var installed = {};
    U.eachLayer(doc, function (L) {
      var d;
      try { d = U.layerDesc(L, false); } catch (e) { return true; }
      if (d.textKey) {
        var ti = U.textInfo(L, d);
        for (var i = 0; i < ti.runs.length; i++) {
          var r = ti.runs[i], key = r.font;
          if (!fonts[key]) fonts[key] = { postScriptName: r.font, family: r.family, style: r.style, layers: [], missing: !!r.fontMissing };
          if (fonts[key].layers.indexOf(L.name) < 0) fonts[key].layers.push(L.name);
          if (r.color) colors[r.color] = (colors[r.color] || 0) + 1;
        }
      }
      if (d.smartObject) {
        var so = d.smartObject, item = { layer: L.name, id: L.id, file: so.fileReference || null, type: so.placed && so.placed._e ? so.placed._e[1] : (so.placed || null) };
        if (so.linked) { item.linked = true; item.missing = !!so.linkMissing; item.changed = !!so.linkChanged; if (so.link && so.link.libraryName) { item.library = so.link.libraryName; item.libraryItem = so.link.name; libs[so.link.libraryName] = (libs[so.link.libraryName] || 0) + 1; } if (so.link && so.link.elementReference) item.cloudAsset = so.link.elementReference; if (so.link && so.link.fullPath) item.path = so.link.fullPath; linked.push(item); if (item.missing) problems.push("Vinculo perdido: " + L.name); if (item.changed) problems.push("Vinculo modificado fuera de Photoshop: " + L.name); }
        else embedded.push(item);
      }
      if (d.adjustment && d.adjustment.length && d.adjustment[0]._c === "solidColorLayer" && d.adjustment[0].color) { var hx = U.hex({ r: d.adjustment[0].color.red, g: d.adjustment[0].color.grain, b: d.adjustment[0].color.blue }); colors[hx] = (colors[hx] || 0) + 1; }
      return true;
    });
    var fl = []; for (var k in fonts) if (fonts.hasOwnProperty(k)) { var fo = fonts[k]; fo.installed = !!U.findFont(fo.postScriptName); if (!fo.installed) problems.push("Fuente no instalada: " + fo.postScriptName); fl.push(fo); }
    var out = { document: doc.name, fonts: fl, linkedFiles: linked, embeddedSmartObjects: embedded, libraries: libs, textColors: colors, problems: problems };
    try { out.colorProfile = doc.colorProfileName; } catch (e2) {}
    return out;
  };
})();
