// Construye dist/Videazo-Photoshop-MCP-Setup.exe: un solo .exe con el servidor, sus dependencias y Node.js dentro.
// Uso: node installer/build.mjs        (necesita Windows con .NET Framework 4.x, que ya trae Windows 10/11)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(DIST, "stage");
const OUT = path.join(DIST, "Videazo-Photoshop-MCP-Setup.exe");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", windowsHide: true, ...opts });

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

// 1 · carpeta de trabajo con lo que viaja dentro del instalador
for (const f of ["server.mjs", "ps-client.mjs", "styles.mjs", "package.json", "package-lock.json", "README.md", "LICENSE"]) fs.copyFileSync(path.join(ROOT, f), path.join(STAGE, f));
fs.cpSync(path.join(ROOT, "jsx"), path.join(STAGE, "jsx"), { recursive: true });
fs.cpSync(path.join(ROOT, "host"), path.join(STAGE, "host"), { recursive: true });
console.log("› instalando dependencias de producción…");
run("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: STAGE, shell: true });
// Node.js incluido: así la persona no necesita instalar nada más
fs.mkdirSync(path.join(STAGE, "node"), { recursive: true });
fs.copyFileSync(process.execPath, path.join(STAGE, "node", "node.exe"));
const nodeLic = path.join(path.dirname(process.execPath), "LICENSE");
if (fs.existsSync(nodeLic)) fs.copyFileSync(nodeLic, path.join(STAGE, "node", "LICENSE"));
console.log(`› Node.js ${process.version} incluido`);

// 2 · zip (el instalador lo extrae)
const ZIP = path.join(DIST, "payload.zip");
run("powershell.exe", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('${STAGE}', '${ZIP}', [IO.Compression.CompressionLevel]::Optimal, $false)`]);
console.log(`› payload.zip ${(fs.statSync(ZIP).size / 1048576).toFixed(1)} MB`);

// 3 · compilar con el compilador de .NET Framework (no hace falta SDK)
const FW = "C:/Windows/Microsoft.NET/Framework64/v4.0.30319";
const csc = path.join(FW, "csc.exe");
if (!fs.existsSync(csc)) throw new Error("No encontré csc.exe de .NET Framework 4.");
const refs = ["PresentationFramework", "PresentationCore", "WindowsBase", "System.Xaml", "System.Web.Extensions", "System.IO.Compression", "System.IO.Compression.FileSystem", "System.Core", "System"].map((r) => `/r:${r}.dll`);
const res = [`/resource:${ZIP},payload.zip`, `/resource:${path.join(HERE, "Ui.xaml")},Ui.xaml`];
for (const f of fs.readdirSync(path.join(HERE, "fonts")).filter((x) => x.endsWith(".ttf"))) res.push(`/resource:${path.join(HERE, "fonts", f)},fonts.${f}`);
const icon = path.join(HERE, "app.ico");
const args = ["/nologo", "/target:winexe", `/out:${OUT}`, "/optimize+", `/lib:${FW}/WPF`, `/win32manifest:${path.join(HERE, "app.manifest")}`, ...(fs.existsSync(icon) ? [`/win32icon:${icon}`] : []), ...refs, ...res, path.join(HERE, "Setup.cs")];
console.log("› compilando…");
run(csc, args);
fs.rmSync(STAGE, { recursive: true, force: true });
fs.rmSync(ZIP, { force: true });
console.log(`✔ ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
