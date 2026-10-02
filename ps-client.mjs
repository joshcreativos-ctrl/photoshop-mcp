// Conexión con Photoshop: Node ⇄ (stdin/stdout) ⇄ ps-host.ps1 ⇄ (COM) ⇄ Photoshop.
// Photoshop ejecuta cada llamada COM en un motor ExtendScript nuevo, así que la biblioteca (jsx/*.jsx)
// viaja con cada orden. Pesa poco y se analiza en milisegundos.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.join(HERE, "host", "ps-host.ps1");
const JSX_DIR = path.join(HERE, "jsx");
const LIB_ORDER = ["core.jsx", "serialize.jsx", "inspect.jsx", "export.jsx", "ops.jsx", "text.jsx", "effects.jsx", "adjust.jsx", "style.jsx"];

export function loadLib() {
  const parts = [];
  for (const f of LIB_ORDER) {
    const p = path.join(JSX_DIR, f);
    if (fs.existsSync(p)) parts.push(fs.readFileSync(p, "utf8"));
  }
  return parts.join("\n");
}

let LIB = loadLib();
export const reloadLib = () => { LIB = loadLib(); };

let host = null;
let ready = null;
let seq = 0;
const pending = new Map();
let buf = "";
let hostInfo = { progid: null, version: null };

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s) => Buffer.from(s, "base64").toString("utf8");

function startHost() {
  if (host && !host.killed && ready) return ready;
  buf = "";
  host = spawn("powershell.exe", ["-NoProfile", "-NoLogo", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", HOST], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const me = host;
  ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Photoshop no respondió a tiempo al arrancar (¿está cargando o hay un cuadro de diálogo abierto?).")), 300000);
    me.on("exit", () => { clearTimeout(t); reject(new Error("El puente con Photoshop se cerró.")); });
    me.stdout.setEncoding("utf8");
    me.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        const [id, kind, payload] = line.split("\t");
        if (id === "READY") { clearTimeout(t); hostInfo = { progid: kind, version: unb64(payload || "") }; resolve(); continue; }
        if (id === "FATAL") { clearTimeout(t); reject(new Error(unb64(payload || ""))); continue; }
        const p = pending.get(id);
        if (p) { pending.delete(id); kind === "ok" ? p.resolve(unb64(payload || "")) : p.reject(new Error(unb64(payload || ""))); }
      }
    });
  });
  ready.catch(() => { if (host === me) { host = null; ready = null; } });
  me.on("exit", () => {
    if (host === me) { host = null; ready = null; }
    for (const [, p] of pending) p.reject(new Error("El puente con Photoshop se cerró."));
    pending.clear();
  });
  return ready;
}

async function send(code, { timeout = 300000, mode = 1 } = {}) {
  await startHost();
  const id = String(++seq);
  let timer;
  const p = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    timer = setTimeout(() => {
      if (pending.delete(id)) {
        reject(new Error("Photoshop tardó más de lo esperado. Puede seguir trabajando en segundo plano; revisa con ps_status."));
        try { host?.kill(); } catch {}
      }
    }, timeout);
  });
  host.stdin.write(`${id}\t${mode}\t${b64(code)}\n`);
  return p.finally(() => clearTimeout(timer));
}

// Ejecuta `body` (cuerpo de función ExtendScript con `A` = argumentos y el objeto VZ) y devuelve el resultado como objeto JS.
// opts.history: nombre del paso de historial en el que se agrupa el cambio (o null para no agrupar).
export async function callPS(body, args, opts = {}) {
  const payload = `VZ.exec(${JSON.stringify(JSON.stringify(args === undefined ? null : args))}, ${JSON.stringify(body)}, ${JSON.stringify(opts.history || null)})`;
  const raw = await send(LIB + "\n" + payload, opts);
  let res;
  try { res = JSON.parse(raw); } catch { throw new Error("Respuesta inesperada de Photoshop: " + raw.slice(0, 300)); }
  if (!res.ok) throw new Error(res.error + (res.line ? ` (línea ${res.line})` : ""));
  return res.result;
}

// Llama a una operación de la biblioteca: VZ.ops.<name>(args)
export const op = (name, args, opts) => callPS(`return VZ.ops.${name}(A);`, args === undefined ? {} : args, opts);

export const raw = (code, o) => send(code, o);
export const info = () => hostInfo;
export function stop() { try { host?.kill(); } catch {} host = null; ready = null; }
