// Operaciones de documento y capas.
(function () {
  var U = VZ.util, AM = VZ.am, OPS = VZ.ops;

  // ---------- modos de fusion ----------
  var BLEND = [
    ["normal", BlendMode.NORMAL, "normal"], ["dissolve", BlendMode.DISSOLVE, "dissolve"], ["darken", BlendMode.DARKEN, "darken"], ["multiply", BlendMode.MULTIPLY, "multiply"],
    ["colorBurn", BlendMode.COLORBURN, "colorBurn"], ["linearBurn", BlendMode.LINEARBURN, "linearBurn"], ["darkerColor", BlendMode.DARKERCOLOR, "darkerColor"],
    ["lighten", BlendMode.LIGHTEN, "lighten"], ["screen", BlendMode.SCREEN, "screen"], ["colorDodge", BlendMode.COLORDODGE, "colorDodge"], ["linearDodge", BlendMode.LINEARDODGE, "linearDodge"],
    ["lighterColor", BlendMode.LIGHTERCOLOR, "lighterColor"], ["overlay", BlendMode.OVERLAY, "overlay"], ["softLight", BlendMode.SOFTLIGHT, "softLight"], ["hardLight", BlendMode.HARDLIGHT, "hardLight"],
    ["vividLight", BlendMode.VIVIDLIGHT, "vividLight"], ["linearLight", BlendMode.LINEARLIGHT, "linearLight"], ["pinLight", BlendMode.PINLIGHT, "pinLight"], ["hardMix", BlendMode.HARDMIX, "hardMix"],
    ["difference", BlendMode.DIFFERENCE, "difference"], ["exclusion", BlendMode.EXCLUSION, "exclusion"], ["subtract", BlendMode.SUBTRACT, "blendSubtraction"], ["divide", BlendMode.DIVIDE, "blendDivide"],
    ["hue", BlendMode.HUE, "hue"], ["saturation", BlendMode.SATURATION, "saturation"], ["color", BlendMode.COLORBLEND, "color"], ["luminosity", BlendMode.LUMINOSITY, "luminosity"], ["passThrough", BlendMode.PASSTHROUGH, "passThrough"]
  ];
  var ALIAS = { add: "linearDodge", "linear-dodge": "linearDodge", "color-dodge": "colorDodge", "color-burn": "colorBurn", "linear-burn": "linearBurn", "soft-light": "softLight", "hard-light": "hardLight", "vivid-light": "vividLight", "linear-light": "linearLight", "pin-light": "pinLight", "hard-mix": "hardMix", pass: "passThrough", "pass-through": "passThrough", "darker-color": "darkerColor", "lighter-color": "lighterColor" };
  function blendKey(n) {
    var s = String(n).replace(/[\s_]/g, "");
    if (ALIAS[s.toLowerCase()]) s = ALIAS[s.toLowerCase()];
    for (var i = 0; i < BLEND.length; i++) if (BLEND[i][0].toLowerCase() === s.toLowerCase() || BLEND[i][2].toLowerCase() === s.toLowerCase()) return BLEND[i];
    U.fail("Modo de fusion desconocido: " + n + ". Validos: " + BLEND.map(function (b) { return b[0]; }).join(", "));
  }
  U.blendEnum = function (n) { return blendKey(n)[1]; };
  U.blendAM = function (n) { return { _e: ["blendMode", blendKey(n)[2]] }; };
  U.blendName = function (e) { for (var i = 0; i < BLEND.length; i++) if (BLEND[i][1] === e) return BLEND[i][0]; return String(e); };
  U.blendNameAM = function (am) { var v = am && am._e ? am._e[1] : am; for (var i = 0; i < BLEND.length; i++) if (BLEND[i][2] === v) return BLEND[i][0]; return v; };
  U.BLEND_NAMES = BLEND.map(function (b) { return b[0]; });

  // ---------- resumenes ----------
  var KIND = { 1: "pixel", 2: "adjustment", 3: "text", 4: "shape", 5: "smart-object", 6: "video", 7: "group", 8: "3d", 9: "gradient-fill", 10: "pattern-fill", 11: "solid-fill", 12: "background" };
  U.kindName = function (d) {
    if (d.artboard && typeof d.artboard === "object") return "artboard";
    var k = d.layerKind; k = k && k._i !== undefined ? k._i : k;
    if (d.layerSection && d.layerSection._e && d.layerSection._e[1] === "layerSectionStart") return "group";
    return KIND[k] || ("kind" + k);
  };
  U.layerBrief = function (L) {
    var o = { id: L.id, name: L.name, kind: null, visible: L.visible };
    var dd = U.layerProps(L, ["layerKind", "layerSection", "artboard"], false);
    o.kind = U.kindName(dd);
    try { var b = U.layerBounds(L); o.bounds = [Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), Math.round(b[3])]; o.size = [Math.round(b[2] - b[0]), Math.round(b[3] - b[1])]; } catch (e) {}
    try { o.opacity = U.round(L.opacity, 1); } catch (e1) {}
    try { o.fill = U.round(L.fillOpacity, 1); } catch (e2) {}
    try { o.blend = U.blendName(L.blendMode); } catch (e3) {}
    return o;
  };

  // ---------- propiedades basicas de capa ----------
  var LABEL = { none: "none", red: "red", orange: "orange", yellow: "yellowColor", green: "grain", blue: "blue", violet: "violet", gray: "gray" };
  U.setLabel = function (L, color) {
    U.selectLayer(L);
    AM.play("set", { "null": { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, to: { _c: "layer", color: { _e: ["color", LABEL[color] || "none"] } } });
  };
  U.applyBasics = function (L, A) {
    if (U.has(A, "name") && A.name !== L.name) L.name = A.name;
    if (U.has(A, "visible")) L.visible = !!A.visible;
    if (U.has(A, "opacity")) L.opacity = A.opacity;
    if (U.has(A, "fill") && L.kind !== LayerKind.NORMAL) { try { L.fillOpacity = A.fill; } catch (e) {} }
    else if (U.has(A, "fill")) L.fillOpacity = A.fill;
    if (U.has(A, "blend")) L.blendMode = U.blendEnum(A.blend);
    if (U.has(A, "clipped")) { try { L.grouped = !!A.clipped; } catch (e2) {} }
    if (U.has(A, "locked")) { try { L.allLocked = !!A.locked; } catch (e3) {} }
    if (U.has(A, "label")) U.setLabel(L, A.label);
    return L;
  };

  U.moveIntoGroup = function (L, parentRef, doc) {
    var G = U.findLayer(parentRef, doc || U.doc());
    if (G.typename !== "LayerSet") U.fail("'" + G.name + "' no es un grupo (parent debe ser un grupo).");
    L.move(G, ElementPlacement.INSIDE);
    return L;
  };
  // Ubica una capa nueva: parent (dentro de un grupo), above/below (junto a otra capa) o, por defecto, arriba del todo.
  U.placeNew = function (L, A, doc) {
    if (A.parent) { U.moveIntoGroup(L, A.parent, doc); return; }
    if (A.above) { L.move(U.findLayer(A.above, doc), ElementPlacement.PLACEBEFORE); return; }
    if (A.below) { L.move(U.findLayer(A.below, doc), ElementPlacement.PLACEAFTER); return; }
    var top = doc.layers[0];
    if (top && top.id !== L.id) L.move(top, ElementPlacement.PLACEBEFORE);
  };

  // ---------- colores, degradados ----------
  U.gradientObj = function (g) {
    // g: {stops:[{color,pos(0-100),opacity?(0-100)}], name?}  ·  o  [{...}]
    var stops = g.stops || g;
    var cs = [], ts = [];
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i], pos = Math.round((U.has(s, "pos") ? s.pos : (stops.length === 1 ? 0 : i * 100 / (stops.length - 1))) * 40.96);
      cs.push({ _c: "colorStop", color: U.rgbObj(s.color), type: { _e: ["colorStopType", "userStop"] }, location: { _i: pos }, midpoint: { _i: U.has(s, "mid") ? s.mid : 50 } });
      ts.push({ _c: "transferSpec", opacity: { _u: "percentUnit", v: U.has(s, "opacity") ? s.opacity : 100 }, location: { _i: pos }, midpoint: { _i: 50 } });
    }
    return { _c: "gradientClassEvent", name: g.name || "Videazo", gradientForm: { _e: ["gradientForm", "customStops"] }, interfaceIconFrameDimmed: { _i: 4096 }, colors: cs, transparency: ts };
  };
  var GTYPE = { linear: "linear", radial: "radial", angle: "angle", reflected: "reflected", diamond: "diamond" };
  function fillContent(f) {
    if (typeof f === "string" || (f && (U.has(f, "r") || U.has(f, "red") || f instanceof Array))) return { _c: "solidColorLayer", color: U.rgbObj(f) };
    if (f && (f.type === "color" || f.type === "solid")) return { _c: "solidColorLayer", color: U.rgbObj(f.color) };
    if (f && f.type === "gradient") {
      return { _c: "gradientLayer", gradient: U.gradientObj(f), type: { _e: ["gradientType", GTYPE[f.style || "linear"] || "linear"] }, angle: { _u: "angleUnit", v: U.has(f, "angle") ? f.angle : 90 }, scale: { _u: "percentUnit", v: U.has(f, "scale") ? f.scale : 100 }, reverse: !!f.reverse, dither: f.dither !== false, align: true };
    }
    U.fail("Relleno no valido. Usa un color '#RRGGBB' o {type:'gradient', stops:[...], style, angle}.");
  }
  U.fillContent = fillContent;

  // ---------- documento ----------
  var MODE = { rgb: NewDocumentMode.RGB, cmyk: NewDocumentMode.CMYK, gray: NewDocumentMode.GRAYSCALE, grayscale: NewDocumentMode.GRAYSCALE, lab: NewDocumentMode.LAB };
  var DEPTH = { 8: BitsPerChannelType.EIGHT, 16: BitsPerChannelType.SIXTEEN, 32: BitsPerChannelType.THIRTYTWO };
  function unitToPx(v, unit, res) {
    unit = unit || "px";
    if (unit === "px") return v;
    return UnitValue(v, unit).as("px") * 1 && (unit === "in" ? v * res : unit === "cm" ? v / 2.54 * res : unit === "mm" ? v / 25.4 * res : unit === "pt" ? v / 72 * res : v);
  }

  OPS.newDocument = function (A) {
    var res = U.pick(A, "resolution", 72);
    var unit = A.unit || "px";
    var w = unitToPx(A.width || 1080, unit, res), h = unitToPx(A.height || 1350, unit, res);
    if (A.slides && A.slides.count) { w = (A.slides.width || w) * A.slides.count; if (A.slides.height) h = A.slides.height; }
    var fill = ({ white: DocumentFill.WHITE, transparent: DocumentFill.TRANSPARENT, background: DocumentFill.BACKGROUNDCOLOR })[A.background] ;
    var bgColor = null;
    if (fill === undefined) { fill = DocumentFill.TRANSPARENT; if (A.background) bgColor = A.background; }
    var doc = app.documents.add(UnitValue(w, "px"), UnitValue(h, "px"), res, A.name || "Sin titulo", MODE[String(A.mode || "rgb").toLowerCase()] || NewDocumentMode.RGB, fill, U.pick(A, "pixelAspectRatio", 1), DEPTH[A.bitDepth || 8] || BitsPerChannelType.EIGHT, A.profile || "sRGB IEC61966-2.1");
    if (bgColor) {
      var L = doc.artLayers[0]; L.name = "Fondo";
      doc.selection.selectAll(); doc.selection.fill(U.solid(bgColor)); doc.selection.deselect();
    }
    // guias: manuales y de diapositivas
    var guides = A.guides || [];
    for (var i = 0; i < guides.length; i++) doc.guides.add(guides[i].direction === "horizontal" ? Direction.HORIZONTAL : Direction.VERTICAL, UnitValue(guides[i].position, "px"));
    if (A.slides && A.slides.count > 1) { var sw = A.slides.width || (w / A.slides.count); for (var s = 1; s < A.slides.count; s++) doc.guides.add(Direction.VERTICAL, UnitValue(sw * s, "px")); }
    return U.docSummary(doc);
  };

  OPS.openDocument = function (A) {
    var f = new File(A.path);
    if (!f.exists) U.fail("No existe el archivo: " + A.path);
    var doc;
    if (/\.(pdf|ai|eps)$/i.test(f.name)) {
      var po = new PDFOpenOptions(); po.page = A.page || 1; po.resolution = U.pick(A, "resolution", 150); po.antiAlias = true; po.mode = OpenDocumentMode.RGB; po.cropPage = CropToType.CROPBOX; po.suppressWarnings = true;
      doc = app.open(f, po);
    } else doc = app.open(f);
    return U.docSummary(doc);
  };

  OPS.saveDocument = function (A) {
    var doc = U.useDoc(A.doc);
    var path = A.path;
    if (!path) { try { doc.save(); return U.docSummary(doc); } catch (e) { U.fail("El documento no tiene ruta: indica path."); } }
    var fmt = (A.format || String(path).split(".").pop()).toLowerCase();
    if (fmt === "psb") {
      AM.play("save", { as: { _c: "largeDocumentFormat", maximizeCompatibility: true }, "in": { _p: path }, copy: !!A.asCopy, lowerCase: true });
    } else if (fmt === "psd") {
      var so = new PhotoshopSaveOptions(); so.layers = true; so.embedColorProfile = true; so.maximizeCompatibility = true;
      doc.saveAs(new File(path), so, !!A.asCopy, Extension.LOWERCASE);
    } else U.saveCopy(doc, path, fmt, A.quality || 90);
    return { saved: U.slash(path) };
  };

  OPS.closeDocument = function (A) {
    var doc = U.doc(A.doc);
    var name = doc.name;
    doc.close(A.save ? SaveOptions.SAVECHANGES : SaveOptions.DONOTSAVECHANGES);
    return { closed: name };
  };

  OPS.setDocument = function (A) {
    var doc = U.useDoc(A.doc);
    var res = doc.resolution;
    if (A.resizeImage) doc.resizeImage(A.resizeImage.width ? UnitValue(A.resizeImage.width, "px") : undefined, A.resizeImage.height ? UnitValue(A.resizeImage.height, "px") : undefined, A.resizeImage.resolution || res, ResampleMethod.BICUBICAUTOMATIC);
    if (A.resizeCanvas) {
      var anchors = { center: AnchorPosition.MIDDLECENTER, top: AnchorPosition.TOPCENTER, bottom: AnchorPosition.BOTTOMCENTER, left: AnchorPosition.MIDDLELEFT, right: AnchorPosition.MIDDLERIGHT, topleft: AnchorPosition.TOPLEFT, topright: AnchorPosition.TOPRIGHT, bottomleft: AnchorPosition.BOTTOMLEFT, bottomright: AnchorPosition.BOTTOMRIGHT };
      doc.resizeCanvas(UnitValue(A.resizeCanvas.width || U.px(doc.width), "px"), UnitValue(A.resizeCanvas.height || U.px(doc.height), "px"), anchors[A.resizeCanvas.anchor || "center"]);
    }
    if (A.resolution) doc.resizeImage(undefined, undefined, A.resolution, ResampleMethod.NONE);
    if (A.mode) { var m = { rgb: ChangeMode.RGB, cmyk: ChangeMode.CMYK, gray: ChangeMode.GRAYSCALE, lab: ChangeMode.LAB }[String(A.mode).toLowerCase()]; if (m) doc.changeMode(m); }
    if (A.bitDepth) doc.bitsPerChannel = DEPTH[A.bitDepth];
    if (A.convertProfile) doc.convertProfile(A.convertProfile, Intent.RELATIVECOLORIMETRIC, true, true);
    if (A.assignProfile) doc.colorProfileName = A.assignProfile;
    if (A.trim) doc.trim(TrimType.TRANSPARENT);
    if (A.rotateCanvas) doc.rotateCanvas(A.rotateCanvas);
    if (A.clearGuides) doc.guides.removeAll();
    if (A.guides) for (var i = 0; i < A.guides.length; i++) doc.guides.add(A.guides[i].direction === "horizontal" ? Direction.HORIZONTAL : Direction.VERTICAL, UnitValue(A.guides[i].position, "px"));
    if (A.rename) { try { doc.info.title = A.rename; } catch (e) {} }
    return U.docSummary(doc);
  };

  // ---------- arbol de capas ----------
  function effectsList(fx) {
    var out = [];
    if (!fx) return out;
    var names = { dropShadowMulti: "dropShadow", innerShadowMulti: "innerShadow", outerGlow: "outerGlow", innerGlow: "innerGlow", bevelEmboss: "bevelEmboss", chromeFX: "satin", solidFillMulti: "colorOverlay", gradientFillMulti: "gradientOverlay", patternFill: "patternOverlay", frameFXMulti: "stroke", dropShadow: "dropShadow", innerShadow: "innerShadow", solidFill: "colorOverlay", gradientFill: "gradientOverlay", frameFX: "stroke" };
    for (var k in fx) {
      if (!fx.hasOwnProperty(k) || !names[k]) continue;
      var v = fx[k], on = 0;
      if (v instanceof Array) { for (var i = 0; i < v.length; i++) if (v[i].enabled) on++; }
      else if (v && v.enabled) on = 1;
      if (on) out.push(names[k] + (on > 1 ? " x" + on : ""));
    }
    return out;
  }
  U.effectsList = effectsList;

  function nodeOf(L, opts) {
    var d = U.layerDesc(L, false);
    var n = { id: L.id, name: L.name, kind: U.kindName(d), visible: L.visible };
    var op = U.round(d.opacity / 2.55, 1), fl = d.fillOpacity !== undefined ? U.round(d.fillOpacity / 2.55, 1) : 100;
    if (op !== 100) n.opacity = op;
    if (fl !== 100) n.fill = fl;
    var bm = U.blendNameAM(d.mode);
    if (bm && bm !== "normal" && !(n.kind === "group" && bm === "passThrough")) n.blend = bm;
    if (n.kind === "group" && bm !== "passThrough") n.blend = bm;
    try {
      var b = d.bounds;
      if (b && b.width && (b.width.v || b.height.v)) n.bounds = [Math.round(b.left.v), Math.round(b.top.v), Math.round(b.right.v), Math.round(b.bottom.v)];
    } catch (e) {}
    if (d.group === true) n.clipped = true;
    if (d.hasUserMask) n.mask = "pixel";
    if (d.hasVectorMask) n.vectorMask = true;
    if (d.hasFilterMask) n.filterMask = true;
    var fx = effectsList(d.layerEffects);
    if (fx.length) n.effects = fx;
    if (d.textKey) {
      var ti = U.textInfo(L, d);
      n.text = ti.text;
      if (ti.runs.length) { var r0 = ti.runs[0]; n.font = r0.font; n.fontSize = r0.size; n.color = r0.color; n.tracking = r0.tracking; }
      if (ti.runs.length > 1) n.textRuns = ti.runs.length;
    }
    if (d.smartObject) { n.smart = { linked: !!d.smartObject.linked, file: d.smartObject.fileReference || null, missing: !!d.smartObject.linkMissing }; if (d.smartObject.link && d.smartObject.link.libraryName) n.smart.library = d.smartObject.link.libraryName; }
    if (d.adjustment && d.adjustment.length) { var a0 = d.adjustment[0]; n.adjustmentType = a0._c; if (a0._c === "solidColorLayer" && a0.color) n.fillColor = U.hex({ r: a0.color.red, g: a0.color.grain, b: a0.color.blue }); }
    if (d.artboard) n.artboard = true;
    if (opts.raw) n.raw = d;
    return n;
  }
  U.layerNode = nodeOf;

  function walk(container, depth, opts, out) {
    for (var i = 0; i < container.layers.length; i++) {
      var L = container.layers[i];
      var n = nodeOf(L, opts);
      if (opts.hiddenOnly === false && !L.visible) continue;
      if (L.typename === "LayerSet") {
        n.children = [];
        if (depth + 1 <= opts.depth) walk(L, depth + 1, opts, n.children); else n.collapsed = L.layers.length;
      }
      out.push(n);
    }
  }
  OPS.layers = function (A) {
    var doc = U.doc(A.doc);
    var opts = { depth: U.pick(A, "depth", 6), raw: !!A.raw, hiddenOnly: A.includeHidden === false ? false : true };
    var out = [];
    var root = doc;
    if (A.group) root = U.findLayer(A.group, doc);
    walk(root, 0, opts, out);
    return { document: doc.name, layers: out };
  };

  OPS.layerInfo = function (A) {
    var doc = U.doc(A.doc);
    var L = U.findLayer(A.layer, doc);
    var d = U.layerDesc(L, false);
    var n = nodeOf(L, {});
    if (d.textKey) n.textInfo = U.textInfo(L, d);
    if (d.layerEffects) n.effectsDetail = U.fxFriendly(d.layerEffects);
    if (d.smartObject) n.smartObject = d.smartObject;
    if (d.adjustment) n.adjustment = d.adjustment;
    if (d.AGMStrokeStyleInfo) n.stroke = U.strokeFriendly(d.AGMStrokeStyleInfo);
    if (d.keyOriginType && d.keyOriginType[0]) { var ko = d.keyOriginType[0]; n.shapeOrigin = { type: ko.keyOriginType, radii: ko.keyOriginRRectRadii ? { tl: ko.keyOriginRRectRadii.topLeft.v, tr: ko.keyOriginRRectRadii.topRight.v, bl: ko.keyOriginRRectRadii.bottomLeft.v, br: ko.keyOriginRRectRadii.bottomRight.v } : undefined }; }
    if (d.hasUserMask) n.maskDetail = { density: d.userMaskDensity / 2.55, feather: d.userMaskFeather && d.userMaskFeather.v !== undefined ? d.userMaskFeather.v : d.userMaskFeather };
    if (d.blendOptions) n.blendOptions = d.blendOptions;
    if (d.blendRange) n.blendIf = d.blendRange;
    if (A.raw) n.raw = AM.toObj(U.layerDescRaw(L.id), !!A.exact);
    return n;
  };

  // ---------- crear capas ----------
  OPS.createLayer = function (A) {
    var doc = U.useDoc(A.doc);
    var kind = A.kind || "pixel", L;
    if (kind === "group") { L = doc.layerSets.add(); }
    else if (kind === "pixel") {
      L = doc.artLayers.add();
      if (A.fillColor) { U.selectLayer(L); doc.selection.selectAll(); doc.selection.fill(U.solid(A.fillColor)); doc.selection.deselect(); }
    } else if (kind === "solid" || kind === "gradient") {
      var f = kind === "solid" ? { type: "color", color: A.color } : U.extend({ type: "gradient" }, A.gradient || {});
      AM.play("make", { "null": { _ref: [{ cls: "contentLayer", form: "class" }] }, using: { _c: "contentLayer", type: fillContent(f) } });
      L = doc.activeLayer;
    } else U.fail("kind no valido: " + kind + " (pixel, group, solid, gradient)");
    if (A.name) L.name = A.name;
    U.placeNew(L, A, doc);
    U.applyBasics(L, A);
    return U.layerBrief(L);
  };

  // ---------- formas ----------
  U.strokeObj = function (s) {
    var content = s.gradient ? fillContent(U.extend({ type: "gradient" }, s.gradient)) : { _c: "solidColorLayer", color: U.rgbObj(s.color || "#FFFFFF") };
    var align = { center: "strokeStyleAlignCenter", inside: "strokeStyleAlignInside", outside: "strokeStyleAlignOutside" }[s.align || "center"];
    var cap = { butt: "strokeStyleButtCap", round: "strokeStyleRoundCap", square: "strokeStyleSquareCap" }[s.cap || "butt"];
    var join = { miter: "strokeStyleMiterJoin", round: "strokeStyleRoundJoin", bevel: "strokeStyleBevelJoin" }[s.join || "miter"];
    var dash = []; if (s.dash) for (var i = 0; i < s.dash.length; i++) dash.push({ _u: "noneUnit", v: s.dash[i] });
    return { _c: "strokeStyle", strokeStyleVersion: { _i: 2 }, strokeEnabled: s.enabled !== false, fillEnabled: true, strokeStyleLineWidth: { _u: "pixelsUnit", v: U.pick(s, "width", 2) }, strokeStyleLineDashOffset: { _u: "pointsUnit", v: 0 }, strokeStyleMiterLimit: 100, strokeStyleLineCapType: { _e: ["strokeStyleLineCapType", cap] }, strokeStyleLineJoinType: { _e: ["strokeStyleLineJoinType", join] }, strokeStyleLineAlignment: { _e: ["strokeStyleLineAlignment", align] }, strokeStyleScaleLock: false, strokeStyleStrokeAdjust: false, strokeStyleLineDashSet: dash, strokeStyleBlendMode: U.blendAM(s.blend || "normal"), strokeStyleOpacity: { _u: "percentUnit", v: U.pick(s, "opacity", 100) }, strokeStyleContent: content, strokeStyleResolution: 72 };
  };
  U.strokeFriendly = function (s) {
    var c = s.strokeStyleContent || {};
    var out = { enabled: !!s.strokeEnabled, fillEnabled: !!s.fillEnabled, width: s.strokeStyleLineWidth && s.strokeStyleLineWidth.v, opacity: s.strokeStyleOpacity && s.strokeStyleOpacity.v };
    if (c.color) out.color = U.hex({ r: c.color.red, g: c.color.grain, b: c.color.blue });
    if (s.strokeStyleLineAlignment) out.align = String(s.strokeStyleLineAlignment._e[1]).replace("strokeStyleAlign", "").toLowerCase();
    return out;
  };

  function setShapeStroke(L, s, noFill) {
    U.selectLayer(L);
    var o = U.strokeObj(s);
    if (noFill) o.fillEnabled = false;
    AM.play("set", { "null": { _ref: [{ cls: "contentLayer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, to: { _c: "shapeStyle", strokeStyle: o } });
  }
  U.setShapeStroke = setShapeStroke;

  function pxu(v) { return { _u: "pixelsUnit", v: v }; }
  function pathFromPoints(doc, pts, closed) {
    var arr = [];
    for (var i = 0; i < pts.length; i++) { var p = new PathPointInfo(); p.kind = PointKind.CORNERPOINT; p.anchor = [pts[i][0], pts[i][1]]; p.leftDirection = p.anchor; p.rightDirection = p.anchor; arr.push(p); }
    var sp = new SubPathInfo(); sp.operation = ShapeOperation.SHAPEXOR; sp.closed = closed !== false; sp.entireSubPath = arr;
    return doc.pathItems.add("vz_path", [sp]);
  }

  OPS.addShape = function (A) {
    var doc = U.useDoc(A.doc);
    var type = A.shape || "rectangle";
    var x = U.pick(A, "x", 0), y = U.pick(A, "y", 0), w = U.pick(A, "width", 200), h = U.pick(A, "height", 200);
    if (A.anchor && A.anchor !== "topleft") { var pt = U.anchorPoint([0, 0, w, h], A.anchor); x = x - pt[0]; y = y - pt[1]; }
    var fill = U.has(A, "fill") && typeof A.fill !== "number" ? A.fill : (U.has(A, "color") ? A.color : "#FFFFFF");
    var content = fillContent(fill);
    var before = doc.activeLayer;
    if (type === "rectangle" || type === "roundRect" || type === "ellipse" || type === "circle") {
      var geom;
      if (type === "ellipse" || type === "circle") { if (type === "circle") h = w; geom = { _c: "ellipse", top: pxu(y), left: pxu(x), bottom: pxu(y + h), right: pxu(x + w) }; }
      else {
        geom = { _c: "rectangle", unitValueQuadVersion: { _i: 1 }, top: pxu(y), left: pxu(x), bottom: pxu(y + h), right: pxu(x + w) };
        var rd = A.radius;
        if (type === "roundRect" || rd) {
          var r = typeof rd === "number" ? [rd, rd, rd, rd] : (rd instanceof Array ? rd : [24, 24, 24, 24]); // tl,tr,br,bl
          if (rd === "pill") { var rr = Math.min(w, h) / 2; r = [rr, rr, rr, rr]; }
          geom.topLeft = pxu(r[0]); geom.topRight = pxu(r[1]); geom.bottomRight = pxu(r[2]); geom.bottomLeft = pxu(r[3]);
        }
      }
      AM.play("make", { "null": { _ref: [{ cls: "contentLayer", form: "class" }] }, using: { _c: "contentLayer", type: content, shape: geom } });
    } else {
      var pts = [];
      if (type === "polygon" || type === "star") {
        var n = A.sides || (type === "star" ? 5 : 6), cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2, rot = (U.pick(A, "rotation", 0) - 90) * Math.PI / 180;
        var inner = U.pick(A, "innerRadius", 0.5);
        var total = type === "star" ? n * 2 : n;
        for (var i = 0; i < total; i++) { var rad = type === "star" ? (i % 2 === 0 ? R : R * inner) : R; var ang = rot + i * 2 * Math.PI / total; pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]); }
      } else if (type === "line") {
        var x2 = U.pick(A, "x2", x + w), y2 = U.pick(A, "y2", y), t = U.pick(A, "thickness", 4);
        var dx = x2 - x, dy = y2 - y, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len * t / 2, ny = dx / len * t / 2;
        pts = [[x + nx, y + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x - nx, y - ny]];
      } else if (type === "path") {
        pts = A.points;
        if (!pts || pts.length < 2) U.fail("shape 'path' necesita points: [[x,y],...]");
      } else U.fail("shape no valido: " + type + " (rectangle, roundRect, ellipse, circle, polygon, star, line, path)");
      var path = pathFromPoints(doc, pts, A.closed);
      path.select();
      AM.play("make", { "null": { _ref: [{ cls: "contentLayer", form: "class" }] }, using: { _c: "contentLayer", type: content } });
      try { path.remove(); } catch (e) {}
    }
    var L = doc.activeLayer;
    if (A.stroke) setShapeStroke(L, A.stroke, A.fill === null || A.fill === "none");
    else if (A.fill === null || A.fill === "none") setShapeStroke(L, { width: 0, enabled: false }, true);
    if (A.name) L.name = A.name;
    U.placeNew(L, A, doc);
    var rest = U.extend({}, A); delete rest.fill; delete rest.name;
    if (U.has(A, "fill") && typeof A.fill === "number") rest.fill = A.fill; else if (U.has(A, "fillOpacity")) rest.fill = A.fillOpacity;
    U.applyBasics(L, rest);
    if (A.name) L.name = A.name;
    if (U.has(A, "rotation") && A.rotation && (type === "rectangle" || type === "roundRect" || type === "ellipse" || type === "circle")) L.rotate(A.rotation, AnchorPosition.MIDDLECENTER);
    if (A.effects) U.applyEffects(L, A.effects, A.effectsMode || "replace");
    return U.layerBrief(L);
  };

  // Mesa de trabajo (artboard) con tamano y posicion exactos: se crea "a partir de capas" desde un rectangulo temporal.
  OPS.createArtboard = function (A) {
    var doc = U.useDoc(A.doc);
    var x = U.pick(A, "x", 0), y = U.pick(A, "y", 0), w = U.pick(A, "width", 1080), h = U.pick(A, "height", 1350);
    OPS.addShape({ doc: A.doc, shape: "rectangle", x: x, y: y, width: w, height: h, fill: "#FFFFFF", name: "vz_tmp_artboard" });
    AM.play("make", { "null": { _ref: [{ cls: "artboardSection", form: "class" }] }, from: { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, using: { _c: "artboardSection", name: A.name || "Artboard" }, layerSectionStart: { _i: 3 }, layerSectionEnd: { _i: 4 }, name: A.name || "Artboard" });
    var G = doc.activeLayer;
    try { var tmp = U.findLayer({ name: "vz_tmp_artboard" }, doc); tmp.remove(); } catch (e) {}
    if (A.background) { try { AM.play("set", { "null": { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, to: { _c: "artboard", artboardBackgroundType: { _i: 3 }, color: U.rgbObj(A.background) } }); } catch (e2) {} }
    var rect = U.layerProps(G, ["artboard"]).artboard.artboardRect;
    return { id: G.id, name: G.name, bounds: [rect.left, rect.top, rect.right, rect.bottom], size: [rect.right - rect.left, rect.bottom - rect.top] };
  };

  // ---------- modificar capas ----------
  OPS.setLayer = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    U.selectLayer(L);
    U.applyBasics(L, A);
    if (A.mask) OPS.mask(U.extend({ layer: L.id }, A.mask));
    // geometria
    if (U.has(A, "resize")) { var rz = A.resize; L.resize(U.pick(rz, "x", rz.scale || 100), U.pick(rz, "y", rz.scale || 100), AnchorPosition.MIDDLECENTER); }
    if (U.has(A, "size")) { // {width,height} en px, conserva proporcion si falta uno
      var b = U.layerBounds(L), cw = b[2] - b[0], ch = b[3] - b[1];
      var sx = A.size.width ? A.size.width / cw * 100 : null, sy = A.size.height ? A.size.height / ch * 100 : null;
      if (sx === null) sx = sy; if (sy === null) sy = sx;
      L.resize(sx, sy, AnchorPosition.MIDDLECENTER);
    }
    if (U.has(A, "rotate") && A.rotate) L.rotate(A.rotate, AnchorPosition.MIDDLECENTER);
    if (A.skew) { AM.play("transform", { "null": { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, freeTransformCenterState: { _e: ["quadCenterState", "QCSAverage"] }, offset: { _c: "offset", horizontal: pxu(0), vertical: pxu(0) }, skew: { _c: "paint", horizontal: pxu(A.skew.x || 0), vertical: pxu(A.skew.y || 0) } }); }
    if (A.flip === "horizontal") L.resize(-100, 100, AnchorPosition.MIDDLECENTER);
    if (A.flip === "vertical") L.resize(100, -100, AnchorPosition.MIDDLECENTER);
    if (U.has(A, "x") || U.has(A, "y")) U.moveTo(L, U.has(A, "x") ? A.x : null, U.has(A, "y") ? A.y : null, A.anchor || "topleft");
    if (U.has(A, "moveBy")) L.translate(UnitValue(A.moveBy.x || 0, "px"), UnitValue(A.moveBy.y || 0, "px"));
    if (A.alignTo) OPS.align({ layers: [L.id], to: A.alignTo.to, h: A.alignTo.h, v: A.alignTo.v });
    // orden
    if (A.parent) U.moveIntoGroup(L, A.parent, doc);
    else if (A.above) L.move(U.findLayer(A.above, doc), ElementPlacement.PLACEBEFORE);
    else if (A.below) L.move(U.findLayer(A.below, doc), ElementPlacement.PLACEAFTER);
    else if (A.order === "front") L.move(doc.layers[0], ElementPlacement.PLACEBEFORE);
    else if (A.order === "back") L.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER);
    else if (A.order === "up") { var idx = 0; try { L.move(L.parent.layers[Math.max(0, indexIn(L) - 1)], ElementPlacement.PLACEBEFORE); } catch (e) {} }
    else if (A.order === "down") { try { L.move(L.parent.layers[Math.min(L.parent.layers.length - 1, indexIn(L) + 1)], ElementPlacement.PLACEAFTER); } catch (e2) {} }
    if (A.fillColor && L.kind === LayerKind.SOLIDFILL) { AM.play("set", { "null": { _ref: [{ cls: "contentLayer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, to: { _c: "solidColorLayer", color: U.rgbObj(A.fillColor) } }); }
    if (A.shapeStroke) U.setShapeStroke(L, A.shapeStroke, false);
    if (A.blendIf) OPS.blendIf(U.extend({ layer: L.id }, A.blendIf));
    if (A.effects) U.applyEffects(L, A.effects, A.effectsMode || "replace");
    return U.layerBrief(L);
  };
  function indexIn(L) { var p = L.parent; for (var i = 0; i < p.layers.length; i++) if (p.layers[i].id === L.id) return i; return 0; }

  OPS.deleteLayer = function (A) {
    var doc = U.useDoc(A.doc);
    var refs = A.layers || [A.layer], names = [];
    for (var i = 0; i < refs.length; i++) { var L = U.findLayer(refs[i], doc); names.push(L.name); L.remove(); }
    return { deleted: names };
  };

  OPS.duplicateLayer = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    var target = A.toDocument ? U.findDoc(A.toDocument) : null;
    var D = target ? L.duplicate(target, ElementPlacement.PLACEATBEGINNING) : L.duplicate();
    if (target) { app.activeDocument = target; D = target.layers[0]; }
    if (A.name) D.name = A.name;
    if (!target) { U.selectLayer(D); if (U.has(A, "x") || U.has(A, "y")) U.moveTo(D, U.has(A, "x") ? A.x : null, U.has(A, "y") ? A.y : null, A.anchor || "topleft"); if (A.offset) D.translate(UnitValue(A.offset.x || 0, "px"), UnitValue(A.offset.y || 0, "px")); U.applyBasics(D, A); }
    return U.layerBrief(D);
  };

  OPS.group = function (A) {
    var doc = U.useDoc(A.doc);
    var refs = A.layers || [];
    if (!refs.length) U.fail("Indica layers: [..] a agrupar.");
    var first = U.findLayer(refs[0], doc);
    // selecciona todas (seleccion multiple) y agrupa
    U.selectLayer(first);
    for (var i = 1; i < refs.length; i++) {
      var Li = U.findLayer(refs[i], doc);
      AM.play("select", { "null": { _ref: [{ cls: "layer", form: "id", value: Li.id }] }, selectionModifier: { _e: ["selectionModifierType", "addToSelection"] }, makeVisible: false });
    }
    AM.play("make", { "null": { _ref: [{ cls: "layerSection", form: "class" }] }, from: { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, using: { _c: "layerSection", name: A.name || "Grupo" } });
    var G = doc.activeLayer;
    U.applyBasics(G, A.name ? U.extend({}, A) : A);
    if (A.effects) U.applyEffects(G, A.effects, "replace");
    return U.layerBrief(G);
  };

  OPS.ungroup = function (A) {
    var doc = U.useDoc(A.doc);
    var G = U.findLayer(A.layer, doc);
    if (G.typename !== "LayerSet") U.fail("'" + G.name + "' no es un grupo.");
    var name = G.name, n = G.layers.length;
    for (var i = G.layers.length - 1; i >= 0; i--) G.layers[i].move(G, ElementPlacement.PLACEBEFORE);
    G.remove();
    return { ungrouped: name, layersReleased: n };
  };

  OPS.mergeLayers = function (A) {
    var doc = U.useDoc(A.doc);
    if (A.layers && A.layers.length) {
      U.selectLayer(U.findLayer(A.layers[0], doc));
      for (var i = 1; i < A.layers.length; i++) AM.play("select", { "null": { _ref: [{ cls: "layer", form: "id", value: U.findLayer(A.layers[i], doc).id }] }, selectionModifier: { _e: ["selectionModifierType", "addToSelection"] }, makeVisible: false });
    } else U.selectLayer(U.findLayer(A.layer, doc));
    if (A.mode === "stamp") AM.play("mergeVisible", { duplicate: true });
    else AM.play("mergeLayersNew");
    var L = doc.activeLayer;
    if (A.name) L.name = A.name;
    return U.layerBrief(L);
  };

  OPS.rasterize = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    var what = A.what || "layer"; // layer | style | text | shape | smart
    U.selectLayer(L);
    if (what === "style") L.rasterize(RasterizeType.LAYERSTYLE);
    else if (what === "text") L.rasterize(RasterizeType.TEXTCONTENTS);
    else if (what === "shape") L.rasterize(RasterizeType.SHAPE);
    else L.rasterize(RasterizeType.ENTIRELAYER);
    return U.layerBrief(doc.activeLayer);
  };

  OPS.align = function (A) {
    var doc = U.useDoc(A.doc);
    var refs = A.layers || [], Ls = [];
    for (var i = 0; i < refs.length; i++) Ls.push(U.findLayer(refs[i], doc));
    var to = A.to || "canvas"; // canvas | selection | first
    var W = U.px(doc.width), H = U.px(doc.height);
    var box = [0, 0, W, H];
    if (to === "first" && Ls.length) box = U.layerBounds(Ls[0]);
    else if (to && typeof to === "object") box = [to.x, to.y, to.x + to.width, to.y + to.height];
    else if (to === "artboard" && A.artboard) { var ab = U.layerDesc(U.findLayer(A.artboard, doc)).artboard.artboardRect; box = [ab.left, ab.top, ab.right, ab.bottom]; }
    for (var j = 0; j < Ls.length; j++) {
      if (to === "first" && j === 0) continue;
      var b = U.layerBounds(Ls[j]), dx = 0, dy = 0;
      if (A.h === "left") dx = box[0] - b[0]; else if (A.h === "center") dx = (box[0] + box[2]) / 2 - (b[0] + b[2]) / 2; else if (A.h === "right") dx = box[2] - b[2];
      if (A.v === "top") dy = box[1] - b[1]; else if (A.v === "middle" || A.v === "center") dy = (box[1] + box[3]) / 2 - (b[1] + b[3]) / 2; else if (A.v === "bottom") dy = box[3] - b[3];
      if (dx || dy) Ls[j].translate(UnitValue(dx, "px"), UnitValue(dy, "px"));
    }
    if (A.distribute && Ls.length > 2) { // "h" o "v": reparte en partes iguales entre el primero y el ultimo
      var dir = A.distribute, items = Ls.slice(0);
      items.sort(function (p, q) { var bp = U.layerBounds(p), bq = U.layerBounds(q); return dir === "h" ? bp[0] - bq[0] : bp[1] - bq[1]; });
      var first = U.layerBounds(items[0]), last = U.layerBounds(items[items.length - 1]), totalSize = 0;
      for (var k = 0; k < items.length; k++) { var bk = U.layerBounds(items[k]); totalSize += dir === "h" ? bk[2] - bk[0] : bk[3] - bk[1]; }
      var span = dir === "h" ? last[2] - first[0] : last[3] - first[1], gap = (span - totalSize) / (items.length - 1), cursor = dir === "h" ? first[0] : first[1];
      for (var m = 0; m < items.length; m++) { var bm = U.layerBounds(items[m]); var cur = dir === "h" ? bm[0] : bm[1]; var d2 = cursor - cur; if (d2) items[m].translate(UnitValue(dir === "h" ? d2 : 0, "px"), UnitValue(dir === "h" ? 0 : d2, "px")); cursor += (dir === "h" ? bm[2] - bm[0] : bm[3] - bm[1]) + gap; }
    }
    return { aligned: Ls.length };
  };

  // ---------- imagenes (objetos inteligentes) ----------
  OPS.placeImage = function (A) {
    var doc = U.useDoc(A.doc);
    var f = new File(A.path);
    if (!f.exists) U.fail("No existe el archivo: " + A.path);
    var d = { "null": { _p: A.path }, freeTransformCenterState: { _e: ["quadCenterState", "QCSAverage"] }, offset: { _c: "offset", horizontal: pxu(0), vertical: pxu(0) } };
    if (A.linked) d.linked = true;
    AM.play("placeEvent", d);
    var L = doc.activeLayer;
    if (A.name) L.name = A.name;
    // ajustar a una caja
    var box = A.box; // {x,y,width,height}
    if (box) {
      var b = U.layerBounds(L), cw = b[2] - b[0], ch = b[3] - b[1];
      var fit = A.fit || "cover";
      var sx = box.width / cw, sy = box.height / ch, s = fit === "contain" ? Math.min(sx, sy) : (fit === "stretch" ? null : Math.max(sx, sy));
      if (fit === "stretch") L.resize(sx * 100, sy * 100, AnchorPosition.MIDDLECENTER); else L.resize(s * 100, s * 100, AnchorPosition.MIDDLECENTER);
      U.moveTo(L, box.x + box.width / 2 + U.pick(A, "offsetX", 0), box.y + box.height / 2 + U.pick(A, "offsetY", 0), "center");
      if (fit === "cover") OPS.mask({ layer: L.id, type: "rect", rect: box, radius: A.radius });
    } else {
      if (U.has(A, "scale")) L.resize(A.scale, A.scale, AnchorPosition.MIDDLECENTER);
      if (U.has(A, "width") || U.has(A, "height")) { var bb = U.layerBounds(L), w0 = bb[2] - bb[0], h0 = bb[3] - bb[1]; var sw = A.width ? A.width / w0 * 100 : null, sh = A.height ? A.height / h0 * 100 : null; if (sw === null) sw = sh; if (sh === null) sh = sw; L.resize(sw, sh, AnchorPosition.MIDDLECENTER); }
      if (U.has(A, "x") || U.has(A, "y")) U.moveTo(L, U.has(A, "x") ? A.x : null, U.has(A, "y") ? A.y : null, A.anchor || "topleft");
    }
    if (A.rotation) L.rotate(A.rotation, AnchorPosition.MIDDLECENTER);
    U.placeNew(L, A, doc);
    U.applyBasics(L, A);
    if (A.effects) U.applyEffects(L, A.effects, A.effectsMode || "replace");
    var brief = U.layerBrief(L);
    return brief;
  };

  OPS.smartObject = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    U.selectLayer(L);
    var act = A.action || "convert";
    if (act === "convert") AM.play("newPlacedLayer");
    else if (act === "replace") AM.play("placedLayerReplaceContents", { "null": { _p: A.path }, placeIn: { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] } }), null;
    else if (act === "edit") AM.play("placedLayerEditContents");
    else if (act === "relink") AM.play("placedLayerRelinkToFile", { "null": { _p: A.path } });
    else if (act === "embed") AM.play("placedLayerConvertToEmbedded");
    else if (act === "toLinked") AM.play("placedLayerConvertToLinked", { "null": { _p: A.path } });
    else if (act === "rasterize") L.rasterize(RasterizeType.ENTIRELAYER);
    else U.fail("action no valida: convert, replace, edit, relink, embed, toLinked, rasterize");
    return U.layerBrief(doc.activeLayer);
  };

  // ---------- mascaras ----------
  OPS.mask = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    U.selectLayer(L);
    var type = A.type || "revealAll";
    if (type === "delete") { AM.play("delete", { "null": { _ref: [{ cls: "channel", form: "enum", enumType: "channel", value: "mask" }] }, apply: !!A.apply }); return { ok: true }; }
    if (type === "apply") { AM.play("delete", { "null": { _ref: [{ cls: "channel", form: "enum", enumType: "channel", value: "mask" }] }, apply: true }); return { ok: true }; }
    if (type === "clip") { L.grouped = true; return U.layerBrief(L); }
    if (type === "unclip") { L.grouped = false; return U.layerBrief(L); }
    var using = "revealAll";
    if (type === "hideAll") using = "hideAll";
    else if (type === "rect" || type === "ellipse" || type === "selection" || type === "gradient") using = "revealSelection";
    if (type === "rect" || type === "ellipse") {
      var r = A.rect || { x: 0, y: 0, width: U.px(doc.width), height: U.px(doc.height) };
      var d = { "null": { _ref: [{ cls: "channel", form: "property", value: "selection" }] }, to: type === "ellipse" ? { _c: "ellipse", top: pxu(r.y), left: pxu(r.x), bottom: pxu(r.y + r.height), right: pxu(r.x + r.width) } : { _c: "rectangle", unitValueQuadVersion: { _i: 1 }, top: pxu(r.y), left: pxu(r.x), bottom: pxu(r.y + r.height), right: pxu(r.x + r.width) } };
      if (A.radius && type === "rect") { var rr = A.radius === "pill" ? Math.min(r.width, r.height) / 2 : A.radius; d.to.topLeft = pxu(rr); d.to.topRight = pxu(rr); d.to.bottomLeft = pxu(rr); d.to.bottomRight = pxu(rr); }
      AM.play("set", d);
      if (A.feather) doc.selection.feather(UnitValue(A.feather, "px"));
    }
    if (type === "gradient") {
      // degradado negro->blanco sobre la capa: direccion hacia donde se REVELA ("up","down","left","right","radial")
      var b = U.layerBounds(L), dir = A.direction || "up";
      var x1 = b[0], y1 = b[1], x2 = b[2], y2 = b[3], cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      var from, to;
      if (dir === "up") { from = [cx, y2]; to = [cx, y1]; } else if (dir === "down") { from = [cx, y1]; to = [cx, y2]; } else if (dir === "left") { from = [x2, cy]; to = [x1, cy]; } else if (dir === "right") { from = [x1, cy]; to = [x2, cy]; } else { from = [cx, cy]; to = [x2, cy]; }
      var from0 = U.pick(A, "start", 0), end0 = U.pick(A, "end", 100);
      AM.play("make", { "new": { _cls: "channel" }, at: { _ref: [{ cls: "channel", form: "enum", enumType: "channel", value: "mask" }] }, using: { _e: ["userMaskEnabled", "revealAll"] } });
      AM.play("select", { "null": { _ref: [{ cls: "channel", form: "enum", enumType: "channel", value: "mask" }] }, makeVisible: false });
      doc.selection.deselect();
      AM.play("#Grdn", { from: { _c: "paint", horizontal: pxu(from[0]), vertical: pxu(from[1]) }, to: { _c: "paint", horizontal: pxu(to[0]), vertical: pxu(to[1]) }, type: { _e: ["gradientType", dir === "radial" ? "radial" : "linear"] }, gradient: U.gradientObj([{ color: "#000000", pos: from0 }, { color: "#FFFFFF", pos: end0 }]), dither: true, reverse: !!A.reverse });
      AM.play("select", { "null": { _ref: [{ cls: "channel", form: "enum", enumType: "channel", value: "RGB" }] }, makeVisible: false });
      return U.layerBrief(L);
    }
    AM.play("make", { "new": { _cls: "channel" }, at: { _ref: [{ cls: "channel", form: "enum", enumType: "channel", value: "mask" }] }, using: { _e: ["userMaskEnabled", using] } });
    if (type === "rect" || type === "ellipse" || type === "selection") doc.selection.deselect();
    // densidad y difuminado de la mascara
    if (U.has(A, "density") || U.has(A, "maskFeather")) {
      AM.play("set", { "null": { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, to: { _c: "layer", userMaskDensity: { _i: Math.round(U.pick(A, "density", 100) * 2.55) }, userMaskFeather: pxu(U.pick(A, "maskFeather", 0)) } });
    }
    return U.layerBrief(L);
  };

  // Mezcla avanzada "Mezclar si": canal gray|red|green|blue; this/under: [negroMin, negroMax, blancoMin, blancoMax]
  OPS.blendIf = function (A) {
    var doc = U.useDoc(A.doc);
    var L = U.findLayer(A.layer, doc);
    U.selectLayer(L);
    var ch = A.channel || "gray";
    var t = A.this || [0, 0, 255, 255], u = A.under || [0, 0, 255, 255];
    var chName = { gray: "gray", red: "red", green: "green", blue: "blue" }[ch] || "gray";
    var range = { _c: "blendRange", channel: { _ref: [{ cls: "channel", form: "enum", enumType: "channel", value: chName }] }, srcBlackMin: { _i: t[0] }, srcBlackMax: { _i: t[1] }, srcWhiteMin: { _i: t[2] }, srcWhiteMax: { _i: t[3] }, destBlackMin: { _i: u[0] }, destBlackMax: { _i: u[1] }, destWhiteMin: { _i: u[2] }, destWhiteMax: { _i: u[3] } };
    AM.play("set", { "null": { _ref: [{ cls: "layer", form: "enum", enumType: "ordinal", value: "targetEnum" }] }, to: { _c: "layer", blendRange: [range] } });
    return U.layerBrief(L);
  };
})();
