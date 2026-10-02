// Uso: node test/ps.mjs <operación> '<json de argumentos>' [--history "nombre"]
import { op, stop } from "../ps-client.mjs";
const [, , name, json, ...rest] = process.argv;
const args = json ? JSON.parse(json) : {};
const hi = rest.indexOf("--history");
const t = Date.now();
try {
  const r = await op(name, args, hi >= 0 ? { history: rest[hi + 1] } : {});
  console.log(JSON.stringify(r, null, 1));
  console.error(`(${Date.now() - t} ms)`);
} catch (e) { console.error("ERR", e.message); process.exitCode = 1; }
stop(); process.exit(process.exitCode || 0);
