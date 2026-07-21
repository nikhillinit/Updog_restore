# Marginal MOIC Non-Production Shadow-Soak Runbook

- Status: BLOCKED pending provider-native runtime and database identity proof
- Production use: forbidden
- Permitted mode: shadow only
- Evidence classification: NON-PRODUCTION SOAK EVIDENCE ONLY

This runbook may be executed only after the ADR-056 closeout and
shadow-observability PRs are merged and a separate approval names the provider
project, environment, deployment, backing database, deployed SHA, admin actor,
pilot fund, configuration owner, rollback owner, UTC window, approved dates, log
queries, and evidence store.

URL inequality and `/healthz` are necessary but insufficient target proof. The
secure approval record must include provider-native command or API output
proving both the runtime and backing database are non-production. The
identity-read mechanism is already known in this repository:
`vercel inspect <deployment-alias>` for the runtime deployment, `railway status`
with explicit `-p`/`-e`/`-s` for the worker environment, and the Neon
project/branch ID for the backing database. Only the concrete soak-target and
production reference IDs are deferred: they come from the Task 10 approval
record and the secure prod-verification store and are never inlined into this
repository. Absence of those captured IDs is a hard stop, not permission to
infer them.

Approval of this runbook's PR does not authorize a feature-flag change,
reconciliation write, mode-row mutation, production action, on-mode transition,
or release claim.

## Required inputs

Values come from the secure approval record or approved secret manager and must
never be printed into a repository, issue, PR, or shared terminal transcript.

```powershell
$requiredNames = @(
  'MOIC_SOAK_ENVIRONMENT',
  'MOIC_SOAK_BASE_URL',
  'MOIC_SOAK_EXPECTED_SHA',
  'MOIC_SOAK_OBSERVABILITY_MERGE_SHA',
  'MOIC_SOAK_PROVIDER_PROJECT_ID',
  'MOIC_SOAK_PROVIDER_ENVIRONMENT_ID',
  'MOIC_SOAK_PROVIDER_DEPLOYMENT_ID',
  'MOIC_SOAK_DATABASE_ID',
  'PRODUCTION_ORIGIN',
  'PRODUCTION_PROVIDER_ENVIRONMENT_ID',
  'PRODUCTION_PROVIDER_DEPLOYMENT_ID',
  'PRODUCTION_DATABASE_ID',
  'MOIC_SOAK_FUND_ID',
  'MOIC_SOAK_AS_OF_DATES',
  'MOIC_SOAK_CHECKPOINT_INDEX',
  'MOIC_SOAK_USERNAME',
  'MOIC_SOAK_PASSWORD',
  'MOIC_SOAK_EVIDENCE_SALT'
)
$missing = $requiredNames | Where-Object {
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
}
if ($missing.Count -gt 0) {
  throw "Missing required environment variables: $($missing -join ', ')"
}
```

## Step 1: Target and ancestry preflight

```powershell
$environment = $env:MOIC_SOAK_ENVIRONMENT.Trim().ToLowerInvariant()
if ($environment -notin @('local', 'staging')) {
  throw 'MOIC_SOAK_ENVIRONMENT must be local or staging'
}
$baseUri = [Uri]$env:MOIC_SOAK_BASE_URL
$productionUri = [Uri]$env:PRODUCTION_ORIGIN
if (-not $baseUri.IsAbsoluteUri -or -not $productionUri.IsAbsoluteUri) {
  throw 'Soak and production origins must be absolute URIs'
}
$baseAuthority = $baseUri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
$productionAuthority = $productionUri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
if ($baseAuthority -eq $productionAuthority) { throw 'Soak target equals production origin' }
if ($environment -eq 'staging' -and $baseUri.Scheme -ne 'https') {
  throw 'Shared staging must use HTTPS'
}
if ($environment -eq 'local' -and $baseUri.Host -notin @('localhost', '127.0.0.1')) {
  throw 'Local target must use loopback'
}
if ($env:MOIC_SOAK_PROVIDER_ENVIRONMENT_ID -eq $env:PRODUCTION_PROVIDER_ENVIRONMENT_ID) {
  throw 'Provider environment identity equals production'
}
if ($env:MOIC_SOAK_PROVIDER_DEPLOYMENT_ID -eq $env:PRODUCTION_PROVIDER_DEPLOYMENT_ID) {
  throw 'Provider deployment identity equals production'
}
if ($env:MOIC_SOAK_DATABASE_ID -eq $env:PRODUCTION_DATABASE_ID) {
  throw 'Backing database identity equals production'
}
foreach ($shaName in 'MOIC_SOAK_EXPECTED_SHA','MOIC_SOAK_OBSERVABILITY_MERGE_SHA') {
  if ([Environment]::GetEnvironmentVariable($shaName) -notmatch '^[0-9a-fA-F]{40}$') {
    throw "$shaName must be a full SHA"
  }
}
git fetch origin main --prune
git cat-file -e "$($env:MOIC_SOAK_EXPECTED_SHA)^{commit}"
if ($LASTEXITCODE -ne 0) { throw 'Deployed SHA is not present in fetched repository history' }
git merge-base --is-ancestor `
  $env:MOIC_SOAK_OBSERVABILITY_MERGE_SHA `
  $env:MOIC_SOAK_EXPECTED_SHA
if ($LASTEXITCODE -ne 0) {
  throw 'Observability merge is not an ancestor of the deployed SHA'
}
$baseUrl = $baseUri.AbsoluteUri.TrimEnd('/')
if ($environment -eq 'staging') {
  Resolve-DnsName $baseUri.DnsSafeHost -ErrorAction Stop | Out-Null
}
$health = Invoke-RestMethod -Method Get -Uri "$baseUrl/healthz"
if ($health.status -ne 'ok' -or $health.commit_sha -ne $env:MOIC_SOAK_EXPECTED_SHA) {
  throw 'Target health or deployed SHA does not match approval'
}
```

Before this block, the operator must run and preserve the exact provider-native
runtime and database identity commands from the secure approval record, using
the known recipes (`vercel inspect`, `railway status -p/-e/-s`, Neon
project/branch ID) to read the soak-target and production reference IDs, then
confirm they differ. Environment-variable inequality is a secondary guard, not
independent evidence. If those provider commands or their captured output are
absent, stop.

## Step 2: Fund and date validation and opaque fingerprints

```powershell
$fundId = 0
if (-not [int]::TryParse($env:MOIC_SOAK_FUND_ID, [ref]$fundId) -or $fundId -le 0) {
  throw 'MOIC_SOAK_FUND_ID must be a positive integer'
}
$dateTexts = @(
  $env:MOIC_SOAK_AS_OF_DATES.Split(',') |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ } |
    Sort-Object -Unique
)
if ($dateTexts.Count -lt 3) { throw 'At least three distinct dates are required' }
$asOfDates = foreach ($dateText in $dateTexts) {
  $parsed = [datetime]::MinValue
  if (-not [datetime]::TryParseExact(
    $dateText,
    'yyyy-MM-dd',
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::None,
    [ref]$parsed
  )) { throw "Invalid soak date: $dateText" }
  $parsed
}
$checkpointIndex = 0
if (-not [int]::TryParse($env:MOIC_SOAK_CHECKPOINT_INDEX, [ref]$checkpointIndex) -or
    $checkpointIndex -lt 0 -or $checkpointIndex -gt 4) {
  throw 'MOIC_SOAK_CHECKPOINT_INDEX must be 0 through 4'
}
if ($env:MOIC_SOAK_EVIDENCE_SALT.Length -lt 32) {
  throw 'Evidence salt must contain at least 32 characters'
}
function Get-OpaqueFingerprint([string]$value) {
  $key = [Text.Encoding]::UTF8.GetBytes($env:MOIC_SOAK_EVIDENCE_SALT)
  $hmac = [Security.Cryptography.HMACSHA256]::new($key)
  try {
    return [Convert]::ToHexString(
      $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($value))
    ).ToLowerInvariant()
  } finally {
    $hmac.Dispose()
  }
}
$targetFingerprint = Get-OpaqueFingerprint "$environment|$($env:MOIC_SOAK_PROVIDER_PROJECT_ID)|$baseAuthority"
$fundFingerprint = Get-OpaqueFingerprint "$environment|$fundId"
```

Expected at runtime: validated fund/date/checkpoint inputs and opaque evidence
identifiers; no raw target or fund identifiers leave the secure evidence store.

## Step 3: Authentication and dormant-state proof

```powershell
$firstDate = $asOfDates[0].ToString('yyyy-MM-dd')
$probeUri = "$baseUrl/api/funds/$fundId/moic/marginal-rankings?asOfDate=$firstDate"
$unauth = Invoke-WebRequest -Method Get -Uri $probeUri -SkipHttpErrorCheck
if ($unauth.StatusCode -ne 401) { throw 'Unauthenticated marginal probe must return 401' }

$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$preAuthCsrf = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/auth/csrf" -WebSession $session
$loginBody = @{
  username = $env:MOIC_SOAK_USERNAME
  password = $env:MOIC_SOAK_PASSWORD
} | ConvertTo-Json
$login = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/auth/login" `
  -WebSession $session `
  -Headers @{ 'X-CSRF-Token' = [string]$preAuthCsrf.csrfToken } `
  -ContentType 'application/json' `
  -Body $loginBody
if ($login.user.role -ne 'admin') { throw 'Approved soak actor must be admin' }
$sessionCsrf = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/auth/csrf" -WebSession $session
$csrfHeaders = @{ 'X-CSRF-Token' = [string]$sessionCsrf.csrfToken }

$flagOnNoRow = Invoke-WebRequest -Method Get -Uri $probeUri -WebSession $session -SkipHttpErrorCheck
if ($flagOnNoRow.StatusCode -ne 404) {
  throw 'After approved non-production flag enablement, no-row probe must remain 404'
}
$planned = Invoke-RestMethod -Method Get `
  -Uri "$baseUrl/api/funds/$fundId/moic/rankings?contract=v2" `
  -WebSession $session
if ($planned.contractVersion -ne '2.1.0' -or
    $planned.modePreview.configuredMode -ne 'off' -or
    $planned.modePreview.effectiveMode -ne 'off') {
  throw 'Pilot fund is not dormant'
}
$expectedVersion = [int]$planned.modePreview.version
```

The provider-specific flag enable/redeploy occurs only after Task 10's approval
and provider/data-plane proof, immediately before the no-row probe. Do not print
login, CSRF, cookie, or session values.

## Step 4: Reconciliation and shadow transition

```powershell
$reconciliationHeaders = @{
  'X-CSRF-Token' = [string]$sessionCsrf.csrfToken
  'Idempotency-Key' = "adr056-nn3-reconcile-$fundId-$([Guid]::NewGuid().ToString('N'))"
}
$reconciliation = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/admin/funds/$fundId/moic/reconciliations" `
  -WebSession $session `
  -Headers $reconciliationHeaders `
  -ContentType 'application/json' `
  -Body '{}'
$acceptedRunId = [long]::Parse(
  [string]$reconciliation.runId,
  [Globalization.CultureInfo]::InvariantCulture
)

$shadowHeaders = @{
  'X-CSRF-Token' = [string]$sessionCsrf.csrfToken
  'Idempotency-Key' = "adr056-nn3-shadow-$fundId-$([Guid]::NewGuid().ToString('N'))"
}
$shadowBody = @{
  expectedVersion = $expectedVersion
  configuredMode = 'shadow'
  killSwitchActive = $false
  acceptedReconciliationRunId = $acceptedRunId
} | ConvertTo-Json
$shadowMode = Invoke-RestMethod -Method Put `
  -Uri "$baseUrl/api/admin/funds/$fundId/calculation-modes/fund-moic-rankings" `
  -WebSession $session `
  -Headers $shadowHeaders `
  -ContentType 'application/json' `
  -Body $shadowBody
if ($shadowMode.configuredMode -ne 'shadow' -or
    $shadowMode.effectiveMode -ne 'shadow' -or
    $shadowMode.killSwitchActive -or
    [string]::IsNullOrWhiteSpace($shadowMode.shadowStartedAt)) {
  throw 'Mode update did not produce effective shadow with a start timestamp'
}
$shadowStartedAt = [datetimeoffset]::Parse(
  [string]$shadowMode.shadowStartedAt,
  [Globalization.CultureInfo]::InvariantCulture,
  [Globalization.DateTimeStyles]::AssumeUniversal
).ToUniversalTime()
if ([Math]::Abs(([datetimeoffset]::UtcNow - $shadowStartedAt).TotalMinutes) -gt 5) {
  throw 'shadowStartedAt is not anchored to the current transition'
}
$windowStartUtc = $shadowStartedAt
$checkpointUtc = @(0, 1, 3, 5, 7) | ForEach-Object { $windowStartUtc.AddDays($_) }
$shadowVersion = [int]$shadowMode.version
```

The observation clock is derived only from the server's returned
`shadowStartedAt`, never from an operator-supplied earlier timestamp.

## Step 5: Checkpoint continuity and probes

```powershell
$scheduledUtc = $checkpointUtc[$checkpointIndex]
if ([Math]::Abs(([datetimeoffset]::UtcNow - $scheduledUtc).TotalMinutes) -gt 30) {
  throw "Checkpoint $checkpointIndex is outside its 30-minute window"
}
$current = Invoke-RestMethod -Method Get `
  -Uri "$baseUrl/api/funds/$fundId/moic/rankings?contract=v2" `
  -WebSession $session
$preview = $current.modePreview
$currentShadowStartedAt = [datetimeoffset]::Parse(
  [string]$preview.shadowStartedAt,
  [Globalization.CultureInfo]::InvariantCulture,
  [Globalization.DateTimeStyles]::AssumeUniversal
).ToUniversalTime()
if ($preview.configuredMode -ne 'shadow' -or
    $preview.effectiveMode -ne 'shadow' -or
    $preview.killSwitchActive -or
    [int]$preview.version -ne $shadowVersion -or
    $currentShadowStartedAt -ne $shadowStartedAt -or
    -not $preview.currentSourceMatchesAccepted -or
    $preview.unreconciledEditsPresent) {
  throw 'Shadow mode, start clock, version, or accepted source changed; roll back and restart'
}

$probeReceipts = foreach ($dateText in $dateTexts) {
  $requestId = "adr056-shadow-$checkpointIndex-$([Guid]::NewGuid().ToString('N'))"
  $dated = Invoke-WebRequest -Method Get `
    -Uri "$baseUrl/api/funds/$fundId/moic/marginal-rankings?asOfDate=$dateText" `
    -WebSession $session `
    -Headers @{ 'X-Request-ID' = $requestId }
  $body = $dated.Content | ConvertFrom-Json
  if ($dated.StatusCode -ne 200 -or
      $body.contractVersion -ne 'marginal-reserve-rankings-v2' -or
      $body.mode -ne 'shadow' -or
      $body.actionability -ne 'non_actionable') {
    throw "Shadow contract failed for $dateText"
  }
  [pscustomobject]@{
    CheckpointIndex = $checkpointIndex
    ScheduledUtc = $scheduledUtc.ToString('O')
    AsOfDate = $dateText
    RequestId = [string]$dated.Headers['X-Request-ID']
    FactsInputHash = [string]$body.factsInputHash
    AssumptionsHash = [string]$body.assumptionsHash
  }
}
$probeReceipts
```

Rerun target/provider/database/SHA preflight and authentication in a fresh
PowerShell 7 session before each checkpoint. Store receipts only in the approved
external evidence store.

## Step 6: Thresholds and stop conditions

The runbook requires:

- Five checkpoints at T+0, T+1d, T+3d, T+5d, and T+7d.
- At least fifteen successful authenticated probes over at least three dates.
- Unchanged `shadowStartedAt`, mode version, accepted source, and deployed SHA.
- Every response is V2, `shadow`, and `non_actionable`.
- Comparison-event count equals successful response count for the exclusive
  pilot window using the approved saved query.
- Zero marginal-route 5xx responses and zero unexplained server errors.
- A checkpoint whose planned comparison basis is empty because the candidate
  facts source is unavailable is not a clean probe: record it, treat a
  persistently empty planned side as `annotation_required`, and do not count it
  toward the fifteen-probe threshold.
- Source-hash changes trigger rollback, a new accepted reconciliation, and a
  newly approved seven-day window.
- Every `annotation_required` result receives investment-team review inside the
  approved log/evidence systems.
- GitHub receives aggregates and opaque fingerprints only.

## Step 7: Rollback

Rollback may run days after the shadow transition in a fresh PowerShell 7
session, so first re-run the Step 1 target/provider/database/SHA preflight and
the Step 3 authentication to re-establish `$session` and `$sessionCsrf` before
the block below.

```powershell
$current = Invoke-RestMethod -Method Get `
  -Uri "$baseUrl/api/funds/$fundId/moic/rankings?contract=v2" `
  -WebSession $session
$version = [int]$current.modePreview.version
$configured = [string]$current.modePreview.configuredMode
if ($version -eq 0 -and $configured -eq 'off') {
  Write-Output 'No mode row exists; disable the approved non-production flag now.'
} elseif ($version -gt 0 -and $configured -eq 'shadow') {
  $killHeaders = @{
    'X-CSRF-Token' = [string]$sessionCsrf.csrfToken
    'Idempotency-Key' = "adr056-nn3-kill-$fundId-$([Guid]::NewGuid().ToString('N'))"
  }
  $killBody = @{
    expectedVersion = $version
    configuredMode = 'shadow'
    killSwitchActive = $true
  } | ConvertTo-Json
  $killed = Invoke-RestMethod -Method Put `
    -Uri "$baseUrl/api/admin/funds/$fundId/calculation-modes/fund-moic-rankings" `
    -WebSession $session `
    -Headers $killHeaders `
    -ContentType 'application/json' `
    -Body $killBody
  if ($killed.effectiveMode -ne 'off' -or -not $killed.killSwitchActive) {
    throw 'Kill switch did not force effective off'
  }
  $offHeaders = @{
    'X-CSRF-Token' = [string]$sessionCsrf.csrfToken
    'Idempotency-Key' = "adr056-nn3-off-$fundId-$([Guid]::NewGuid().ToString('N'))"
  }
  $offBody = @{
    expectedVersion = [int]$killed.version
    configuredMode = 'off'
    killSwitchActive = $true
  } | ConvertTo-Json
  $off = Invoke-RestMethod -Method Put `
    -Uri "$baseUrl/api/admin/funds/$fundId/calculation-modes/fund-moic-rankings" `
    -WebSession $session `
    -Headers $offHeaders `
    -ContentType 'application/json' `
    -Body $offBody
  if ($off.configuredMode -ne 'off' -or $off.effectiveMode -ne 'off') {
    throw 'Stable off mode was not persisted'
  }
} elseif ($version -gt 0 -and $configured -eq 'off') {
  Write-Output 'Mode row is already off; disable the approved non-production flag now.'
} else {
  throw "Unexpected rollback state version=$version mode=$configured; disable the non-production flag and stop"
}
```

Execute the exact provider-native flag-disable and restart/redeploy commands
from the secure approval record in every rollback branch, then require the
marginal route to return 404. Preserve mode/idempotency rows for audit.
