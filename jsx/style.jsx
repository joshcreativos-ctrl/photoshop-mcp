// Analisis de estilo: lee un documento y devuelve hallazgos medibles (paleta, tipografia, efectos, mezclas, estructura, maquetacion).
// Node convierte estos hallazgos en un perfil de estilo y una guia.
(function () {
  var U = VZ.util, AM = VZ.am, OPS = VZ.ops;

  function hexOf(c) { return U.amHex(c); }
  function enumOf(e) { return e && e._e ? e._e[1] : e; }
  function bump(map, key, extra) { if (!map[key]) map[key] = { n: 0 }; map[key].n++; if (extra) U.extend(map[key], extra); return map[key]; }
  function push(arr, v, max) { if (arr.length < (max || 6) && arr.indexOf(v) < 0) arr.push(v); }
  // Sin expresiones regulares complejas: el motor de ExtendScript puede colgarse con ellas.
  var DEFAULT_WORDS = ["capa", "layer", "grupo", "group", "rectángulo", "rectangle", "elipse", "ellipse", "forma", "shape", "objeto inteligente", "smart object", "relleno", "fill", "texto", "text", "objeto inteligente vectorial"];
  function isDefaultName(n) {
    var s = String(n).toLowerCase(), out = "", i, ch;
    for (i = 0; i < s.length; i++) { ch = s.charAt(i); if (ch < "0" || ch > "9") out += ch; }
    out = out.split("copia").join("").split("copy").join("").split("  ").join(" ").split("  ").join(" ");
    while (out.charAt(0) === " ") out = out.substr(1);
    while (out.charAt(out.length - 1) === " ") out = out.substr(0, out.length - 1);
    return DEFAULT_WORDS.indexOf(out) >= 0;
  }
  function inferSlides(W, H) {
    var best = null, ratios = [[1, 1, "1:1"], [4, 5, "4:5"], [9, 16, "9:16"], [3, 4, "3:4"], [16, 9, "16:9"], [1.91, 1, "1.91:1"]];
    for (var n = 1; n <= 10; n++) {
      var w = W / n, r = w / H;
      for (var i = 0; i < ratios.length; i++) {
        var want = ratios[i][0] / ratios[i][1], err = Math.abs(r - want) / want;
        if (err < 0.02 && (!best || err < best.err - 0.001 || (n > 1 && best.count === 1 && err < best.err + 0.02))) best = { count: n, width: Math.round(w), height: H, ratio: ratios[i][2], err: err };
      }
    }
    return best ? { count: best.count, width: best.width, height: best.height, ratio: best.ratio } : { count: 1, width: W, height: H, ratio: "custom" };
  }

  OPS.analyzeStyle = function (A) {
    var doc = U.doc(A.doc);
    var W = U.px(doc.width), H = U.px(doc.height);
    var out = { document: U.docSummary(doc), slides: inferSlides(W, H) };
    var guides = [];
    try { for (var gi = 0; gi < doc.guides.length; gi++) guides.push({ d: String(doc.guides[gi].direction).replace("Direction.", ""), p: U.px(doc.guides[gi].coordinate) }); } catch (e0) {}
    out.guides = guides;

    var colors = {}, typo = {}, fxSigs = {}, blends = {}, fillHabit = { fill: [], opacity: [] }, shapes = [], adjustments = {}, images = { smart: 0, linked: 0, embedded: 0, pixel: 0, libraries: {}, names: [] };
    var structure = { layers: 0, groups: 0, hidden: 0, maxDepth: 0, clipped: 0, pixelMasks: 0, vectorMasks: 0, copies: 0, defaultNames: 0, customNames: 0, groupNames: [] };
    var texts = [], gradients = [], total = 0, limit = A.maxLayers || 600;
    var T0 = new Date().getTime(), budget = A.budgetMs || 150000, timedOut = false;
    function trace(msg) { if (!A.logFile) return; var lf = new File(A.logFile); lf.open("a"); lf.writeln((new Date().getTime() - T0) + "ms " + msg); lf.close(); }
    var topLevel = [];

    function addColor(hex, src, w) {
      if (!hex) return;
      var c = colors[hex] || (colors[hex] = { n: 0, src: {} });
      c.n += (w || 1); c.src[src] = (c.src[src] || 0) + 1;
    }
    function addGradient(g, where) {
      if (!g || !g.colors) return;
      var stops = [];
      for (var i = 0; i < g.colors.length; i++) { var h = hexOf(g.colors[i].color); stops.push({ color: h, pos: U.round(g.colors[i].location / 40.96, 0) }); addColor(h, "gradient"); }
      if (g.transparency) for (var j = 0; j < g.transparency.length && j < stops.length; j++) if (g.transparency[j].opacity.v !== 100) stops[j].opacity = g.transparency[j].opacity.v;
      gradients.push({ where: where, stops: stops });
    }

    U.eachLayer(doc, function (L, depth, path) {
      if (total++ >= limit) return false;
      if (new Date().getTime() - T0 > budget) { timedOut = true; return false; }
      trace("layer " + L.id + " " + L.name);
      var d;
      try { d = U.layerDesc(L, false); } catch (e) { return true; }
      trace("  desc ok");
      var kind = U.kindName(d), name = L.name;
      structure.layers++;
      if (depth === 0) topLevel.push({ name: name, kind: kind, id: L.id });
      if (depth > structure.maxDepth) structure.maxDepth = depth;
      if (!L.visible) structure.hidden++;
      if (kind === "group") { structure.groups++; push(structure.groupNames, name, 12); }
      if (d.group === true) structure.clipped++;
      if (d.hasUserMask) structure.pixelMasks++;
      if (d.hasVectorMask) structure.vectorMasks++;
      if (String(name).toLowerCase().indexOf("copia") >= 0 || String(name).toLowerCase().indexOf("copy") >= 0) structure.copies++;
      if (isDefaultName(name)) structure.defaultNames++; else structure.customNames++;

      // mezcla
      var bm = U.blendNameAM(d.mode);
      if (kind !== "group" || bm !== "passThrough") {
        var b = bump(blends, bm); b.kinds = b.kinds || {}; b.kinds[kind] = (b.kinds[kind] || 0) + 1; b.names = b.names || []; push(b.names, name, 4);
      }
      var op = U.round(d.opacity / 2.55, 0), fl = d.fillOpacity !== undefined ? U.round(d.fillOpacity / 2.55, 0) : 100;
      if (kind !== "group") { if (fl !== 100) fillHabit.fill.push({ kind: kind, v: fl }); if (op !== 100) fillHabit.opacity.push({ kind: kind, v: op }); }

      // texto
      if (d.textKey) {
        var ti = U.textInfo(L, d);
        for (var r = 0; r < ti.runs.length; r++) {
          var run = ti.runs[r], key = run.font + "|" + Math.round(run.size) + "|" + run.tracking;
          var t = typo[key] || (typo[key] = { font: run.font, family: run.family, style: run.style, size: Math.round(run.size), tracking: run.tracking, leading: run.leading, caps: run.caps || "none", color: run.color, variation: run.variation, n: 0, samples: [], colors: {} });
          t.n++; push(t.samples, ti.text.split("\n")[0], 3); t.colors[run.color] = 1;
          addColor(run.color, "texto");
        }
        var up = ti.text.replace(/[^A-Za-zÀ-ÿ]/g, "");
        texts.push({ text: ti.text, w: ti.bounds.width, h: ti.bounds.height, cx: ti.bounds.x + ti.bounds.width / 2, cy: ti.bounds.y + ti.bounds.height / 2, x: ti.bounds.x, y: ti.bounds.y, align: ti.align, rotation: ti.rotation, upper: up.length > 0 && up === up.toUpperCase(), multiRun: ti.runs.length > 1, kind: ti.kind, size: ti.runs[0] && ti.runs[0].size });
      }

      // efectos
      if (d.layerEffects) {
        var fr = U.fxFriendly(d.layerEffects);
        var has = false; for (var fk in fr) if (fr.hasOwnProperty(fk) && fk.charAt(0) !== "_") has = true;
        if (has) {
          delete fr._disabledInstances;
          var sig = VZ.json.stringify(fr);
          var e = fxSigs[sig] || (fxSigs[sig] = { n: 0, layers: [], kinds: {}, friendly: fr, raw: null });
          e.n++; push(e.layers, name, 5); e.kinds[kind] = (e.kinds[kind] || 0) + 1;
          if (!e.raw) { try { e.raw = U.layerDesc(L, true).layerEffects; } catch (e2) {} }
          var le = d.layerEffects, i2, arr;
          arr = le.dropShadowMulti || []; for (i2 = 0; i2 < arr.length; i2++) if (arr[i2].enabled) addColor(hexOf(arr[i2].color), "sombra");
          arr = le.innerShadowMulti || []; for (i2 = 0; i2 < arr.length; i2++) if (arr[i2].enabled) addColor(hexOf(arr[i2].color), "sombra-interna");
          if (le.outerGlow && le.outerGlow.enabled) addColor(hexOf(le.outerGlow.color), "resplandor");
          if (le.innerGlow && le.innerGlow.enabled) addColor(hexOf(le.innerGlow.color), "resplandor-interno");
          arr = le.solidFillMulti || []; for (i2 = 0; i2 < arr.length; i2++) if (arr[i2].enabled) addColor(hexOf(arr[i2].color), "superposicion");
          arr = le.gradientFillMulti || []; for (i2 = 0; i2 < arr.length; i2++) if (arr[i2].enabled) addGradient(arr[i2].gradient, "superposicion de degradado");
          arr = le.frameFXMulti || []; for (i2 = 0; i2 < arr.length; i2++) if (arr[i2].enabled) addColor(hexOf(arr[i2].color), "trazo");
        }
      }

      // formas
      if (kind === "shape" || kind === "solid-fill" || kind === "gradient-fill") {
        var sh = { name: name, kind: kind, w: d.bounds && d.bounds.width ? Math.round(d.bounds.width.v) : null, h: d.bounds && d.bounds.height ? Math.round(d.bounds.height.v) : null, x: d.bounds && d.bounds.left ? Math.round(d.bounds.left.v) : null, y: d.bounds && d.bounds.top ? Math.round(d.bounds.top.v) : null };
        if (d.adjustment && d.adjustment[0]) {
          var a0 = d.adjustment[0];
          if (a0._c === "solidColorLayer") { sh.fill = hexOf(a0.color); addColor(sh.fill, "forma"); }
          else if (a0._c === "gradientLayer") { sh.fill = "gradient"; addGradient(a0.gradient, "relleno de forma"); }
        }
        if (d.keyOriginType && d.keyOriginType[0] && d.keyOriginType[0].keyOriginRRectRadii) { var rr = d.keyOriginType[0].keyOriginRRectRadii; sh.radius = Math.round(rr.topLeft.v); if (sh.w && sh.h) sh.radiusRatio = U.round(rr.topLeft.v / (Math.min(sh.w, sh.h) / 2), 2); }
        if (d.AGMStrokeStyleInfo && d.AGMStrokeStyleInfo.strokeEnabled) { var st = U.strokeFriendly(d.AGMStrokeStyleInfo); sh.stroke = st; if (st.color) addColor(st.color, "trazo"); }
        sh.vectorMask = !!d.hasVectorMask;
        shapes.push(sh);
      }

      // imagenes
      if (d.smartObject) {
        images.smart++;
        if (d.smartObject.linked) { images.linked++; if (d.smartObject.link && d.smartObject.link.libraryName) images.libraries[d.smartObject.link.libraryName] = (images.libraries[d.smartObject.link.libraryName] || 0) + 1; }
        else images.embedded++;
        push(images.names, name, 10);
      } else if (kind === "pixel" && d.bounds && d.bounds.width && d.bounds.width.v * d.bounds.height.v > W * H * 0.05) { images.pixel++; push(images.names, name, 10); }

      // ajustes
      if (kind === "adjustment" && d.adjustment && d.adjustment[0]) {
        var an = d.adjustment[0]._c; var ad = bump(adjustments, an); ad.names = ad.names || []; push(ad.names, name, 3);
        if (an === "gradientMapClass") addGradient(d.adjustment[0].gradient, "mapa de degradado");
        if (an === "photoFilter" && d.adjustment[0].color) addColor(hexOf(d.adjustment[0].color), "filtro-foto");
      }
      return true;
    });

    trace("loop end");
    // paleta ordenada
    var plist = [];
    for (var hx in colors) if (colors.hasOwnProperty(hx)) plist.push({ hex: hx, n: colors[hx].n, src: colors[hx].src });
    plist.sort(function (a, b) { return b.n - a.n; });
    out.colors = plist.slice(0, 60);
    out.gradients = gradients.slice(0, 20);

    var tl = []; for (var tk in typo) if (typo.hasOwnProperty(tk)) {
      var tv = typo[tk]; tv.colors = U.keys(tv.colors);
      try { var rf = U.findFont(tv.font); tv.installed = !!rf; if (rf) { tv.staticFont = rf.ps; if (rf.fromVariable) { tv.variableWeight = rf.variableWeight; tv.fromVariable = true; } } } catch (ef) { tv.installed = false; }
      tl.push(tv);
    }
    tl.sort(function (a, b) { return b.size - a.size; });
    out.typography = tl;
    out.texts = texts;

    var el = []; for (var ek in fxSigs) if (fxSigs.hasOwnProperty(ek)) el.push(fxSigs[ek]);
    el.sort(function (a, b) { return b.n - a.n; });
    out.effects = el.slice(0, 12);

    out.blends = blends;
    out.fillHabit = fillHabit;
    out.shapes = shapes.slice(0, 40);
    out.adjustments = adjustments;
    out.images = images;
    structure.topLevel = topLevel.slice(0, 40);
    out.structure = structure;
    trace("post done");
    out.truncated = total >= limit || timedOut;
    out.analyzedLayers = structure.layers;
    out.elapsedMs = new Date().getTime() - T0;
    return out;
  };
})();
