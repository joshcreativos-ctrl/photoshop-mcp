// Inspeccion: documento, capas, recursos.
(function () {
  var U = VZ.util, AM = VZ.am, OPS = VZ.ops;

  // ---------- recorrido y busqueda de capas ----------
  function eachLayer(container, fn, depth, path) {
    depth = depth || 0;
    for (var i = 0; i < container.layers.length; i++) {
      var L = container.layers[i];
      var p = (path ? path + "/" : "") + L.name;
      if (fn(L, depth, p, i) === false) return false;
      if (L.typename === "LayerSet") { if (eachLayer(L, fn, depth + 1, p) === false) return false; }
    }
    return true;
  }
  U.eachLayer = eachLayer;

  function jshort(r) { try { return VZ.json.stringify(r); } catch (e) { return String(r); } }

  // ref: numero (id), texto (nombre o "Grupo/Subgrupo/Capa"), o {id|name|index|path|nth}
  U.findLayer = function (ref, doc) {
    doc = doc || U.doc();
    if (ref === undefined || ref === null || ref === "" || ref === "active") {
      try { return doc.activeLayer; } catch (e) { U.fail("No hay capa activa."); }
    }
    var hit = null, nth = 1, byId = null, byName = null, byPath = null, byIndex = null;
    if (typeof ref === "number") byId = ref;
    else if (typeof ref === "string") { if (ref.indexOf("/") >= 0) byPath = ref; else byName = ref; }
    else { byId = ref.id; byName = ref.name; byPath = ref.path; byIndex = ref.index; nth = ref.nth || 1; }
    var count = 0, i = 0;
    var lowerName = byName ? String(byName).toLowerCase() : null;
    var lowerPath = byPath ? String(byPath).toLowerCase() : null;
    eachLayer(doc, function (L, depth, path) {
      i++;
      if (byId !== null && byId !== undefined) { if (L.id === byId) { hit = L; return false; } return true; }
      if (byIndex !== null && byIndex !== undefined) { if (i === byIndex) { hit = L; return false; } return true; }
      if (lowerPath) { if (path.toLowerCase() === lowerPath) { count++; if (count >= nth) { hit = L; return false; } } return true; }
      if (byName) { if (L.name === byName) { count++; if (count >= nth) { hit = L; return false; } } return true; }
      return true;
    });
    if (!hit && lowerName) {
      count = 0;
      eachLayer(doc, function (L) { if (L.name.toLowerCase() === lowerName) { count++; if (count >= nth) { hit = L; return false; } } return true; });
    }
    if (!hit && lowerName) {
      count = 0;
      eachLayer(doc, function (L) { if (L.name.toLowerCase().indexOf(lowerName) >= 0) { count++; if (count >= nth) { hit = L; return false; } } return true; });
    }
    if (!hit) U.fail("No encontre la capa " + jshort(ref) + ". Usa ps_layers para ver las capas disponibles.");
    return hit;
  };

  U.layerDescRaw = function (id) {
    var r = new ActionReference();
    r.putIdentifier(AM.k("layer"), id);
    return executeActionGet(r);
  };
  // Propiedades sueltas de una capa (una consulta barata por clave): evita pedir el descriptor completo,
  // que en capas con efectos grandes o objetos inteligentes puede tardar segundos.
  var LITE_KEYS = ["name", "visible", "mode", "opacity", "fillOpacity", "layerKind", "layerSection", "group", "hasUserMask", "hasVectorMask", "hasFilterMask", "userMaskDensity", "userMaskFeather", "artboard", "artboardRect", "layerEffects", "textKey", "smartObject", "adjustment", "AGMStrokeStyleInfo", "keyOriginType", "boundsNoEffects", "blendRange", "color", "fillEnabled", "vectorMaskEnabled"];
  U.layerProps = function (L, keys, exact) {
    var o = {};
    for (var i = 0; i < keys.length; i++) {
      try {
        var r = new ActionReference();
        r.putProperty(AM.k("property"), AM.k(keys[i]));
        r.putIdentifier(AM.k("layer"), L.id);
        var d = executeActionGet(r), kid = AM.k(keys[i]);
        if (d.hasKey(kid)) o[keys[i]] = AM.val(d, kid, exact);
      } catch (e) {}
    }
    if (o.boundsNoEffects !== undefined) o.bounds = o.boundsNoEffects;
    return o;
  };
  U.layerDesc = function (L, exact) {
    if (VZ.fullDesc) return AM.toObj(U.layerDescRaw(L.id), exact);
    return U.layerProps(L, LITE_KEYS, exact);
  };
  U.selectLayer = function (L) {
    var d = new ActionDescriptor(), r = new ActionReference();
    r.putIdentifier(AM.k("layer"), L.id);
    d.putReference(AM.k("null"), r);
    d.putBoolean(AM.k("makeVisible"), false);
    executeAction(AM.k("select"), d, DialogModes.NO);
    return L;
  };

  // ---------- documento ----------
  var MODES = {}; MODES[DocumentMode.RGB] = "RGB"; MODES[DocumentMode.CMYK] = "CMYK"; MODES[DocumentMode.GRAYSCALE] = "Gris"; MODES[DocumentMode.LAB] = "Lab"; MODES[DocumentMode.BITMAP] = "Mapa de bits"; MODES[DocumentMode.INDEXEDCOLOR] = "Indexado"; MODES[DocumentMode.MULTICHANNEL] = "Multicanal"; MODES[DocumentMode.DUOTONE] = "Duotono";
  var DEPTH = {}; DEPTH[BitsPerChannelType.EIGHT] = 8; DEPTH[BitsPerChannelType.SIXTEEN] = 16; DEPTH[BitsPerChannelType.THIRTYTWO] = 32; DEPTH[BitsPerChannelType.ONE] = 1;

  U.docSummary = function (doc) {
    var o = { name: doc.name, path: null, saved: false };
    try { o.path = doc.fullName.fsName.replace(/\\/g, "/"); o.saved = true; } catch (e2) {}
    o.width = U.px(doc.width); o.height = U.px(doc.height);
    o.resolution = doc.resolution;
    o.mode = MODES[doc.mode] || String(doc.mode);
    o.bitsPerChannel = DEPTH[doc.bitsPerChannel] || String(doc.bitsPerChannel);
    try { o.colorProfile = doc.colorProfileName; o.colorProfileType = String(doc.colorProfileType).replace("ColorProfile.", ""); } catch (e3) {}
    o.pixelAspectRatio = doc.pixelAspectRatio;
    return o;
  };

  OPS.status = function (A) {
    var r = { app: "Adobe Photoshop", version: app.version, build: app.build, locale: app.locale, documents: [], active: null };
    for (var i = 0; i < app.documents.length; i++) {
      var d = app.documents[i], path = null;
      try { path = d.fullName.fsName.replace(/\\/g, "/"); } catch (e) {}
      r.documents.push({ index: i + 1, name: d.name, width: U.px(d.width), height: U.px(d.height), path: path });
    }
    if (app.documents.length) { r.active = app.activeDocument.name; try { r.activeLayer = app.activeDocument.activeLayer.name; } catch (e) {} }
    try { r.fontCount = app.fonts.length; } catch (e2) {}
    return r;
  };

  OPS.docInfo = function (A) {
    var doc = U.doc(A.doc);
    var o = U.docSummary(doc);
    o.guides = [];
    try { for (var i = 0; i < doc.guides.length; i++) { var g = doc.guides[i]; o.guides.push({ direction: String(g.direction).replace("Direction.", ""), position: U.px(g.coordinate) }); } } catch (e) {}
    var total = 0, groups = 0, artboards = [], hidden = 0, kinds = {};
    eachLayer(doc, function (L) {
      total++;
      if (L.typename === "LayerSet") {
        groups++;
        try {
          var ab = U.layerProps(L, ["artboard"], false);
          if (ab.artboard && ab.artboard.artboardRect) { var arr = ab.artboard.artboardRect; artboards.push({ id: L.id, name: L.name, left: arr.left, top: arr.top, right: arr.right, bottom: arr.bottom, width: arr.right - arr.left, height: arr.bottom - arr.top }); }
        } catch (e) {}
      } else {
        var k = String(L.kind).replace("LayerKind.", ""); kinds[k] = (kinds[k] || 0) + 1;
      }
      if (!L.visible) hidden++;
    });
    o.layerCount = total; o.groups = groups; o.hiddenLayers = hidden; o.kinds = kinds; o.artboards = artboards;
    try { var ch = []; for (var j = 0; j < doc.channels.length; j++) ch.push(doc.channels[j].name); o.channels = ch; } catch (e) {}
    try { var ps = []; for (var j2 = 0; j2 < doc.pathItems.length; j2++) ps.push(doc.pathItems[j2].name); o.paths = ps; } catch (e) {}
    try { var lc = []; for (var j3 = 0; j3 < doc.layerComps.length; j3++) lc.push(doc.layerComps[j3].name); o.layerComps = lc; } catch (e) {}
    try { o.activeHistoryState = doc.activeHistoryState.name; o.historyStates = doc.historyStates.length; } catch (e) {}
    if (A.raw) { try { o.raw = AM.toObj(AM.getDesc(AM.targetDoc()), false); } catch (e) { o.raw = String(e); } }
    return o;
  };

  // Descriptor crudo de una capa (para depurar y para ps_layer_info con raw=true).
  OPS.layerRaw = function (A) {
    var doc = U.doc(A.doc);
    var L = U.findLayer(A.layer, doc);
    return AM.toObj(U.layerDescRaw(L.id), !!A.exact);
  };
})();
