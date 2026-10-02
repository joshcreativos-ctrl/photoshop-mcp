# Puente COM persistente hacia Adobe Photoshop (Windows).
# Protocolo por stdin/stdout, una línea por mensaje, campos separados por TAB:
#   entrada : <id> TAB <modo> TAB <base64(UTF-8 del código ExtendScript)>
#   salida  : <id> TAB ok|err TAB <base64(UTF-8 del resultado o del error)>
#   al arrancar: READY TAB <progid> TAB <base64(versión)>
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding  = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$bf = [Reflection.BindingFlags]::InvokeMethod
$utf8 = New-Object Text.UTF8Encoding($false)
function B64([string]$s) { [Convert]::ToBase64String($utf8.GetBytes($s)) }
function Out([string]$a, [string]$b, [string]$c) { [Console]::Out.WriteLine("$a`t$b`t$c"); [Console]::Out.Flush() }

function Connect-Photoshop([bool]$deep = $false) {
  # Los ProgID conocidos primero: recorrer todo HKCR tarda ~30 s.
  $known = @()
  if ($env:PS_PROGID) { $known += $env:PS_PROGID }
  $known += 'Photoshop.Application.200', 'Photoshop.Application'
  foreach ($id in $known) {
    try { $o = New-Object -ComObject $id; if ($o) { $script:progid = $id; return $o } } catch { }
  }
  if (-not $deep) { return $null }
  foreach ($k in (Get-ChildItem 'Registry::HKEY_CLASSES_ROOT' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^Photoshop\.Application(\.\d+)*$' } | Sort-Object PSChildName -Descending)) {
    try { $o = New-Object -ComObject $k.PSChildName; if ($o) { $script:progid = $k.PSChildName; return $o } } catch { }
  }
  return $null
}

function Find-PhotoshopExe {
  if ($env:PS_EXE -and (Test-Path $env:PS_EXE)) { return $env:PS_EXE }
  $roots = @($env:ProgramFiles, 'C:\Program Files', ${env:ProgramFiles(x86)}) | Where-Object { $_ } | Select-Object -Unique
  $found = @()
  foreach ($r in $roots) { $a = Join-Path $r 'Adobe'; if (Test-Path $a) { $found += Get-ChildItem $a -Directory -Filter 'Adobe Photoshop*' | Where-Object { $_.Name -notmatch 'Beta' } | ForEach-Object { Join-Path $_.FullName 'Photoshop.exe' } | Where-Object { Test-Path $_ } } }
  return ($found | Sort-Object -Descending | Select-Object -First 1)
}

# Conecta; si Photoshop no está abierto lo abre y espera a que cargue (puede tardar un minuto o dos).
function Connect-OrLaunch {
  $o = Connect-Photoshop
  if ($o) { return $o }
  $exe = Find-PhotoshopExe
  if (-not $exe) { throw 'No pude conectar con Photoshop por COM y no encontré Photoshop.exe en Program Files\Adobe.' }
  if (-not (Get-Process Photoshop -ErrorAction SilentlyContinue)) { Start-Process -FilePath $exe | Out-Null }
  $deadline = [DateTime]::UtcNow.AddSeconds(180)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 3
    $o = Connect-Photoshop
    if ($o) { return $o }
  }
  $o = Connect-Photoshop $true
  if ($o) { return $o }
  throw 'Abrí Photoshop pero no respondió a tiempo por COM. Espera a que termine de cargar y vuelve a intentar.'
}

function Invoke-JS($ps, [string]$code, [int]$mode, [int]$timeoutMs) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  while ($true) {
    try { return [string][System.__ComObject].InvokeMember('DoJavaScript', $bf, $null, $ps, @($code, [object[]]@(), $mode)) }
    catch {
      $ex = $_.Exception; if ($ex.InnerException) { $ex = $ex.InnerException }
      $hr = 0; if ($ex -is [Runtime.InteropServices.COMException]) { $hr = $ex.ErrorCode }
      # 0x8001010A RETRYLATER · 0x80010001 RPC_E_CALL_REJECTED · 0x800706BA servidor RPC no disponible (arrancando)
      if (($hr -eq -2147417846) -or ($hr -eq -2147418111) -or ($hr -eq -2147023174)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Photoshop está ocupado y no atendió la orden (¿hay un cuadro de diálogo abierto o una operación en curso?). Ciérralo y vuelve a intentar.' }
        Start-Sleep -Milliseconds 250; continue
      }
      throw $ex
    }
  }
}

$ps = $null
try { $ps = Connect-OrLaunch } catch { Out 'FATAL' 'err' (B64 $_.Exception.Message); exit 2 }
$ver = ''
try { $ver = Invoke-JS $ps 'app.version' 1 120000 } catch { $ver = '?' }
Out 'READY' $script:progid (B64 $ver)

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Length -eq 0) { continue }
  $p = $line.Split("`t")
  if ($p.Length -lt 3) { continue }
  try {
    $code = $utf8.GetString([Convert]::FromBase64String($p[2]))
    $res = Invoke-JS $ps $code ([int]$p[1]) 300000
    Out $p[0] 'ok' (B64 $res)
  } catch {
    $m = $_.Exception.Message
    # Si Photoshop se cerró, reconectamos en la próxima orden.
    if ($m -match '0x800706BA|0x80010108|0x800706BE|desconect|disconnected') { try { $ps = Connect-OrLaunch } catch { } }
    Out $p[0] 'err' (B64 $m)
  }
}
