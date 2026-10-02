#!/usr/bin/env node
// Instalador de Free Photoshop MCP by Videazo Super Intelligence (Windows).
//   node install.mjs               instala y registra en los agentes que tengas
//   node install.mjs --dry-run     muestra qué haría, sin tocar nada
//   node install.mjs --uninstall   quita todo
//   Opciones: --no-claude-code --no-claude-desktop --no-codex --no-cursor --no-gemini --no-windsurf
// No pide administrador. No instala nada dentro de Photoshop: se conecta por COM.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const flags = new Set(process.argv.slice(2));
const DRY = flags.has("--dry-run");
const UNINSTALL = flags.has("--uninstall");
const NAME = "photoshop";
const HOME = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local"), "Videazo", "ps-mcp");
const SERVER = path.join(HOME, "server.mjs");
const FILES = [
  "server.mjs", "ps-client.mjs", "styles.mjs", "install.mjs", "package.json", "package-lock.json", "README.md", "LICENSE", "Instalar.cmd", "Desinstalar.cmd",
  path.join("host", "ps-host.ps1"),
  ...fs.readdirSync(path.join(here, "jsx")).map((f) => path.join("jsx", f)),
];

const say = (m = "") => console.log(m);
const step = (m) => say(`${DRY ? "[simulación] " : ""}${m}`);
const problems = [];
const warn = (m) => { problems.push(m); say(`  ! ${m}`); };
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: true, ...opts });
const has = (cmd) => { try { sh("where", [cmd]); return true; } catch { return false; } };

if (process.platform !== "win32") { say("Este MCP solo funciona en Windows (usa COM para hablar con Photoshop)."); process.exit(1); }
if (Number(process.versions.node.split(".")[0]) < 18) { say(`Necesitas Node.js 18 o más (tienes ${process.versions.node}).`); process.exit(1); }

const adobe = ["C:\\Program Files\\Adobe", "C:\\Program Files (x86)\\Adobe"].filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d).filter((x) => /^Adobe Photoshop/i.test(x)));
if (!adobe.length && !UNINSTALL) say("! No encontré Photoshop en Program Files\\Adobe. Se instalará igual; necesitas Photoshop para usarlo.");
say(UNINSTALL ? "Desinstalando Free Photoshop MCP…" : "Instalando Free Photoshop MCP…");
if (adobe.length) say(`Photoshop encontrado: ${adobe.join(", ")}\n`);

// 1. servidor en una carpeta estable
if (UNINSTALL) {
  if (path.resolve(here) !== path.resolve(HOME)) { step(`Borro ${HOME}`); if (!DRY) fs.rmSync(HOME, { recursive: true, force: true }); }
} else if (path.resolve(here) !== path.resolve(HOME)) {
  step(`Copio el servidor a ${HOME}`);
  if (!DRY) for (const f of FILES) { const dest = path.join(HOME, f); fs.mkdirSync(path.dirname(dest), { recursive: true }); if (fs.existsSync(path.join(here, f))) fs.copyFileSync(path.join(here, f), dest); }
}
if (!UNINSTALL) {
  step("Instalo dependencias (npm install)");
  if (!DRY) { try { sh("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], { cwd: HOME }); } catch (e) { warn("npm install falló: " + String(e.stderr || e.message).split("\n")[0]); } }
}

// 2. registrar en los agentes
const nodeExe = process.execPath;
const HOMEDIR = process.env.USERPROFILE || process.env.HOME || "";
const entry = { command: nodeExe, args: [SERVER] };
const registered = [];
const backup = (file) => { if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-videazo`); };
function editJson(file) {
  let json = {};
  if (fs.existsSync(file)) { backup(file); json = JSON.parse(fs.readFileSync(file, "utf8").trim() || "{}"); } else fs.mkdirSync(path.dirname(file), { recursive: true });
  json.mcpServers = json.mcpServers || {};
  if (UNINSTALL) delete json.mcpServers[NAME]; else json.mcpServers[NAME] = entry;
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
}
function editToml(file) {
  let t = "";
  if (fs.existsSync(file)) { backup(file); t = fs.readFileSync(file, "utf8"); } else fs.mkdirSync(path.dirname(file), { recursive: true });
  const head = `[mcp_servers.${NAME}]`, sub = `[mcp_servers.${NAME}.`, nl = t.includes("\r\n") ? "\r\n" : "\n", out = [];
  let skip = false;
  for (const line of t.split(/\r?\n/)) { const h = line.trim(); if (h.startsWith("[") && h.endsWith("]")) skip = h === head || h.startsWith(sub); if (!skip) out.push(line); }
  t = out.join(nl).trimEnd();
  if (!UNINSTALL) t += `${nl}${nl}${head}${nl}command = ${JSON.stringify(nodeExe)}${nl}args = [${JSON.stringify(SERVER)}]`;
  fs.writeFileSync(file, `${t}${nl}`);
}
const CLIENTS = [
  { id: "claude-code", label: "Claude Code", detect: () => has("claude"), apply: () => { try { sh("claude", ["mcp", "remove", "--scope", "user", NAME]); } catch {} if (!UNINSTALL) sh("claude", ["mcp", "add", "--scope", "user", NAME, "--", `"${nodeExe}"`, `"${SERVER}"`]); } },
  { id: "claude-desktop", label: "Claude Desktop", detect: () => fs.existsSync(path.join(process.env.APPDATA || "", "Claude")), apply: () => editJson(path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json")) },
  { id: "cursor", label: "Cursor", detect: () => fs.existsSync(path.join(HOMEDIR, ".cursor")), apply: () => editJson(path.join(HOMEDIR, ".cursor", "mcp.json")) },
  { id: "codex", label: "Codex", detect: () => fs.existsSync(path.join(HOMEDIR, ".codex")), apply: () => editToml(path.join(HOMEDIR, ".codex", "config.toml")) },
  { id: "gemini", label: "Gemini CLI", detect: () => fs.existsSync(path.join(HOMEDIR, ".gemini")), apply: () => editJson(path.join(HOMEDIR, ".gemini", "settings.json")) },
  { id: "windsurf", label: "Windsurf", detect: () => fs.existsSync(path.join(HOMEDIR, ".codeium", "windsurf")), apply: () => editJson(path.join(HOMEDIR, ".codeium", "windsurf", "mcp_config.json")) },
];
for (const c of CLIENTS) {
  if (flags.has(`--no-${c.id}`) || (c.id === "claude-desktop" && flags.has("--no-desktop"))) continue;
  if (!c.detect()) { say(`  · ${c.label}: no instalado, lo salto`); continue; }
  step(`${UNINSTALL ? "Quito de" : "Registro en"} ${c.label}`);
  if (DRY) { registered.push(c.label); continue; }
  try { c.apply(); registered.push(c.label); } catch (e) { warn(`${c.label}: ${String(e.stderr || e.message).split("\n")[0]}`); }
}

say();
if (UNINSTALL) { say("Listo. Free Photoshop MCP desinstalado."); process.exit(0); }
say(problems.length ? "Instalado, con avisos (arriba)." : "Instalado.");
say("\nSiguiente paso:");
say(`  1. Reinicia ${registered.length ? registered.join(", ") : "tu agente de IA"} para que cargue el MCP «photoshop».`);
say("  2. Abre Photoshop y pídele a tu agente: «usa ps_status».");
if (DRY) say("\n(Simulación: no se tocó nada.)");
