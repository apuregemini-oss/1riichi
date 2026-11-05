$ErrorActionPreference = 'Stop'
$ledgerRoot = Split-Path $PSScriptRoot -Parent
$ledgerAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'launch.ps1') + '"') -WorkingDirectory $ledgerRoot
$ledgerPoll = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$ledgerPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$ledgerSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Disable-ScheduledTask -TaskName '1riichi OneDrive workbook sync' -ErrorAction SilentlyContinue | Out-Null
Register-ScheduledTask -TaskName '1riichi manual Excel sync requests' -Action $ledgerAction -Trigger $ledgerPoll -Principal $ledgerPrincipal -Settings $ledgerSettings -Description 'Check for owner-requested Excel sync. Never write the workbook without a pending manual request.' -Force | Select-Object TaskName,State
