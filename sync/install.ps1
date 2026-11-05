$ErrorActionPreference = 'Stop'
$ledgerRoot = Split-Path $PSScriptRoot -Parent
$ledgerAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'launch.ps1') + '"') -WorkingDirectory $ledgerRoot
$ledgerDaily = New-ScheduledTaskTrigger -Daily -At '3:00 AM'
$ledgerPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$ledgerSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName '1riichi OneDrive workbook sync' -Action $ledgerAction -Trigger $ledgerDaily -Principal $ledgerPrincipal -Settings $ledgerSettings -Description 'Sync finished 1riichi sessions into the local OneDrive workbook daily at 3 AM local time while signed in.' -Force | Select-Object TaskName,State
Start-ScheduledTask -TaskName '1riichi OneDrive workbook sync'
