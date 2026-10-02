// Instalador de Free Photoshop MCP by Videazo Super Intelligence (Windows).
// Un solo .exe: lleva dentro el servidor, sus dependencias y Node.js, así que no hace falta instalar nada más.
// Interfaz propia (WPF) con el estilo de videazo.si. Compilado con el compilador de .NET Framework (C# 5).
//   Setup.exe                   asistente con interfaz
//   Setup.exe --silent          instala sin interfaz, en todos los agentes detectados
//   Setup.exe --uninstall       desinstala (con interfaz mínima); --uninstall --silent sin interfaz
//   Opciones: --no-claude-code --no-claude-desktop --no-codex --no-cursor --no-gemini --no-windsurf
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using Microsoft.Win32;

[assembly: AssemblyTitle("Free Photoshop MCP · Instalador")]
[assembly: AssemblyProduct("Free Photoshop MCP by Videazo Super Intelligence")]
[assembly: AssemblyCompany("Videazo")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

namespace VideazoSetup
{
    // ───────────────────────── Idiomas ─────────────────────────
    static class T
    {
        public static readonly bool Es = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "es";
        public static string Pick(string es, string en) { return Es ? es : en; }
    }

    // ───────────────────────── Agentes (clientes MCP) ─────────────────────────
    class Agente
    {
        public string Id;
        public string Etiqueta;
        public bool Detectado;
        public string Detalle;
    }

    static class Rutas
    {
        public static readonly string Local = Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? Path.Combine(Environment.GetEnvironmentVariable("USERPROFILE") ?? "", "AppData", "Local");
        public static readonly string Roaming = Environment.GetEnvironmentVariable("APPDATA") ?? "";
        public static readonly string Home = Environment.GetEnvironmentVariable("USERPROFILE") ?? "";
        public static readonly string Destino = Path.Combine(Local, "Videazo", "ps-mcp");
        public static string Servidor { get { return Path.Combine(Destino, "server.mjs"); } }
        public static string Node { get { return Path.Combine(Destino, "node", "node.exe"); } }
        public static string Desinstalador { get { return Path.Combine(Destino, "Desinstalar.exe"); } }
        public const string Nombre = "photoshop";
        public const string ClaveDesinstalar = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\VideazoPhotoshopMCP";
        public const string Version = "0.1.0";
        public const string Pagina = "https://videazo.si/photoshop-mcp";
    }

    // ───────────────────────── Lógica de instalación ─────────────────────────
    static class Motor
    {
        public static string RegistroPath = Path.Combine(Path.GetTempPath(), "videazo-photoshop-mcp-setup.log");

        public static void Log(string m)
        {
            try { File.AppendAllText(RegistroPath, DateTime.Now.ToString("HH:mm:ss") + " " + m + Environment.NewLine); } catch { }
        }

        public static string BuscarClaude()
        {
            string[] candidatos =
            {
                Path.Combine(Rutas.Home, ".local", "bin", "claude.exe"),
                Path.Combine(Rutas.Roaming, "npm", "claude.cmd"),
                Path.Combine(Rutas.Local, "AnthropicClaude", "claude.exe")
            };
            foreach (string c in candidatos) if (File.Exists(c)) return c;
            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string dir in path.Split(';'))
            {
                if (string.IsNullOrWhiteSpace(dir)) continue;
                try
                {
                    foreach (string n in new[] { "claude.exe", "claude.cmd" })
                    {
                        string p = Path.Combine(dir.Trim().Trim('"'), n);
                        if (File.Exists(p)) return p;
                    }
                }
                catch { }
            }
            return null;
        }

        public static List<string> BuscarPhotoshop()
        {
            var r = new List<string>();
            foreach (string pf in new[] { Environment.GetEnvironmentVariable("ProgramFiles"), @"C:\Program Files", Environment.GetEnvironmentVariable("ProgramFiles(x86)") })
            {
                if (string.IsNullOrEmpty(pf)) continue;
                string adobe = Path.Combine(pf, "Adobe");
                if (!Directory.Exists(adobe)) continue;
                foreach (string d in Directory.GetDirectories(adobe, "Adobe Photoshop*"))
                    if (File.Exists(Path.Combine(d, "Photoshop.exe")) && !r.Contains(Path.GetFileName(d))) r.Add(Path.GetFileName(d));
            }
            r.Sort();
            return r;
        }

        public static List<Agente> DetectarAgentes()
        {
            string claude = BuscarClaude();
            var l = new List<Agente>();
            l.Add(new Agente { Id = "claude-code", Etiqueta = "Claude Code", Detectado = claude != null, Detalle = claude });
            l.Add(new Agente { Id = "claude-desktop", Etiqueta = "Claude Desktop", Detectado = Directory.Exists(Path.Combine(Rutas.Roaming, "Claude")) });
            l.Add(new Agente { Id = "cursor", Etiqueta = "Cursor", Detectado = Directory.Exists(Path.Combine(Rutas.Home, ".cursor")) });
            l.Add(new Agente { Id = "codex", Etiqueta = "Codex", Detectado = Directory.Exists(Path.Combine(Rutas.Home, ".codex")) });
            l.Add(new Agente { Id = "gemini", Etiqueta = "Gemini CLI", Detectado = Directory.Exists(Path.Combine(Rutas.Home, ".gemini")) });
            l.Add(new Agente { Id = "windsurf", Etiqueta = "Windsurf", Detectado = Directory.Exists(Path.Combine(Rutas.Home, ".codeium", "windsurf")) });
            return l;
        }

        public static bool Instalado { get { return File.Exists(Rutas.Servidor); } }

        // ── ejecutar procesos sin ventana ──
        static string Ejecutar(string exe, string args, int ms, out int codigo)
        {
            var psi = new ProcessStartInfo
            {
                FileName = exe, Arguments = args, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8
            };
            using (Process p = Process.Start(psi))
            {
                var o = p.StandardOutput.ReadToEndAsync();
                var e = p.StandardError.ReadToEndAsync();
                if (!p.WaitForExit(ms)) { try { p.Kill(); } catch { } codigo = -1; return "tiempo agotado"; }
                codigo = p.ExitCode;
                return (o.Result + "\n" + e.Result).Trim();
            }
        }

        // ── payload: extraer el zip incrustado ──
        public static void Extraer(Action<double> progreso)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream("payload.zip"))
            using (var zip = new ZipArchive(s, ZipArchiveMode.Read))
            {
                int total = zip.Entries.Count, i = 0;
                foreach (ZipArchiveEntry e in zip.Entries)
                {
                    i++;
                    string rel = e.FullName.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
                    if (string.IsNullOrEmpty(rel) || rel.EndsWith(Path.DirectorySeparatorChar.ToString())) continue;
                    string dest = Path.GetFullPath(Path.Combine(Rutas.Destino, rel));
                    if (!dest.StartsWith(Rutas.Destino, StringComparison.OrdinalIgnoreCase)) continue; // nunca fuera de la carpeta
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    try { e.ExtractToFile(dest, true); }
                    catch (IOException)
                    {
                        // archivo en uso (p. ej. node.exe mientras el agente está abierto): se conserva el que está
                        if (!rel.EndsWith("node.exe", StringComparison.OrdinalIgnoreCase)) throw;
                        Log("en uso, se conserva: " + rel);
                    }
                    if (i % 40 == 0 || i == total) progreso((double)i / total);
                }
            }
        }

        // ── JSON legible ──
        static string Bonito(object o, int n)
        {
            string pad = new string(' ', n * 2), pad2 = new string(' ', (n + 1) * 2);
            var ser = new JavaScriptSerializer();
            var d = o as IDictionary<string, object>;
            if (d != null)
            {
                if (d.Count == 0) return "{}";
                var sb = new StringBuilder("{\n");
                int k = 0;
                foreach (var kv in d) { sb.Append(pad2).Append(ser.Serialize(kv.Key)).Append(": ").Append(Bonito(kv.Value, n + 1)); sb.Append(++k < d.Count ? ",\n" : "\n"); }
                return sb.Append(pad).Append("}").ToString();
            }
            var arr = o as IEnumerable;
            if (arr != null && !(o is string))
            {
                var items = arr.Cast<object>().ToList();
                if (items.Count == 0) return "[]";
                var sb = new StringBuilder("[\n");
                for (int i = 0; i < items.Count; i++) sb.Append(pad2).Append(Bonito(items[i], n + 1)).Append(i + 1 < items.Count ? ",\n" : "\n");
                return sb.Append(pad).Append("]").ToString();
            }
            return ser.Serialize(o);
        }

        static void Respaldo(string archivo)
        {
            if (File.Exists(archivo)) try { File.Copy(archivo, archivo + ".bak-videazo", true); } catch { }
        }

        static void EditarJson(string archivo, bool agregar)
        {
            var ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 200 };
            Dictionary<string, object> raiz;
            if (!agregar && !File.Exists(archivo)) return; // al quitar, nunca se crea nada
            if (File.Exists(archivo))
            {
                Respaldo(archivo);
                string txt = File.ReadAllText(archivo, Encoding.UTF8).Trim();
                raiz = string.IsNullOrEmpty(txt) ? new Dictionary<string, object>() : ser.Deserialize<Dictionary<string, object>>(txt);
            }
            else { Directory.CreateDirectory(Path.GetDirectoryName(archivo)); raiz = new Dictionary<string, object>(); }
            object ms;
            Dictionary<string, object> servidores;
            if (raiz.TryGetValue("mcpServers", out ms) && ms is Dictionary<string, object>) servidores = (Dictionary<string, object>)ms;
            else { servidores = new Dictionary<string, object>(); raiz["mcpServers"] = servidores; }
            if (agregar)
            {
                var entrada = new Dictionary<string, object>();
                entrada["command"] = Rutas.Node;
                entrada["args"] = new ArrayList { Rutas.Servidor };
                servidores[Rutas.Nombre] = entrada;
            }
            else servidores.Remove(Rutas.Nombre);
            File.WriteAllText(archivo, Bonito(raiz, 0), new UTF8Encoding(false));
        }

        static void EditarToml(string archivo, bool agregar)
        {
            string t = "";
            if (!agregar && !File.Exists(archivo)) return;
            if (File.Exists(archivo)) { Respaldo(archivo); t = File.ReadAllText(archivo, Encoding.UTF8); }
            else Directory.CreateDirectory(Path.GetDirectoryName(archivo));
            string cab = "[mcp_servers." + Rutas.Nombre + "]", sub = "[mcp_servers." + Rutas.Nombre + ".";
            string nl = t.Contains("\r\n") ? "\r\n" : "\n";
            var salida = new List<string>();
            bool saltando = false;
            foreach (string linea in t.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None))
            {
                string h = linea.Trim();
                if (h.StartsWith("[") && h.EndsWith("]")) saltando = (h == cab || h.StartsWith(sub));
                if (!saltando) salida.Add(linea);
            }
            t = string.Join(nl, salida.ToArray()).TrimEnd();
            if (agregar)
                t += nl + nl + cab + nl + "command = " + new JavaScriptSerializer().Serialize(Rutas.Node) + nl + "args = [" + new JavaScriptSerializer().Serialize(Rutas.Servidor) + "]";
            File.WriteAllText(archivo, t + nl, new UTF8Encoding(false));
        }

        static void ClaudeCode(bool agregar)
        {
            string claude = BuscarClaude();
            if (claude == null) throw new Exception(T.Pick("No encontré Claude Code.", "Claude Code was not found."));
            bool cmd = claude.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase);
            string exe = cmd ? "cmd.exe" : claude;
            Func<string, string> a = x => cmd ? "/c \"\"" + claude + "\" " + x + "\"" : x;
            int cod;
            Ejecutar(exe, a("mcp remove --scope user " + Rutas.Nombre), 60000, out cod);
            if (agregar)
            {
                string r = Ejecutar(exe, a("mcp add --scope user " + Rutas.Nombre + " -- \"" + Rutas.Node + "\" \"" + Rutas.Servidor + "\""), 60000, out cod);
                if (cod != 0) throw new Exception(r.Length > 300 ? r.Substring(0, 300) : r);
            }
        }

        public static void Registrar(string id, bool agregar)
        {
            switch (id)
            {
                case "claude-code": ClaudeCode(agregar); break;
                case "claude-desktop": EditarJson(Path.Combine(Rutas.Roaming, "Claude", "claude_desktop_config.json"), agregar); break;
                case "cursor": EditarJson(Path.Combine(Rutas.Home, ".cursor", "mcp.json"), agregar); break;
                case "gemini": EditarJson(Path.Combine(Rutas.Home, ".gemini", "settings.json"), agregar); break;
                case "windsurf": EditarJson(Path.Combine(Rutas.Home, ".codeium", "windsurf", "mcp_config.json"), agregar); break;
                case "codex": EditarToml(Path.Combine(Rutas.Home, ".codex", "config.toml"), agregar); break;
            }
        }

        // ── "Aplicaciones instaladas" de Windows ──
        static void EscribirDesinstalador()
        {
            try { File.Copy(Process.GetCurrentProcess().MainModule.FileName, Rutas.Desinstalador, true); } catch (Exception e) { Log("no pude copiar el desinstalador: " + e.Message); return; }
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(Rutas.ClaveDesinstalar))
            {
                k.SetValue("DisplayName", "Free Photoshop MCP by Videazo");
                k.SetValue("DisplayVersion", Rutas.Version);
                k.SetValue("Publisher", "Videazo");
                k.SetValue("InstallLocation", Rutas.Destino);
                k.SetValue("DisplayIcon", Rutas.Desinstalador);
                k.SetValue("UninstallString", "\"" + Rutas.Desinstalador + "\" --uninstall");
                k.SetValue("URLInfoAbout", Rutas.Pagina);
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }

        public delegate void Paso(int indice, string estado, string detalle);

        // Instala. `pasos` informa de cada etapa; `progreso` va de 0 a 1.
        public static void Instalar(List<string> agentes, Paso paso, Action<double> progreso)
        {
            // 0 · preparar
            paso(0, "run", "");
            Directory.CreateDirectory(Rutas.Destino);
            foreach (string sub in new[] { "jsx", "host", "node_modules" })
            {
                string d = Path.Combine(Rutas.Destino, sub);
                if (Directory.Exists(d)) { try { Directory.Delete(d, true); } catch (Exception e) { Log("no pude limpiar " + sub + ": " + e.Message); } }
            }
            progreso(0.04);
            paso(0, "ok", "");

            // 1 · copiar
            paso(1, "run", "");
            Extraer(p => progreso(0.04 + p * 0.56));
            paso(1, "ok", "");

            // 2 · comprobar
            paso(2, "run", "");
            if (!File.Exists(Rutas.Node) || !File.Exists(Rutas.Servidor)) throw new Exception(T.Pick("Faltan archivos después de copiar.", "Files are missing after copying."));
            int cod;
            string v = Ejecutar(Rutas.Node, "--version", 20000, out cod);
            if (cod != 0) throw new Exception(T.Pick("No pude ejecutar el motor incluido (Node.js): ", "Could not run the bundled engine (Node.js): ") + v);
            string chk = Ejecutar(Rutas.Node, "--check \"" + Rutas.Servidor + "\"", 20000, out cod);
            if (cod != 0) throw new Exception(chk);
            progreso(0.68);
            paso(2, "ok", v);

            // 3 · registrar
            paso(3, "run", "");
            var fallos = new List<string>();
            int n = 0;
            foreach (string id in agentes)
            {
                try { Registrar(id, true); Log("registrado en " + id); }
                catch (Exception e) { fallos.Add(id + ": " + e.Message); Log("fallo " + id + ": " + e.Message); }
                n++;
                progreso(0.68 + 0.22 * n / Math.Max(1, agentes.Count));
            }
            paso(3, fallos.Count == 0 ? "ok" : "warn", string.Join(" · ", fallos.ToArray()));

            // 4 · desinstalador
            paso(4, "run", "");
            EscribirDesinstalador();
            progreso(1.0);
            paso(4, "ok", "");
        }

        public static void Desinstalar(Action<double> progreso)
        {
            foreach (Agente a in DetectarAgentes())
            {
                if (!a.Detectado) continue;
                try { Registrar(a.Id, false); } catch (Exception e) { Log("al quitar de " + a.Id + ": " + e.Message); }
            }
            progreso(0.5);
            try { Registry.CurrentUser.DeleteSubKeyTree(Rutas.ClaveDesinstalar, false); } catch { }
            string yo = Process.GetCurrentProcess().MainModule.FileName;
            bool dentro = yo.StartsWith(Rutas.Destino, StringComparison.OrdinalIgnoreCase);
            if (!dentro) { try { Directory.Delete(Rutas.Destino, true); } catch (Exception e) { Log("carpeta: " + e.Message); } }
            else
            {
                // el desinstalador vive en esa carpeta: se borra al terminar este proceso
                Process.Start(new ProcessStartInfo { FileName = "cmd.exe", Arguments = "/c ping -n 3 127.0.0.1 >nul & rmdir /s /q \"" + Rutas.Destino + "\"", CreateNoWindow = true, UseShellExecute = false });
            }
            progreso(1.0);
        }
    }

    // ───────────────────────── Interfaz ─────────────────────────
    class Ventana
    {
        Window w;
        string tmpFuentes;
        readonly List<Agente> agentes = Motor.DetectarAgentes();
        readonly Dictionary<string, ToggleButton> pildoras = new Dictionary<string, ToggleButton>();
        readonly List<TextBlock> estadosPaso = new List<TextBlock>();
        readonly List<TextBlock> iconosPaso = new List<TextBlock>();
        bool reducir = !SystemParameters.ClientAreaAnimation;
        bool ocupado;
        bool soloDesinstalar;
        T0 reloj = new T0();

        class T0 { public DateTime Inicio = DateTime.Now; }

        public Ventana(bool desinstalar) { soloDesinstalar = desinstalar; }

        T F<T>(string nombre) where T : class { return w.FindName(nombre) as T; }

        string[] NombresPasos()
        {
            return T.Es
                ? new[] { "Preparar la carpeta", "Copiar el servidor y sus piezas", "Comprobar que arranca", "Conectar con tus agentes", "Dejar el desinstalador" }
                : new[] { "Prepare the folder", "Copy the server and its parts", "Check that it starts", "Connect to your agents", "Leave the uninstaller" };
        }

        void CargarFuentes()
        {
            tmpFuentes = Path.Combine(Path.GetTempPath(), "videazo-setup-fonts-" + Process.GetCurrentProcess().Id);
            Directory.CreateDirectory(tmpFuentes);
            Assembly asm = Assembly.GetExecutingAssembly();
            foreach (string r in asm.GetManifestResourceNames())
            {
                if (!r.StartsWith("fonts.")) continue;
                string dest = Path.Combine(tmpFuentes, r.Substring(6));
                using (Stream s = asm.GetManifestResourceStream(r)) using (FileStream f = File.Create(dest)) s.CopyTo(f);
            }
            var uri = new Uri(tmpFuentes + Path.DirectorySeparatorChar);
            Application.Current.Resources["FontMona"] = new FontFamily(uri, "./#VZMona");
            Application.Current.Resources["FontFigtree"] = new FontFamily(uri, "./#VZFigtree");
            Application.Current.Resources["FontFigtreeBold"] = new FontFamily(uri, "./#VZFigtreeBold");
            Application.Current.Resources["FontGeist"] = new FontFamily(uri, "./#VZGeist");
            Application.Current.Resources["FontMarker"] = new FontFamily(uri, "./#VZMarker");
        }

        public Window Crear()
        {
            CargarFuentes();
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("Ui.xaml"))
                w = (Window)XamlReader.Load(s);

            F<TextBlock>("TxtBarra").Text = T.Pick("VIDEAZO.SI · INSTALADOR", "VIDEAZO.SI · INSTALLER");
            F<TextBlock>("TxtEtiqueta").Text = "FREE PHOTOSHOP MCP · V" + Rutas.Version;
            F<TextBlock>("TxtT1").Text = T.Pick("Tu agente maneja", "Your agent runs");
            F<TextBlock>("TxtT2").Text = T.Pick(" por ti.", " for you.");
            F<TextBlock>("TxtLead").Text = T.Pick(
                "Capas, texto, efectos y máscaras. Lo mira, lo corrige y aprende tu estilo. Todo viene dentro: no necesitas instalar nada más.",
                "Layers, text, effects and masks. It checks its own work and learns your style. Everything is inside: nothing else to install.");
            F<TextBlock>("TxtEtqEncontre").Text = T.Pick("LO QUE ENCONTRÉ", "WHAT I FOUND");
            F<TextBlock>("TxtEtqConectar").Text = T.Pick("CONECTAR CON", "CONNECT TO");
            F<TextBlock>("TxtNota").Text = T.Pick("Gratis · código abierto (MIT)", "Free · open source (MIT)");
            F<TextBlock>("TxtLegal").Text = T.Pick(
                "Photoshop es de Adobe y los nombres de los agentes son de sus dueños: se usan solo para indicar compatibilidad. Videazo no está afiliado a Adobe, Anthropic, OpenAI, Cursor, Google ni Windsurf.",
                "Photoshop belongs to Adobe and agent names belong to their owners: used only to indicate compatibility. Videazo is not affiliated with Adobe, Anthropic, OpenAI, Cursor, Google or Windsurf.");
            F<TextBlock>("TxtCarpeta").Text = Rutas.Destino;

            // Photoshop
            List<string> ps = Motor.BuscarPhotoshop();
            if (ps.Count > 0) { F<TextBlock>("IcoPs").Foreground = new SolidColorBrush(Color.FromRgb(0x2F, 0x9E, 0x44)); F<TextBlock>("TxtPs").Text = ps[ps.Count - 1]; }
            else F<TextBlock>("TxtPs").Text = T.Pick("No encontré Photoshop (lo necesitas para usar el MCP)", "Photoshop not found (you need it to use the MCP)");

            // Agentes
            var panel = F<WrapPanel>("PanelAgentes");
            bool alguno = false;
            foreach (Agente a in agentes)
            {
                if (!a.Detectado) continue;
                alguno = true;
                var tb = new ToggleButton { Content = a.Etiqueta, IsChecked = true, Style = (Style)w.FindResource("Pildora") };
                panel.Children.Add(tb);
                pildoras[a.Id] = tb;
            }
            if (!alguno)
            {
                var tx = F<TextBlock>("TxtSinAgentes");
                tx.Text = T.Pick("No encontré ningún agente instalado. Se instala igual; podrás conectarlo después.", "No agent found. It installs anyway; you can connect one later.");
                tx.Visibility = Visibility.Visible;
            }

            var btn = F<Button>("BtnInstalar");
            if (soloDesinstalar)
            {
                F<TextBlock>("TxtT1").Text = T.Pick("¿Quitar el MCP de", "Remove the MCP from");
                F<TextBlock>("TxtClip").Text = "Photoshop";
                F<TextBlock>("TxtT2").Text = "?";
                F<TextBlock>("TxtLead").Text = T.Pick("Se desconecta de tus agentes y se borra su carpeta. Tus estilos guardados no se tocan.", "It is disconnected from your agents and its folder is deleted. Your saved styles are untouched.");
                btn.Content = T.Pick("Desinstalar", "Uninstall");
                btn.Click += (s, e) => EmpezarDesinstalar();
            }
            else
            {
                btn.Content = Motor.Instalado ? T.Pick("Reinstalar", "Reinstall") : T.Pick("Instalar", "Install");
                btn.Click += (s, e) => EmpezarInstalar();
                if (Motor.Instalado)
                {
                    var d = F<TextBlock>("BtnDesinstalar");
                    d.Text = T.Pick("DESINSTALAR", "UNINSTALL");
                    d.Visibility = Visibility.Visible;
                    d.MouseLeftButtonUp += (s, e) => { soloDesinstalar = true; EmpezarDesinstalar(); };
                }
            }

            F<Button>("BtnCerrar").Click += (s, e) => { if (!ocupado) w.Close(); };
            F<Button>("BtnCerrar").ToolTip = T.Pick("Cerrar", "Close");
            F<Button>("BtnCerrarFin").Content = T.Pick("Cerrar", "Close");
            F<Button>("BtnCerrarFin").Click += (s, e) => w.Close();
            F<TextBlock>("BtnPagina").Text = T.Pick("VER LA PÁGINA", "OPEN THE PAGE");
            F<TextBlock>("BtnPagina").MouseLeftButtonUp += (s, e) => { try { Process.Start(Rutas.Pagina); } catch { } };
            F<Border>("Barra").MouseLeftButtonDown += (s, e) => { try { w.DragMove(); } catch { } };
            w.KeyDown += (s, e) => { if (e.Key == Key.Escape && !ocupado) w.Close(); };
            w.Closed += (s, e) => { try { Directory.Delete(tmpFuentes, true); } catch { } };

            // el punto REC parpadea suave (solo opacidad) salvo con animaciones reducidas
            if (!reducir)
            {
                var a = new DoubleAnimation(1.0, 0.25, TimeSpan.FromMilliseconds(900)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
                F<System.Windows.Shapes.Ellipse>("PuntoRec").BeginAnimation(UIElement.OpacityProperty, a);
                Entrar(F<Grid>("PagBienvenida"), F<Grid>("PagBienvenida").RenderTransform as TranslateTransform);
            }
            return w;
        }

        void Entrar(UIElement pagina, TranslateTransform desp)
        {
            if (reducir) { pagina.Opacity = 1; return; }
            var o = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(320)) { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } };
            pagina.BeginAnimation(UIElement.OpacityProperty, o);
            if (desp != null) desp.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(14, 0, TimeSpan.FromMilliseconds(320)) { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } });
        }

        void Mostrar(string nombre)
        {
            foreach (string n in new[] { "PagBienvenida", "PagProgreso", "PagListo" })
            {
                var g = F<Grid>(n);
                if (n == nombre)
                {
                    g.Visibility = Visibility.Visible;
                    g.RenderTransform = new TranslateTransform();
                    Entrar(g, (TranslateTransform)g.RenderTransform);
                }
                else g.Visibility = Visibility.Collapsed;
            }
        }

        // línea de tiempo: relleno + cabezal, solo transform
        void Progreso(double p)
        {
            var pista = F<Border>("Pista");
            double ancho = Math.Max(1, pista.ActualWidth);
            var esc = (ScaleTransform)F<Border>("Relleno").RenderTransform;
            var des = (TranslateTransform)F<Border>("Cabezal").RenderTransform;
            double haciaX = Math.Max(0, Math.Min(1, p));
            if (reducir) { esc.ScaleX = haciaX; des.X = (ancho - 3) * haciaX; }
            else
            {
                var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
                esc.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(haciaX, TimeSpan.FromMilliseconds(260)) { EasingFunction = ease });
                des.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation((ancho - 3) * haciaX, TimeSpan.FromMilliseconds(260)) { EasingFunction = ease });
            }
            TimeSpan t = DateTime.Now - reloj.Inicio;
            F<TextBlock>("TxtPorcentaje").Text = string.Format("{0:00}:{1:00} · {2}%", (int)t.TotalMinutes, t.Seconds, (int)Math.Round(haciaX * 100));
        }

        void ConstruirPasos(string[] nombres)
        {
            var panel = F<StackPanel>("PanelPasos");
            panel.Children.Clear(); estadosPaso.Clear(); iconosPaso.Clear();
            for (int i = 0; i < nombres.Length; i++)
            {
                var fila = new Grid { Margin = new Thickness(0, 0, 0, 14) };
                fila.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
                fila.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                var ico = new TextBlock { Text = "V" + (i + 1), FontFamily = (FontFamily)Application.Current.Resources["FontGeist"], FontSize = 11.5, Foreground = new SolidColorBrush(Color.FromRgb(0x8A, 0x84, 0x75)), VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 3, 0, 0) };
                var col = new StackPanel();
                var nom = new TextBlock { Text = nombres[i], FontFamily = (FontFamily)Application.Current.Resources["FontFigtreeBold"], FontSize = 16, Foreground = new SolidColorBrush(Color.FromRgb(0x15, 0x13, 0x0F)) };
                var est = new TextBlock { Text = "", FontFamily = (FontFamily)Application.Current.Resources["FontGeist"], FontSize = 11, Foreground = new SolidColorBrush(Color.FromRgb(0x4A, 0x46, 0x3E)), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 2, 0, 0) };
                col.Children.Add(nom); col.Children.Add(est);
                Grid.SetColumn(col, 1);
                fila.Children.Add(ico); fila.Children.Add(col);
                panel.Children.Add(fila);
                iconosPaso.Add(ico); estadosPaso.Add(est);
            }
        }

        void MarcarPaso(int i, string estado, string detalle)
        {
            if (i >= iconosPaso.Count) return;
            var ico = iconosPaso[i]; var est = estadosPaso[i];
            if (estado == "run") { ico.Text = "▶"; ico.Foreground = new SolidColorBrush(Color.FromRgb(0xE0, 0x36, 0x2C)); est.Text = T.Pick("en curso…", "working…"); }
            else if (estado == "ok") { ico.Text = "✓"; ico.Foreground = new SolidColorBrush(Color.FromRgb(0x2F, 0x9E, 0x44)); est.Text = detalle ?? ""; }
            else if (estado == "warn") { ico.Text = "!"; ico.Foreground = new SolidColorBrush(Color.FromRgb(0x8A, 0x6A, 0x00)); est.Text = detalle; }
        }

        async void EmpezarInstalar()
        {
            if (ocupado) return;
            ocupado = true;
            var elegidos = pildoras.Where(kv => kv.Value.IsChecked == true).Select(kv => kv.Key).ToList();
            ConstruirPasos(NombresPasos());
            F<TextBlock>("TxtEtqProg").Text = T.Pick("MONTANDO LA PISTA", "BUILDING THE TRACK");
            F<TextBlock>("TxtTituloProg").Text = T.Pick("Instalando…", "Installing…");
            F<Border>("CajaError").Visibility = Visibility.Collapsed;
            reloj.Inicio = DateTime.Now;
            Mostrar("PagProgreso");
            Progreso(0);
            string error = null;
            try
            {
                await Task.Run(() => Motor.Instalar(elegidos,
                    (i, e, d) => w.Dispatcher.Invoke(new Action(() => MarcarPaso(i, e, d))),
                    p => w.Dispatcher.Invoke(new Action(() => Progreso(p)))));
            }
            catch (Exception ex) { error = ex.Message; Motor.Log("ERROR " + ex); }
            ocupado = false;
            if (error != null) { MostrarError(error); return; }
            Terminar(elegidos);
        }

        async void EmpezarDesinstalar()
        {
            if (ocupado) return;
            ocupado = true;
            ConstruirPasos(new[] { T.Pick("Desconectar de tus agentes", "Disconnect from your agents"), T.Pick("Borrar la carpeta", "Delete the folder") });
            F<TextBlock>("TxtEtqProg").Text = T.Pick("DESMONTANDO LA PISTA", "REMOVING THE TRACK");
            F<TextBlock>("TxtTituloProg").Text = T.Pick("Desinstalando…", "Uninstalling…");
            reloj.Inicio = DateTime.Now;
            Mostrar("PagProgreso");
            Progreso(0);
            MarcarPaso(0, "run", "");
            string error = null;
            try
            {
                await Task.Run(() => Motor.Desinstalar(p => w.Dispatcher.Invoke(new Action(() => { Progreso(p); if (p >= 0.5) { MarcarPaso(0, "ok", ""); MarcarPaso(1, "run", ""); } }))));
            }
            catch (Exception ex) { error = ex.Message; Motor.Log("ERROR " + ex); }
            ocupado = false;
            if (error != null) { MostrarError(error); return; }
            MarcarPaso(1, "ok", "");
            F<TextBlock>("TxtEtqListo").Text = T.Pick("CORTE FINAL", "FINAL CUT");
            F<TextBlock>("TxtListo1").Text = T.Pick("Listo. Se quitó de", "Done. Removed from");
            F<TextBlock>("TxtListo2").Text = "";
            F<TextBlock>("TxtListoClip").Text = "Photoshop";
            F<TextBlock>("TxtNotaMano").Text = T.Pick("¡hasta pronto!", "see you!");
            F<StackPanel>("PanelSiguiente").Children.Clear();
            Mostrar("PagListo");
        }

        void MostrarError(string msg)
        {
            F<TextBlock>("TxtTituloProg").Text = T.Pick("Algo falló", "Something failed");
            F<TextBlock>("TxtError").Text = msg + "\n" + T.Pick("Detalle en: ", "Details in: ") + Motor.RegistroPath;
            F<Border>("CajaError").Visibility = Visibility.Visible;
            var b = F<Button>("BtnCerrar"); b.Visibility = Visibility.Visible;
        }

        void Terminar(List<string> elegidos)
        {
            F<TextBlock>("TxtEtqListo").Text = T.Pick("CORTE FINAL", "FINAL CUT");
            F<TextBlock>("TxtListo1").Text = T.Pick("Listo. Tu agente ya", "Done. Your agent can");
            F<TextBlock>("TxtListo2").Text = T.Pick("puede abrir ", "now open ");
            F<TextBlock>("TxtNotaMano").Text = T.Pick("¡a diseñar!", "let's design!");

            var panel = F<StackPanel>("PanelSiguiente");
            panel.Children.Clear();
            string nombres = string.Join(", ", agentes.Where(a => elegidos.Contains(a.Id)).Select(a => a.Etiqueta).ToArray());
            panel.Children.Add(FilaSiguiente("1", elegidos.Count > 0 ? T.Pick("Reinicia ", "Restart ") + nombres + T.Pick(" para que cargue el MCP.", " so it loads the MCP.") : T.Pick("Conecta tu agente con el comando que aparece en la página.", "Connect your agent with the command shown on the page."), null));
            panel.Children.Add(FilaSiguiente("2", T.Pick("Abre Photoshop (si está cerrado, el MCP lo abre).", "Open Photoshop (if it is closed, the MCP opens it)."), null));
            panel.Children.Add(FilaSiguiente("3", T.Pick("Escríbele a tu agente:", "Tell your agent:"), "usa ps_status"));
            Mostrar("PagListo");
        }

        UIElement FilaSiguiente(string n, string texto, string copiar)
        {
            var g = new Grid { Margin = new Thickness(0, 0, 0, 16) };
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(44) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            var num = new Border { Width = 32, Height = 32, CornerRadius = new CornerRadius(9), Background = new SolidColorBrush(Color.FromRgb(0xF5, 0xC5, 0x18)), VerticalAlignment = VerticalAlignment.Top };
            num.Child = new TextBlock { Text = n, FontFamily = (FontFamily)Application.Current.Resources["FontGeist"], FontSize = 16, FontWeight = FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = new SolidColorBrush(Color.FromRgb(0x15, 0x13, 0x0F)) };
            var col = new StackPanel();
            col.Children.Add(new TextBlock { Text = texto, FontFamily = (FontFamily)Application.Current.Resources["FontFigtree"], FontSize = 16, TextWrapping = TextWrapping.Wrap, Foreground = new SolidColorBrush(Color.FromRgb(0x4A, 0x46, 0x3E)), Margin = new Thickness(0, 5, 0, 0) });
            if (copiar != null)
            {
                var chip = new Border { CornerRadius = new CornerRadius(10), Background = new SolidColorBrush(Color.FromRgb(0xF6, 0xF3, 0xEC)), BorderBrush = new SolidColorBrush(Color.FromRgb(0xE6, 0xE1, 0xD6)), BorderThickness = new Thickness(1), Padding = new Thickness(14, 9, 14, 9), Margin = new Thickness(0, 8, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, Cursor = Cursors.Hand };
                var fila = new StackPanel { Orientation = Orientation.Horizontal };
                fila.Children.Add(new TextBlock { Text = copiar, FontFamily = (FontFamily)Application.Current.Resources["FontGeist"], FontSize = 14, Foreground = new SolidColorBrush(Color.FromRgb(0x15, 0x13, 0x0F)) });
                var etq = new TextBlock { Text = "   " + T.Pick("COPIAR", "COPY"), FontFamily = (FontFamily)Application.Current.Resources["FontGeist"], FontSize = 11, Foreground = new SolidColorBrush(Color.FromRgb(0x8A, 0x6A, 0x00)), VerticalAlignment = VerticalAlignment.Center };
                fila.Children.Add(etq);
                chip.Child = fila;
                chip.MouseLeftButtonUp += (s, e) => { try { Clipboard.SetText(copiar); etq.Text = "   " + T.Pick("COPIADO ✓", "COPIED ✓"); } catch { } };
                col.Children.Add(chip);
            }
            Grid.SetColumn(col, 1);
            g.Children.Add(num); g.Children.Add(col);
            return g;
        }
    }

    // ───────────────────────── Arranque ─────────────────────────
    static class Programa
    {
        [STAThread]
        static int Main(string[] args)
        {
            var flags = new HashSet<string>(args.Select(a => a.ToLowerInvariant()));
            bool silencioso = flags.Contains("--silent") || flags.Contains("/s") || flags.Contains("/silent");
            bool desinstalar = flags.Contains("--uninstall") || flags.Contains("/uninstall");
            try { File.Delete(Motor.RegistroPath); } catch { }

            if (silencioso)
            {
                try
                {
                    if (desinstalar) Motor.Desinstalar(p => { });
                    else
                    {
                        var ids = Motor.DetectarAgentes().Where(a => a.Detectado && !flags.Contains("--no-" + a.Id)).Select(a => a.Id).ToList();
                        Motor.Instalar(ids, (i, e, d) => Motor.Log("paso " + i + " " + e + " " + d), p => { });
                    }
                    return 0;
                }
                catch (Exception e) { Motor.Log("ERROR " + e); return 1; }
            }

            var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
            var v = new Ventana(desinstalar);
            Window win = null;
            try { win = v.Crear(); }
            catch (Exception e)
            {
                Motor.Log("ERROR de interfaz " + e);
                MessageBox.Show(T.Pick("No pude abrir el instalador: ", "Could not open the installer: ") + e.Message, "Videazo", MessageBoxButton.OK, MessageBoxImage.Error);
                return 1;
            }
            return app.Run(win);
        }
    }
}
