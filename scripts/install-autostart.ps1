param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'OpenEmailHarvesterBridge'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Removed Windows auto-start task: $taskName"
  exit 0
}

$node = (Get-Command node -ErrorAction Stop).Source
$bridge = Join-Path $repo 'server\bridge.js'
$action = New-ScheduledTaskAction -Execute $node -Argument ('"{0}"' -f $bridge) -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started Windows auto-start task: $taskName"
Write-Output "Bridge: http://127.0.0.1:8765"
