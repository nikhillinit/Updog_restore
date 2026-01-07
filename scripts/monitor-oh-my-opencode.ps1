# Oh-My-OpenCode Agent Usage Monitor
# Tracks which agents are being invoked and provides metrics

param(
    [switch]$Live,
    [int]$IntervalSeconds = 5,
    [string]$LogFile = ".\.opencode\agent-usage.log"
)

function Write-Header {
    Clear-Host
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host "Oh-My-OpenCode Agent Usage Monitor" -ForegroundColor Blue
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Monitoring: .opencode directory" -ForegroundColor Cyan
    Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
    Write-Host ""
}

function Get-AgentUsageStats {
    $configPath = ".\.opencode\oh-my-opencode.json"

    if (-not (Test-Path $configPath)) {
        Write-Warning "Configuration not found at: $configPath"
        return $null
    }

    $config = Get-Content $configPath | ConvertFrom-Json

    # Extract agent configurations
    $agents = @{}
    $config.agents.PSObject.Properties | ForEach-Object {
        $agents[$_.Name] = @{
            Model = $_.Value.model
            Temperature = $_.Value.temperature
            Invocations = 0
            LastUsed = $null
        }
    }

    return $agents
}

function Show-AgentStats {
    param($Stats)

    Write-Host "Configured Agents:" -ForegroundColor Green
    Write-Host ""

    $Stats.GetEnumerator() | Sort-Object Name | ForEach-Object {
        $name = $_.Key
        $info = $_.Value

        $modelDisplay = $info.Model
        if ($modelDisplay.Length > 35) {
            $modelDisplay = $modelDisplay.Substring(0, 32) + "..."
        }

        Write-Host (" {0,-25} {1,-38} T:{2:F1}" -f $name, $modelDisplay, $info.Temperature) -ForegroundColor White
    }

    Write-Host ""
}

function Show-ConcurrencyConfig {
    $configPath = ".\.opencode\oh-my-opencode.json"

    if (Test-Path $configPath) {
        $config = Get-Content $configPath | ConvertFrom-Json

        Write-Host "Concurrency Configuration:" -ForegroundColor Green
        Write-Host ""
        Write-Host ("  Default Concurrency: {0}" -f $config.background_task.defaultConcurrency) -ForegroundColor Cyan
        Write-Host "  Provider Limits:" -ForegroundColor Cyan

        $config.background_task.providerConcurrency.PSObject.Properties | ForEach-Object {
            Write-Host ("    {0,-12}: {1}" -f $_.Name, $_.Value) -ForegroundColor White
        }

        Write-Host ""
    }
}

function Watch-AgentLogs {
    param($LogPath)

    if (-not (Test-Path $LogPath)) {
        Write-Warning "Log file not found: $LogPath"
        Write-Host ""
        Write-Host "Agent invocations will appear here as they occur..." -ForegroundColor Yellow
        Write-Host ""
        return
    }

    $lastLines = Get-Content $LogPath -Tail 10

    Write-Host "Recent Activity (last 10 entries):" -ForegroundColor Green
    Write-Host ""

    $lastLines | ForEach-Object {
        if ($_ -match "Sisyphus") {
            Write-Host $_ -ForegroundColor Magenta
        }
        elseif ($_ -match "oracle") {
            Write-Host $_ -ForegroundColor Yellow
        }
        elseif ($_ -match "librarian") {
            Write-Host $_ -ForegroundColor Green
        }
        elseif ($_ -match "explore") {
            Write-Host $_ -ForegroundColor Cyan
        }
        else {
            Write-Host $_ -ForegroundColor Gray
        }
    }

    Write-Host ""
}

function Show-ComparisonMetrics {
    Write-Host "Comparison Metrics (Current MCP vs Oh-My-OpenCode):" -ForegroundColor Green
    Write-Host ""

    $metrics = @(
        @{Name="Manual delegation prompts"; Current="5-10 per task"; Target="1 per task"; Status="PENDING"},
        @{Name="Time to delegate"; Current="~30s"; Target="0s (auto)"; Status="PENDING"},
        @{Name="Parallelization"; Current="Sequential"; Target="5 concurrent"; Status="PENDING"},
        @{Name="Model optimization"; Current="Manual"; Target="Automatic"; Status="PENDING"}
    )

    $metrics | ForEach-Object {
        Write-Host ("  {0,-30}: {1,-15} -> {2,-20} [{3}]" -f $_.Name, $_.Current, $_.Target, $_.Status) -ForegroundColor White
    }

    Write-Host ""
}

function Show-NextSteps {
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Authenticate: opencode auth login" -ForegroundColor White
    Write-Host "2. Start coding and observe automatic delegation" -ForegroundColor White
    Write-Host "3. Track metrics for 1 week" -ForegroundColor White
    Write-Host "4. Decision gate: 2026-01-14" -ForegroundColor White
    Write-Host ""
}

# Main monitoring loop
if ($Live) {
    while ($true) {
        Write-Header

        $stats = Get-AgentUsageStats
        if ($stats) {
            Show-AgentStats $stats
            Show-ConcurrencyConfig
            Watch-AgentLogs $LogFile
            Show-ComparisonMetrics
            Show-NextSteps
        }

        Write-Host "Refreshing in $IntervalSeconds seconds... (Ctrl+C to exit)" -ForegroundColor DarkGray
        Start-Sleep -Seconds $IntervalSeconds
    }
}
else {
    Write-Header

    $stats = Get-AgentUsageStats
    if ($stats) {
        Show-AgentStats $stats
        Show-ConcurrencyConfig
        Watch-AgentLogs $LogFile
        Show-ComparisonMetrics
        Show-NextSteps
    }
}
