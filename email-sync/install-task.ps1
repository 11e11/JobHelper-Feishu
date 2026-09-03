param(
    [string]$TaskName = "JobRecruitmentEmailSync"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = (Get-Command python -ErrorAction Stop).Source
$PythonWindowless = Join-Path (Split-Path -Parent $Python) "pythonw.exe"
if (Test-Path -LiteralPath $PythonWindowless) {
    $Python = $PythonWindowless
}
$Main = Join-Path $ScriptDir "main.py"
$EnvFile = Join-Path $ScriptDir ".env"
$IntervalLine = Get-Content -LiteralPath $EnvFile -Encoding UTF8 |
    Where-Object { $_ -match '^POLL_INTERVAL_MINUTES=' } |
    Select-Object -First 1
$Interval = 5
if ($IntervalLine) {
    $ParsedInterval = 0
    if ([int]::TryParse(($IntervalLine -split '=', 2)[1].Trim(), [ref]$ParsedInterval) -and $ParsedInterval -ge 1) {
        $Interval = $ParsedInterval
    }
}
$Action = New-ScheduledTaskAction -Execute $Python -Argument ('"{0}" run-once' -f $Main) -WorkingDirectory $ScriptDir
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $Interval) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Settings $Settings -Description "Sync recruitment emails to Feishu via DeepSeek" -Force | Out-Null
Write-Output "Scheduled task created: $TaskName (every $Interval minutes)"
