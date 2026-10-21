# Registra (o quita) la tarea diaria que importa las ventas Rappi de ayer.
#   powershell -ExecutionPolicy Bypass -File scripts\rappi\programar.ps1            # diario 07:00
#   powershell -ExecutionPolicy Bypass -File scripts\rappi\programar.ps1 -Hora 06:30
#   powershell -ExecutionPolicy Bypass -File scripts\rappi\programar.ps1 -Quitar
# Corre con tu usuario mientras tengas sesion de Windows iniciada; si la PC estaba apagada a esa hora, corre al encenderla.
param([string]$Hora = '07:00', [switch]$Quitar)
$nombre = 'Dodo - Ventas Rappi'
if ($Quitar) { Unregister-ScheduledTask -TaskName $nombre -Confirm:$false; "Tarea '$nombre' eliminada."; return }

$cmd = Join-Path $PSScriptRoot 'tarea.cmd'
if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) { throw "Falta scripts\rappi\.env (copia .env.example y llenalo)." }
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"& cmd.exe /c '$cmd'; exit `$LASTEXITCODE`""
$disparo = New-ScheduledTaskTrigger -Daily -At $Hora
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)
$quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparo -Settings $ajustes -Principal $quien -Description 'Importa a la app las ventas Rappi del dia anterior (scripts\rappi\sincronizar.mjs).' -Force | Out-Null
"Tarea '$nombre' programada diario a las $Hora. Bitacora: $env:LOCALAPPDATA\dodo-rappi.log"
