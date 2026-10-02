// Videazo Photoshop MCP · biblioteca ExtendScript (ES3). Solo ASCII: todo texto con acentos llega desde Node.
var VZ_VERSION = "1.0.0";
(function () {
  var AP = Array.prototype;
  if (!AP.indexOf) AP.indexOf = function (x, from) { for (var i = from || 0; i < this.length; i++) if (this[i] === x) return i; return -1; };
  if (!AP.forEach) AP.forEach = function (f, t) { for (var i = 0; i < this.length; i++) f.call(t, this[i], i, this); };
  if (!AP.map) AP.map = function (f, t) { var r = []; for (var i = 0; i < this.length; i++) r.push(f.call(t, this[i], i, this)); return r; };
  if (!AP.filter) AP.filter = function (f, t) { var r = []; for (var i = 0; i < this.length; i++) if (f.call(t, this[i], i, this)) r.push(this[i]); return r; };
  if (!String.prototype.trim) String.prototype.trim = function () { return this.replace(/^\s+|\s+$/g, ""); };

  var JSONX = {};
  var BS = String.fromCharCode(92);
  function quote(s) {
    s = String(s);
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), c = s.charCodeAt(i);
      if (ch === '"') out += BS + '"';
      else if (ch === BS) out += BS + BS;
      else if (c === 10) out += BS + "n";
      else if (c === 13) out += BS + "r";
      else if (c === 9) out += BS + "t";
      else if (c < 32 || c > 126) out += BS + "u" + ("0000" + c.toString(16)).slice(-4);
      else out += ch;
    }
    return '"' + out + '"';
  }
  function str(v, depth) {
    if (depth > 60) return "null";
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "string") return quote(v);
    if (t === "number") return isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(str(v[i], depth + 1)); return "[" + a.join(",") + "]"; }
    if (t === "object") {
      if (v instanceof UnitValue) return String(v.as("px"));
      var p = [];
      for (var k in v) { if (!v.hasOwnProperty(k)) continue; var x = v[k]; if (typeof x === "function" || x === undefined) continue; p.push(quote(k) + ":" + str(x, depth + 1)); }
      return "{" + p.join(",") + "}";
    }
    return "null";
  }
  JSONX.stringify = function (v) { return str(v, 0); };
  JSONX.parse = function (s) { return eval("(" + s + ")"); };

  var VZ = $.global.VZ = { v: VZ_VERSION, json: JSONX, ops: {}, util: {}, BS: BS };

  // ---------- ejecucion: aisla errores, fuerza pixeles, agrupa en un paso de historial ----------
  VZ.exec = function (argsJson, body, histName) {
    var res, out, err = null;
    var oldDlg = app.displayDialogs, oldRuler = null, oldType = null;
    try {
      app.displayDialogs = DialogModes.NO;
      oldRuler = app.preferences.rulerUnits; oldType = app.preferences.typeUnits;
      app.preferences.rulerUnits = Units.PIXELS; app.preferences.typeUnits = TypeUnits.PIXELS;
      var A = argsJson ? JSONX.parse(argsJson) : null;
      // el paso de historial debe abrirse sobre el documento con el que se trabaja
      if (A && (typeof A.doc === "string" || typeof A.doc === "number") && app.documents.length) { try { VZ.util.doc(A.doc); } catch (eDoc) {} }
      var fn = new Function("A", body);
      if (histName && app.documents.length) {
        VZ._job = function () { try { out = fn(A); } catch (e) { err = e; } };
        app.activeDocument.suspendHistory(histName, "VZ._job()");
        if (err) throw err;
      } else out = fn(A);
      res = { ok: true, result: out === undefined ? null : out };
    } catch (e) {
      res = { ok: false, error: (e && e.message ? e.message : String(e)), line: e && e.line };
    }
    try { if (oldRuler !== null) { app.preferences.rulerUnits = oldRuler; app.preferences.typeUnits = oldType; } app.displayDialogs = oldDlg; } catch (e2) {}
    return JSONX.stringify(res);
  };

  // ---------- utilidades ----------
  var U = VZ.util;
  U.fail = function (m) { throw new Error(m); };
  U.isArr = function (x) { return x instanceof Array; };
  U.has = function (o, k) { return o !== null && o !== undefined && o[k] !== undefined && o[k] !== null; };
  U.pick = function (o, k, d) { return U.has(o, k) ? o[k] : d; };
  U.num = function (x, d) { var n = Number(x); return isFinite(n) ? n : d; };
  U.round = function (n, p) { var m = Math.pow(10, p === undefined ? 2 : p); return Math.round(n * m) / m; };
  U.extend = function (a, b) { for (var k in b) if (b.hasOwnProperty(k)) a[k] = b[k]; return a; };
  U.keys = function (o) { var r = []; for (var k in o) if (o.hasOwnProperty(k)) r.push(k); return r; };
  U.slash = function (s) { return String(s).split(BS).join("/"); };

  // Colores. Entrada: "#RRGGBB", "#RGB", "rgb(r,g,b)", {r,g,b}, {red,green,blue}, [r,g,b]. Salida {r,g,b} 0-255.
  U.rgb = function (c) {
    if (c === null || c === undefined) return null;
    if (typeof c === "string") {
      var s = c.trim();
      var m = s.match(/^#?([0-9a-fA-F]{6})$/);
      if (m) return { r: parseInt(m[1].substr(0, 2), 16), g: parseInt(m[1].substr(2, 2), 16), b: parseInt(m[1].substr(4, 2), 16) };
      m = s.match(/^#?([0-9a-fA-F]{3})$/);
      if (m) return { r: parseInt(m[1].charAt(0) + m[1].charAt(0), 16), g: parseInt(m[1].charAt(1) + m[1].charAt(1), 16), b: parseInt(m[1].charAt(2) + m[1].charAt(2), 16) };
      m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
      if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
      U.fail("Color no valido: " + c + " (usa #RRGGBB)");
    }
    if (c instanceof Array) return { r: c[0], g: c[1], b: c[2] };
    if (U.has(c, "r")) return { r: c.r, g: c.g, b: c.b };
    if (U.has(c, "red")) return { r: c.red, g: U.has(c, "green") ? c.green : c.grain, b: c.blue };
    U.fail("Color no valido");
  };
  U.hex = function (c) {
    function h(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? "0" : "") + n.toString(16).toUpperCase(); }
    return "#" + h(c.r) + h(c.g) + h(c.b);
  };
  // Color de un descriptor de Action Manager (RGB, RGB flotante, CMYK) a "#RRGGBB". Otros modos: gris medio.
  U.amHex = function (c) {
    if (!c) return null;
    if (c.red !== undefined) return U.hex({ r: c.red, g: c.grain !== undefined ? c.grain : c.green, b: c.blue });
    if (c.redFloat !== undefined) return U.hex({ r: c.redFloat * 255, g: c.greenFloat * 255, b: c.blueFloat * 255 });
    if (c.cyan !== undefined) {
      var k = (c.black || 0) / 100, cy = c.cyan / 100, m = c.magenta / 100, y = (c.yellowColor !== undefined ? c.yellowColor : c.yellow) / 100;
      return U.hex({ r: 255 * (1 - cy) * (1 - k), g: 255 * (1 - m) * (1 - k), b: 255 * (1 - y) * (1 - k) });
    }
    return "#808080";
  };
  U.solid = function (c) {
    var k = U.rgb(c), s = new SolidColor();
    s.rgb.red = k.r; s.rgb.green = k.g; s.rgb.blue = k.b;
    return s;
  };

  // Documento: por nombre, indice (desde 1) o el activo. Si se pide uno concreto se vuelve el activo:
  // las consultas de Action Manager (capas por id, propiedades) siempre hablan del documento activo.
  U.findDoc = function (ref) {
    var prev = app.activeDocument, d = U.doc(ref);
    if (prev && app.activeDocument !== prev) { try { app.activeDocument = prev; } catch (e) {} }
    return d;
  };
  U.doc = function (ref) {
    if (ref === undefined || ref === null || ref === "") {
      if (!app.documents.length) U.fail("No hay ningun documento abierto en Photoshop. Usa ps_open o ps_new_document.");
      return app.activeDocument;
    }
    var found = null;
    if (typeof ref === "number") { if (ref < 1 || ref > app.documents.length) U.fail("No existe el documento #" + ref); found = app.documents[ref - 1]; }
    else {
      var want = U.slash(ref).toLowerCase();
      for (var i = 0; i < app.documents.length && !found; i++) {
        var d = app.documents[i];
        if (d.name.toLowerCase() === want) found = d;
        else { try { if (U.slash(d.fullName.fsName).toLowerCase() === want) found = d; } catch (e) {} }
      }
      if (!found) U.fail("No encontre el documento '" + ref + "'. Abiertos: " + U.docNames());
    }
    if (app.activeDocument !== found) app.activeDocument = found;
    return found;
  };
  U.docNames = function () { var r = []; for (var i = 0; i < app.documents.length; i++) r.push(app.documents[i].name); return r.join(", "); };
  U.useDoc = function (ref) { return U.doc(ref); };
  U.px = function (v) { return v instanceof UnitValue ? v.as("px") : Number(v); };
})();
