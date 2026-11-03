$ErrorActionPreference = 'Stop'
$ledgerRoot = Split-Path $PSScriptRoot -Parent
$ledgerAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'launch.ps1') + '"') -WorkingDirectory $ledgerRoot
$ledgerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$ledgerLogon = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$ledgerPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$ledgerSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName '1riichi OneDrive workbook sync' -Action $ledgerAction -Trigger @($ledgerRepeat,$ledgerLogon) -Principal $ledgerPrincipal -Settings $ledgerSettings -Description 'Sync finished 1riichi sessions into the local OneDrive workbook every two minutes while signed in.' -Force | Select-Object TaskName,State
Start-ScheduledTask -TaskName '1riichi OneDrive workbook sync'
