// Exportar y previsualizar sin tocar el documento original (se trabaja sobre un duplicado).
(function () {
  var U = VZ.util, AM = VZ.am, OPS = VZ.ops;

  function tmpPath(ext) { return Folder.temp.fsName + "/vz_prev_" + (new Date().getTime()) + "_" + Math.floor(Math.random() * 9999) + "." + ext; }

  function saveCopy(doc, file, fmt, quality) {
    var f = new File(file);
    if (fmt === "png") {
      var po = new PNGSaveOptions(); po.compression = 6; po.interlaced = false;
      doc.saveAs(f, po, true, Extension.LOWERCASE);
    } else if (fmt === "jpg" || fmt === "jpeg") {
      var jo = new JPEGSaveOptions(); jo.quality = Math.max(0, Math.min(12, Math.round((quality || 85) / 100 * 12)));
      jo.embedColorProfile = true; jo.formatOptions = FormatOptions.STANDARDBASELINE; jo.matte = MatteType.NONE;
      doc.saveAs(f, jo, true, Extension.LOWERCASE);
    } else if (fmt === "psd") {
      var so = new PhotoshopSaveOptions(); so.layers = true; so.embedColorProfile = true;
      doc.saveAs(f, so, true, Extension.LOWERCASE);
    } else if (fmt === "tif" || fmt === "tiff") {
      var to = new TiffSaveOptions(); to.layers = false; to.imageCompression = TIFFEncoding.TIFFLZW; to.embedColorProfile = true;
      doc.saveAs(f, to, true, Extension.LOWERCASE);
    } else if (fmt === "bmp") {
      var bo = new BMPSaveOptions(); bo.depth = BMPDepthType.TWENTYFOUR; bo.osType = OperatingSystem.WINDOWS; bo.rleCompression = false; bo.flipRowOrder = false;
      doc.saveAs(f, bo, true, Extension.LOWERCASE);
    } else if (fmt === "pdf") {
      var pd = new PDFSaveOptions(); pd.presetFile = "High Quality Print"; pd.layers = false;
      doc.saveAs(f, pd, true, Extension.LOWERCASE);
    } else U.fail("Formato no soportado: " + fmt + " (usa png, jpg, psd, tif, pdf)");
    return f;
  }
  U.saveCopy = saveCopy;

  function setVisibility(dup, A) {
    if (A.showOnly && A.showOnly.length) { // oculta todo lo de nivel superior que no este en la lista y sus ancestros
      var keep = {};
      for (var i = 0; i < A.showOnly.length; i++) {
        var L = U.findLayer(A.showOnly[i], dup);
        keep[L.id] = true;
        var p = L.parent;
        while (p && p.typename === "LayerSet") { keep[p.id] = true; p = p.parent; }
      }
      U.eachLayer(dup, function (L2) {
        if (L2.typename === "LayerSet") { if (!keep[L2.id]) L2.visible = false; }
        else L2.visible = !!keep[L2.id];
        return true;
      });
      // los grupos conservados deben quedar visibles
      U.eachLayer(dup, function (L3) { if (L3.typename === "LayerSet" && keep[L3.id]) L3.visible = true; return true; });
    }
    if (A.hide && A.hide.length) for (var j = 0; j < A.hide.length; j++) U.findLayer(A.hide[j], dup).visible = false;
    if (A.show && A.show.length) for (var k = 0; k < A.show.length; k++) { var S = U.findLayer(A.show[k], dup); S.visible = true; var q = S.parent; while (q && q.typename === "LayerSet") { q.visible = true; q = q.parent; } }
  }

  // Vista previa: duplica, ajusta visibilidad, recorta, reduce y guarda. Devuelve la ruta del archivo.
  OPS.preview = function (A) {
    var src = U.doc(A.doc);
    var prevActive = app.activeDocument;
    var fmt = (A.format || "jpg").toLowerCase();
    // sin pedir capas concretas basta un duplicado ya combinado: es mucho mas rapido en documentos pesados
    var needLayers = !!(A.showOnly || A.hide || A.show || A.layer || A.artboard);
    var dup = src.duplicate("vz_preview", !needLayers);
    var out = null;
    try {
      app.activeDocument = dup;
      setVisibility(dup, A);
      var W = U.px(dup.width), H = U.px(dup.height);
      if (A.crop) { // {x,y,width,height} en pixeles del documento
        var cx = Math.max(0, A.crop.x), cy = Math.max(0, A.crop.y);
        var cw = Math.min(W - cx, A.crop.width), ch = Math.min(H - cy, A.crop.height);
        dup.crop([cx, cy, cx + cw, cy + ch]);
        W = U.px(dup.width); H = U.px(dup.height);
      } else if (A.artboard) {
        var ab = U.findLayer(A.artboard, dup), r = U.layerDesc(ab).artboard.artboardRect;
        dup.crop([r.left, r.top, r.right, r.bottom]);
        W = U.px(dup.width); H = U.px(dup.height);
      } else if (A.layer) { // recorta al contorno de una capa
        var L = U.findLayer(A.layer, dup), b = L.bounds;
        var pad = U.pick(A, "padding", 0);
        dup.crop([Math.max(0, U.px(b[0]) - pad), Math.max(0, U.px(b[1]) - pad), Math.min(W, U.px(b[2]) + pad), Math.min(H, U.px(b[3]) + pad)]);
        W = U.px(dup.width); H = U.px(dup.height);
      }
      try { if (dup.mode !== DocumentMode.RGB) dup.changeMode(ChangeMode.RGB); if (dup.bitsPerChannel !== BitsPerChannelType.EIGHT) dup.bitsPerChannel = BitsPerChannelType.EIGHT; } catch (e) {}
      var maxSide = A.maxSize || 1568;
      var scale = Math.min(1, maxSide / Math.max(W, H));
      if (A.scale) scale = A.scale;
      if (scale < 1) dup.resizeImage(UnitValue(Math.max(1, Math.round(W * scale)), "px"), UnitValue(Math.max(1, Math.round(H * scale)), "px"), dup.resolution, ResampleMethod.BICUBICSHARPER);
      var file = A.path ? A.path : tmpPath(fmt === "jpeg" ? "jpg" : fmt);
      dup.flatten();
      saveCopy(dup, file, fmt, A.quality || 85);
      out = { path: U.slash(file), width: U.px(dup.width), height: U.px(dup.height), format: fmt, sourceWidth: W, sourceHeight: H, scale: U.round(scale, 4) };
    } finally {
      try { dup.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
      try { app.activeDocument = prevActive; } catch (e3) {}
    }
    return out;
  };

  // Exporta (guarda una copia) el documento completo, cada artboard, o cada grupo de nivel superior.
  OPS.exportDoc = function (A) {
    var src = U.doc(A.doc);
    var fmt = (A.format || "png").toLowerCase();
    var dir = new Folder(A.folder || Folder.desktop.fsName);
    if (!dir.exists) dir.create();
    var base = (A.name || src.name.replace(/\.[^.]+$/, ""));
    var results = [];
    var prevActive = app.activeDocument;
    function one(name, cropRect, vis) {
      var dup = src.duplicate("vz_export", false);
      try {
        app.activeDocument = dup;
        if (vis) setVisibility(dup, vis);
        if (cropRect) dup.crop(cropRect);
        if (A.scale && A.scale !== 1) dup.resizeImage(UnitValue(Math.round(U.px(dup.width) * A.scale), "px"), UnitValue(Math.round(U.px(dup.height) * A.scale), "px"), dup.resolution, ResampleMethod.BICUBICSHARPER);
        if (fmt !== "psd" && !A.keepLayers) dup.flatten();
        var ext = fmt === "jpeg" ? "jpg" : fmt;
        var file = dir.fsName + "/" + name + "." + ext;
        saveCopy(dup, file, fmt, A.quality || 90);
        results.push({ file: U.slash(file), width: U.px(dup.width), height: U.px(dup.height) });
      } finally {
        try { dup.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
        try { app.activeDocument = prevActive; } catch (e2) {}
      }
    }
    var mode = A.mode || "document";
    if (mode === "artboards") {
      var abs = [];
      U.eachLayer(src, function (L) {
        if (L.typename === "LayerSet") { try { var d = U.layerDesc(L); if (d.artboard) abs.push({ name: L.name, r: d.artboard.artboardRect }); } catch (e) {} }
        return true;
      });
      if (!abs.length) U.fail("El documento no tiene artboards.");
      for (var i = 0; i < abs.length; i++) one(base + "_" + abs[i].name, [abs[i].r.left, abs[i].r.top, abs[i].r.right, abs[i].r.bottom], null);
    } else if (mode === "slices") { // A.slices: [{name,x,y,width,height}]
      var sl = A.slices || [];
      if (!sl.length) U.fail("Indica slices: [{name,x,y,width,height}] (por ejemplo las diapositivas de un carrusel).");
      for (var s = 0; s < sl.length; s++) one(base + "_" + (sl[s].name || (s + 1)), [sl[s].x, sl[s].y, sl[s].x + sl[s].width, sl[s].y + sl[s].height], A.visibility || null);
    } else if (mode === "groups") {
      for (var g = 0; g < src.layers.length; g++) {
        var G = src.layers[g];
        if (G.typename !== "LayerSet") continue;
        one(base + "_" + G.name, null, { showOnly: [G.id] });
      }
    } else one(base, A.crop ? [A.crop.x, A.crop.y, A.crop.x + A.crop.width, A.crop.y + A.crop.height] : null, A.visibility || null);
    return { files: results };
  };
})();
