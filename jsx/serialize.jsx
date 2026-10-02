// Action Manager <-> JSON (reversible). Formato etiquetado:
//   {_c:"clase", ...claves}  objeto            · {_u:"pixelsUnit", v:10}  unidad
//   {_e:["tipo","valor"]}    enumerado         · {_i:5}                    entero (en modo exacto)
//   {_cls:"id"}              clase             · {_p:"C:/ruta"}            ruta/alias
//   {_ref:[{form,cls,...}]}  referencia        · numero = double, texto = string, array = lista
(function () {
  var AM = VZ.am = {};
  var T = AM.t2s = function (t) {
    var s = "";
    try { s = typeIDToStringID(t); } catch (e) {}
    if (s) return s;
    try { return "#" + typeIDToCharID(t); } catch (e2) { return "#" + t; }
  };
  var K = AM.k = function (n) {
    if (typeof n === "number") return n;
    if (n.charAt(0) === "#") return charIDToTypeID(n.substr(1));
    return stringIDToTypeID(n);
  };
  AM.s2t = K;
  var DVT = DescValueType;

  function refToArr(r) {
    var out = [];
    var guard = 0;
    while (r && guard++ < 12) {
      var o = {};
      try {
        var f = r.getForm();
        o.cls = T(r.getDesiredClass());
        if (f == ReferenceFormType.CLASSTYPE) o.form = "class";
        else if (f == ReferenceFormType.ENUMERATED) { o.form = "enum"; o.enumType = T(r.getEnumeratedType()); o.value = T(r.getEnumeratedValue()); }
        else if (f == ReferenceFormType.IDENTIFIER) { o.form = "id"; o.value = r.getIdentifier(); }
        else if (f == ReferenceFormType.INDEX) { o.form = "index"; o.value = r.getIndex(); }
        else if (f == ReferenceFormType.NAME) { o.form = "name"; o.value = r.getName(); }
        else if (f == ReferenceFormType.OFFSET) { o.form = "offset"; o.value = r.getOffset(); }
        else if (f == ReferenceFormType.PROPERTY) { o.form = "property"; o.value = T(r.getProperty()); }
      } catch (e) { o.error = String(e.message || e); out.push(o); break; }
      out.push(o);
      try { r = r.getContainer(); } catch (e2) { r = null; }
    }
    return out;
  }
  function arrToRef(a) {
    var r = new ActionReference();
    for (var i = 0; i < a.length; i++) {
      var o = a[i], cls = K(o.cls);
      if (o.form == "class") r.putClass(cls);
      else if (o.form == "enum") r.putEnumerated(cls, K(o.enumType), K(o.value));
      else if (o.form == "id") r.putIdentifier(cls, o.value);
      else if (o.form == "index") r.putIndex(cls, o.value);
      else if (o.form == "name") r.putName(cls, o.value);
      else if (o.form == "offset") r.putOffset(cls, o.value);
      else if (o.form == "property") r.putProperty(cls, K(o.value));
    }
    return r;
  }
  AM.refToArr = refToArr; AM.arrToRef = arrToRef;

  function fromDesc(d, x) {
    var o = {};
    for (var i = 0; i < d.count; i++) {
      var k = d.getKey(i);
      o[T(k)] = fromKey(d, k, x);
    }
    return o;
  }
  function fromKey(d, k, x) {
    try { return fromKey2(d, k, x); } catch (e) { return { _err: String(e.message || e) }; }
  }
  function fromKey2(d, k, x) {
    var t = d.getType(k);
    if (t == DVT.OBJECTTYPE) { var o = fromDesc(d.getObjectValue(k), x); o._c = T(d.getObjectType(k)); return o; }
    if (t == DVT.LISTTYPE) return fromList(d.getList(k), x);
    if (t == DVT.UNITDOUBLE) return { _u: T(d.getUnitDoubleType(k)), v: d.getUnitDoubleValue(k) };
    if (t == DVT.DOUBLETYPE) return d.getDouble(k);
    if (t == DVT.INTEGERTYPE) return x ? { _i: d.getInteger(k) } : d.getInteger(k);
    if (t == DVT.LARGEINTEGERTYPE) return d.getLargeInteger(k);
    if (t == DVT.STRINGTYPE) return d.getString(k);
    if (t == DVT.BOOLEANTYPE) return d.getBoolean(k);
    if (t == DVT.ENUMERATEDTYPE) return { _e: [T(d.getEnumerationType(k)), T(d.getEnumerationValue(k))] };
    if (t == DVT.CLASSTYPE) return { _cls: T(d.getClass(k)) };
    if (t == DVT.REFERENCETYPE) return { _ref: refToArr(d.getReference(k)) };
    if (t == DVT.ALIASTYPE) { try { return { _p: d.getPath(k).fsName.replace(/\\/g, "/") }; } catch (e) { return { _p: null }; } }
    if (t == DVT.RAWTYPE) { try { return { _raw: d.getData(k).length }; } catch (e2) { return { _raw: -1 }; } }
    return null;
  }
  function fromList(l, x) {
    var a = [];
    for (var i = 0; i < l.count; i++) {
      var t = l.getType(i);
      if (t == DVT.OBJECTTYPE) { var o = fromDesc(l.getObjectValue(i), x); o._c = T(l.getObjectType(i)); a.push(o); }
      else if (t == DVT.LISTTYPE) a.push(fromList(l.getList(i), x));
      else if (t == DVT.UNITDOUBLE) a.push({ _u: T(l.getUnitDoubleType(i)), v: l.getUnitDoubleValue(i) });
      else if (t == DVT.DOUBLETYPE) a.push(l.getDouble(i));
      else if (t == DVT.INTEGERTYPE) a.push(x ? { _i: l.getInteger(i) } : l.getInteger(i));
      else if (t == DVT.STRINGTYPE) a.push(l.getString(i));
      else if (t == DVT.BOOLEANTYPE) a.push(l.getBoolean(i));
      else if (t == DVT.ENUMERATEDTYPE) a.push({ _e: [T(l.getEnumerationType(i)), T(l.getEnumerationValue(i))] });
      else if (t == DVT.CLASSTYPE) a.push({ _cls: T(l.getClass(i)) });
      else if (t == DVT.REFERENCETYPE) a.push({ _ref: refToArr(l.getReference(i)) });
      else a.push(null);
    }
    return a;
  }
  AM.toObj = function (desc, exact) { return fromDesc(desc, !!exact); };
  AM.val = function (d, k, exact) { return fromKey(d, k, !!exact); };

  // ---------- JSON -> ActionDescriptor ----------
  function isTag(v, k) { return v && typeof v === "object" && !(v instanceof Array) && v[k] !== undefined; }
  function putVal(d, key, v) {
    if (v === null || v === undefined) return;
    var t = typeof v;
    if (t === "number") d.putDouble(key, v);
    else if (t === "boolean") d.putBoolean(key, v);
    else if (t === "string") d.putString(key, v);
    else if (v instanceof Array) d.putList(key, toList(v));
    else if (isTag(v, "_i")) d.putInteger(key, v._i);
    else if (isTag(v, "_u")) d.putUnitDouble(key, K(v._u), v.v);
    else if (isTag(v, "_e")) d.putEnumerated(key, K(v._e[0]), K(v._e[1]));
    else if (isTag(v, "_cls")) d.putClass(key, K(v._cls));
    else if (isTag(v, "_p")) d.putPath(key, new File(v._p));
    else if (isTag(v, "_ref")) d.putReference(key, arrToRef(v._ref));
    else if (isTag(v, "_raw")) return;
    else {
      var cls = v._c ? K(v._c) : charIDToTypeID("null");
      d.putObject(key, cls, toDesc(v));
    }
  }
  function toList(a) {
    var l = new ActionList();
    for (var i = 0; i < a.length; i++) {
      var v = a[i], t = typeof v;
      if (v === null || v === undefined) continue;
      if (t === "number") l.putDouble(v);
      else if (t === "boolean") l.putBoolean(v);
      else if (t === "string") l.putString(v);
      else if (v instanceof Array) l.putList(toList(v));
      else if (isTag(v, "_i")) l.putInteger(v._i);
      else if (isTag(v, "_u")) l.putUnitDouble(K(v._u), v.v);
      else if (isTag(v, "_e")) l.putEnumerated(K(v._e[0]), K(v._e[1]));
      else if (isTag(v, "_cls")) l.putClass(K(v._cls));
      else if (isTag(v, "_p")) l.putPath(new File(v._p));
      else if (isTag(v, "_ref")) l.putReference(arrToRef(v._ref));
      else l.putObject(v._c ? K(v._c) : charIDToTypeID("null"), toDesc(v));
    }
    return l;
  }
  function toDesc(o) {
    var d = new ActionDescriptor();
    for (var k in o) {
      if (!o.hasOwnProperty(k) || k === "_c") continue;
      putVal(d, K(k), o[k]);
    }
    return d;
  }
  AM.toDesc = toDesc;

  // Ejecuta un evento: AM.play("make", {...}); devuelve el descriptor resultante como objeto.
  AM.play = function (event, obj, exact) {
    var r = executeAction(K(event), obj ? toDesc(obj) : new ActionDescriptor(), DialogModes.NO);
    return r ? fromDesc(r, !!exact) : null;
  };
  AM.get = function (refArr, exact) {
    var r = refArr instanceof Array ? arrToRef(refArr) : refArr;
    return fromDesc(executeActionGet(r), !!exact);
  };
  AM.getDesc = function (r) { return executeActionGet(r); };
  AM.ref = function (cls, form, a, b) {
    var r = new ActionReference();
    if (form == "id") r.putIdentifier(K(cls), a);
    else if (form == "index") r.putIndex(K(cls), a);
    else if (form == "name") r.putName(K(cls), a);
    else if (form == "enum") r.putEnumerated(K(cls), K(a), K(b));
    else if (form == "class") r.putClass(K(cls));
    return r;
  };
  AM.targetLayer = function () { return AM.ref("layer", "enum", "ordinal", "targetEnum"); };
  AM.targetDoc = function () { return AM.ref("document", "enum", "ordinal", "targetEnum"); };
})();
