<#
  Mide la memoria del APK durante una sesion de escaneo y la guarda en CSV.

  Uso (con la tablet/telefono conectado por USB y el escaner ABIERTO):
      powershell -ExecutionPolicy Bypass -File scripts\medir-memoria.ps1
      powershell -ExecutionPolicy Bypass -File scripts\medir-memoria.ps1 -Minutos 20 -CadaSeg 15 -Etiqueta "sin-liveness"

  Genera:  mediciones\mem-<etiqueta>-<fecha>.csv   (seg, minuto, native_kb, dalvik_kb, total_pss_kb, vivo)
  Ctrl+C para cortar antes; el CSV ya escrito sirve igual.
#>
param(
  [string]$Paquete  = "cloud.slagricola.slasistencias",
  [int]   $Minutos  = 20,
  [int]   $CadaSeg  = 15,
  [string]$Etiqueta = "base",
  [string]$Adb      = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
)

if (-not (Test-Path $Adb)) { Write-Error "No encuentro adb en: $Adb  (pasa -Adb <ruta>)"; exit 1 }

$dispositivos = & $Adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" }
if (-not $dispositivos) { Write-Error "No hay dispositivo conectado (revisa 'depuracion USB')."; exit 1 }

$dir = Join-Path (Get-Location) "mediciones"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$sello = Get-Date -Format "yyyyMMdd-HHmm"
$csv   = Join-Path $dir "mem-$Etiqueta-$sello.csv"
"seg,minuto,native_kb,dalvik_kb,total_pss_kb,vivo" | Out-File -FilePath $csv -Encoding utf8

Write-Host "Midiendo '$Paquete' cada ${CadaSeg}s durante ${Minutos} min -> $csv"
Write-Host "Deja el escaner corriendo. Ctrl+C para cortar antes.`n"

$muestras = [math]::Floor(($Minutos * 60) / $CadaSeg)
$picoNat = 0; $primNat = $null; $ultNat = 0; $murio = $false; $desconexiones = 0; $avisoModelo = $false

for ($i = 0; $i -le $muestras; $i++) {
  $seg  = $i * $CadaSeg
  $dump = & $Adb shell dumpsys meminfo $Paquete 2>$null | Out-String

  if ($dump -match "No process found" -or [string]::IsNullOrWhiteSpace($dump)) {
    # OJO: un dumpsys vacio puede significar DOS cosas muy distintas. Antes de declarar
    # muerta la app hay que descartar que simplemente se haya perdido el dispositivo
    # (cable flojo, puerto, pantalla bloqueada) -- si no, se reporta un crash inexistente.
    $estado = (& $Adb get-state 2>&1) -join ''
    if ($estado -notmatch 'device') {
      "$seg,$([math]::Round($seg/60,2)),,,,disconnected" | Add-Content -Path $csv -Encoding utf8
      Write-Host ("[{0,5}s] SIN DISPOSITIVO (adb: {1}) - revisa el cable; reintentando..." -f $seg, $estado.Trim()) -ForegroundColor Yellow
      $desconexiones++
      if ($desconexiones -ge 8) {
        Write-Host "Demasiadas lecturas sin dispositivo seguidas; aborto la medicion." -ForegroundColor Red
        break
      }
      Start-Sleep -Seconds $CadaSeg
      continue
    }
    "$seg,$([math]::Round($seg/60,2)),,,,0" | Add-Content -Path $csv -Encoding utf8
    Write-Host ("[{0,5}s] PROCESO MUERTO  <-- la app se cerro (dispositivo si responde)" -f $seg) -ForegroundColor Red
    $murio = $true
    break
  }
  $desconexiones = 0

  # 1a columna numerica de cada fila = Pss Total (KB)
  $nat = if ($dump -match "(?m)^\s*Native Heap\s+(\d+)")  { [int]$Matches[1] } else { 0 }
  $dal = if ($dump -match "(?m)^\s*Dalvik Heap\s+(\d+)")  { [int]$Matches[1] } else { 0 }
  $tot = if ($dump -match "(?m)^\s*TOTAL(?: PSS)?:?\s+(\d+)") { [int]$Matches[1] } else { 0 }

  "$seg,$([math]::Round($seg/60,2)),$nat,$dal,$tot,1" | Add-Content -Path $csv -Encoding utf8

  if ($null -eq $primNat) { $primNat = $nat }
  $ultNat = $nat
  if ($nat -gt $picoNat) { $picoNat = $nat }

  Write-Host ("[{0,5}s] native {1,7:N0} MB   dalvik {2,6:N0} MB   TOTAL {3,7:N0} MB" -f `
    $seg, ($nat/1024), ($dal/1024), ($tot/1024))

  # El modelo ONNX residente son ~200 MB de native heap. Muy por debajo = el escaner
  # NO esta activo, y entonces la medicion no dice nada sobre la carga real.
  if (-not $avisoModelo -and $i -ge 2 -and ($nat/1024) -lt 100) {
    Write-Host "  ^ native bajo: parece que el escaner NO esta abierto (modelo sin cargar)." -ForegroundColor Yellow
    $avisoModelo = $true
  }

  if ($i -lt $muestras) { Start-Sleep -Seconds $CadaSeg }
}

Write-Host "`n--- Resumen ---" -ForegroundColor Cyan
Write-Host ("CSV:            {0}" -f $csv)
if ($null -ne $primNat) {
  $minutos = $seg / 60.0
  Write-Host ("Native inicial: {0:N0} MB" -f ($primNat/1024))
  Write-Host ("Native final:   {0:N0} MB" -f ($ultNat/1024))
  Write-Host ("Native pico:    {0:N0} MB" -f ($picoNat/1024))
  if ($minutos -gt 0) {
    Write-Host ("Pendiente:      {0:N1} MB/min" -f ((($ultNat - $primNat)/1024) / $minutos))
  }
}
if ($desconexiones -ge 8) {
  Write-Host "Resultado:      INVALIDO - se perdio el dispositivo (no es un crash de la app)" -ForegroundColor Yellow
} else {
  Write-Host ("Sobrevivio:     {0}" -f $(if ($murio) { "NO" } else { "si, $([math]::Round($seg/60,1)) min" }))
}
