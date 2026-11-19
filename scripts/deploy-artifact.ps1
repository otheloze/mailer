<#
.SYNOPSIS
    Builds the Next.js app in a Linux container and deploys only the .next artifact.

.DESCRIPTION
    The cPanel account is capped at ~1 GB of LVE memory and `next build` needs more,
    so the build cannot run on the server (it dies with
    `spawn .../node EAGAIN`). Raising the cap is not possible on this plan.

    This script works around that permanently:
      1. builds in a Linux node:20 container (same runtime as the server),
      2. packages .next and uploads it over SSH,
      3. swaps it into place and restarts Passenger,
      4. polls /api/health until the app answers.

    Only .next is transferred, so the server never compiles anything.

.PARAMETER EnvFile
    Production env file. Its values are passed to the container with --env-file,
    so NEXT_PUBLIC_* variables are inlined correctly into the client bundle.
    Required unless -SkipBuild is used.

.PARAMETER ArtifactPath
    Reuse an existing next.tgz instead of building (use with -SkipBuild).

.EXAMPLE
    # Pull the production env from the server first (do not keep a copy around):
    #   scp -P 1624 -i .ssh/deploy_ed25519 jlazxdoi@102.212.246.122:~/api/.env.production "$env:TEMP\mymailmarket.env"
    .\scripts\deploy-artifact.ps1 -EnvFile "$env:TEMP\mymailmarket.env"

.EXAMPLE
    .\scripts\deploy-artifact.ps1 -SkipBuild -ArtifactPath "$env:TEMP\mm-next.tgz"
#>
[CmdletBinding()]
param(
    [string]$EnvFile,
    [string]$ArtifactPath,
    [string]$Image       = "node:20-bookworm-slim",
    [string]$Volume      = "mmbuild",
    [string]$Remote      = "jlazxdoi@102.212.246.122",
    [int]   $Port        = 1624,
    [string]$KeyFile     = ".ssh\deploy_ed25519",
    [string]$AppRoot     = "/home/jlazxdoi/api",
    [string]$Domain      = "mymailmarket.com",
    [switch]$SkipBuild,
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$RemoteTgz = "$AppRoot/next-upload.tgz"
$LocalTgz  = if ($ArtifactPath) { $ArtifactPath } else { Join-Path $env:TEMP "mm-next.tgz" }

function Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Ok   { param([string]$Message) Write-Host "OK  $Message" -ForegroundColor Green }
function Die  { param([string]$Message) Write-Host "ERR $Message" -ForegroundColor Red; exit 1 }

function Invoke-Native {
    param([string]$Exe, [string[]]$CmdArgs, [string]$What)
    # Windows PowerShell 5.1 turns native stderr (e.g. "npm notice") into a
    # terminating error under $ErrorActionPreference = "Stop"; judge by exit code.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $Exe @CmdArgs } finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { Die "$What failed (exit $LASTEXITCODE)" }
}

# ---------------------------------------------------------------------------
# 0. Preconditions
# ---------------------------------------------------------------------------
$keyPath = if ([IO.Path]::IsPathRooted($KeyFile)) { $KeyFile } else { Join-Path $RepoRoot $KeyFile }
if (-not (Test-Path $keyPath)) { Die "SSH key not found: $keyPath" }

if (-not $SkipBuild) {
    if (-not $EnvFile) { Die "-EnvFile is required (production env file with NEXT_PUBLIC_* values)" }
    if (-not (Test-Path $EnvFile)) { Die "env file not found: $EnvFile" }

    Step "Checking Docker engine"
    & docker version --format "{{.Server.Version}}" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "Docker engine is not running. Start Docker Desktop and retry." }
    Ok "Docker engine reachable"

    # -----------------------------------------------------------------------
    # 1. Build inside the container
    # -----------------------------------------------------------------------
    Step "Building in $Image (this takes a few minutes)"
    & docker volume create $Volume | Out-Null

    # OUT points inside the volume so the tarball survives the container and can
    # be pulled out with `docker cp` (no bind-mount quirks involved).
    Invoke-Native -Exe "docker" -What "containerised build" -CmdArgs @(
        "run", "--rm", "--name", "mm-build",
        "--env-file", $EnvFile,
        "-e", "NODE_ENV=production",
        "-e", "OUT=$AppRoot",
        "-v", "${RepoRoot}:/src:ro",
        "-v", "${Volume}:$AppRoot",
        $Image, "bash", "/src/scripts/build-artifact.sh"
    )
    Ok "Build finished"

    # -----------------------------------------------------------------------
    # 2. Pull the artifact out of the volume
    # -----------------------------------------------------------------------
    Step "Extracting next.tgz from volume '$Volume'"
    & docker rm -f mm-get 2>$null | Out-Null
    Invoke-Native -Exe "docker" -What "create helper container" -CmdArgs @(
        "create", "--name", "mm-get", "-v", "${Volume}:$AppRoot", $Image, "true"
    )
    if (Test-Path $LocalTgz) { Remove-Item $LocalTgz -Force }
    Invoke-Native -Exe "docker" -What "copy artifact out" -CmdArgs @(
        "cp", "mm-get:$AppRoot/next.tgz", $LocalTgz
    )
    & docker rm -f mm-get | Out-Null

    $sizeMb = [math]::Round((Get-Item $LocalTgz).Length / 1MB, 1)
    Ok "Artifact ready: $LocalTgz ($sizeMb MB)"
}

if (-not (Test-Path $LocalTgz)) { Die "no artifact at $LocalTgz" }

if ($BuildOnly) {
    Ok "BuildOnly requested; artifact left at $LocalTgz"
    exit 0
}

# ---------------------------------------------------------------------------
# 3. Upload
# ---------------------------------------------------------------------------
Step "Uploading artifact to $Remote"
Invoke-Native -Exe "scp" -What "artifact upload" -CmdArgs @(
    "-P", "$Port", "-i", $keyPath, $LocalTgz, "${Remote}:$RemoteTgz"
)
Ok "Uploaded to $RemoteTgz"

# ---------------------------------------------------------------------------
# 4. Swap .next into place and restart Passenger
# ---------------------------------------------------------------------------
function Send-RemoteScript {
    param([string]$Name, [string]$Body)
    # Here-strings are CRLF on Windows; a CR would end up inside paths and shell
    # keywords (`set -e` + CR, `cd "/home/..."` + CR) and break the script
    # remotely, so normalise before shipping.
    $normalised = $Body -replace "`r`n", "`n"
    $localPath  = Join-Path $env:TEMP $Name
    $remotePath = "/tmp/$Name"
    [IO.File]::WriteAllText($localPath, $normalised, (New-Object Text.UTF8Encoding($false)))
    # Ship the script as a file. Passing a multi-line script as an ssh argument is
    # unreliable from Windows PowerShell: it strips embedded double quotes when it
    # builds the native command line, so `echo "x -> y"` reached bash as
    # `echo x - > y` and the shell failed with "Is a directory".
    Invoke-Native -Exe "scp" -What "$Name upload" -CmdArgs @(
        "-P", "$Port", "-i", $keyPath, $localPath, "${Remote}:$remotePath"
    )
    $prevEap = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    try { & ssh -p $Port -i $keyPath $Remote "bash $remotePath" } finally { $ErrorActionPreference = $prevEap }
    $script:RemoteExit = $LASTEXITCODE
    Remove-Item $localPath -Force -ErrorAction SilentlyContinue
}

Step "Activating the new build"
# Single-quoted here-string: nothing is expanded locally, so $(date) and friends
# run on the server. Placeholders are substituted below.
$remoteScript = @'
set -eu
cd "__APP_ROOT__"
ts=$(date -u +%Y%m%dT%H%M%SZ)
parked=""
if [ -d .next ]; then
  parked=".next.stale-$ts"
  mv .next "$parked"
  echo "parked previous build as $parked"
fi
# If anything below fails, put the previous build back so the site keeps serving.
# A failed extraction can leave a *partial* .next behind, so that is moved aside
# first; otherwise the trap would see a .next directory and skip the restore.
restore_previous() {
  rc=$?
  if [ "$rc" -ne 0 ] && [ -n "$parked" ] && [ -d "$parked" ]; then
    if [ -d .next ]; then
      mv .next ".next.partial-$ts" || true
      echo "rollback: partial .next moved aside"
    fi
    if mv "$parked" .next; then
      echo "rollback: previous .next restored"
    else
      echo "rollback: could not restore $parked"
    fi
  fi
}
trap restore_previous EXIT
tar -xzf "__TARBALL__"
test -f .next/BUILD_ID
test -f .next/prerender-manifest.json
echo "build_id=$(cat .next/BUILD_ID)"
mkdir -p tmp
touch tmp/restart.txt
echo "passenger restart triggered"
'@

Send-RemoteScript -Name "mm-activate.sh" -Body ($remoteScript.Replace("__APP_ROOT__", $AppRoot).Replace("__TARBALL__", $RemoteTgz))
if ($script:RemoteExit -ne 0) { Die "remote activation failed (exit $script:RemoteExit)" }
Ok "New build activated"

# ---------------------------------------------------------------------------
# 5. Health check, with one hard recycle before giving up
# ---------------------------------------------------------------------------
$healthUrl = "https://$Domain/api/health"

function Wait-Health {
    param([int]$Attempts, [int]$DelaySeconds = 5)
    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri $script:healthUrl -UseBasicParsing -TimeoutSec 15
            if ($resp.StatusCode -eq 200 -and $resp.Content -match '"ok"\s*:\s*true') {
                Ok "Health check passed after $($i * $DelaySeconds)s: $($resp.Content.Trim())"
                return $true
            }
            Write-Host "    attempt $i : HTTP $($resp.StatusCode)"
        } catch {
            Write-Host "    attempt $i : $($_.Exception.Message)"
        }
        Start-Sleep -Seconds $DelaySeconds
    }
    return $false
}

Step "Waiting for $healthUrl"
$healthy = Wait-Health -Attempts 12

if (-not $healthy) {
    # `touch tmp/restart.txt` alone is not reliable here: an app instance that is
    # still alive can keep answering 503 for the freshly unpacked build (observed
    # on this host), so the process is killed and the web server spawns a new
    # instance on the next request.
    Step "No healthy answer yet; recycling the app instance"
    $recycleScript = @'
set -eu
cd "__APP_ROOT__"
# The bracket keeps the pattern from matching this script's own command line.
pattern="[l]snode:__APP_ROOT__"
if pgrep -f "$pattern" > /dev/null 2>&1; then
  pkill -9 -f "$pattern" || true
  echo "killed the stale app instance"
else
  echo "no stale app instance found"
fi
touch tmp/restart.txt
echo "restart triggered"
'@
    $recycleScript = $recycleScript.Replace("__APP_ROOT__", $AppRoot)
    Send-RemoteScript -Name "mm-recycle.sh" -Body $recycleScript
    $healthy = Wait-Health -Attempts 18
}

if (-not $healthy) {
    # Everything is parked, so a failure here is recoverable: put the previous
    # build back rather than leaving the site broken for the next visitor.
    Step "Health check never passed; restoring the previous build"
    $rollbackScript = @'
set -eu
cd "__APP_ROOT__"
ts=$(date -u +%Y%m%dT%H%M%SZ)
if [ -d .next ]; then
  mv .next ".next.failed-$ts"
  echo "moved the new build aside"
fi
prev=$(ls -1dt .next.stale-* 2>/dev/null | head -n 1 || true)
if [ -n "$prev" ] && [ -d "$prev" ]; then
  mv "$prev" .next
  echo "restored previous build from $prev"
  touch tmp/restart.txt
  echo "restart triggered"
else
  echo "no parked build to restore"
fi
'@
    Send-RemoteScript -Name "mm-rollback.sh" -Body $rollbackScript.Replace("__APP_ROOT__", $AppRoot)
    Write-Host "`n--- last entries in $AppRoot/stderr.log" -ForegroundColor Yellow
    $ErrorActionPreference = "Continue"
    & ssh -p $Port -i $keyPath $Remote "tail -n 30 '$AppRoot/stderr.log'"
    Die "deployment rolled back: $healthUrl never returned ok (new build kept as .next.failed-*)"
}

# ---------------------------------------------------------------------------
# 6. Tidy up
# ---------------------------------------------------------------------------
Step "Cleaning up"
$ErrorActionPreference = "Continue"
& ssh -p $Port -i $keyPath $Remote "rm -f '$RemoteTgz' /tmp/mm-activate.sh /tmp/mm-recycle.sh /tmp/mm-rollback.sh; rm -rf '$AppRoot'/.next.stale-*; echo cleaned" | Out-Null
if (-not $ArtifactPath -and (Test-Path $LocalTgz)) { Remove-Item $LocalTgz -Force }
Ok "Removed remote tarball and parked builds"

Write-Host "`nDeployed $Domain from a container-built artifact." -ForegroundColor Green
Write-Host "Note: the cPanel account still cannot build on-server (~1 GB LVE cap);" -ForegroundColor Yellow
Write-Host "      keep using this script instead of scripts/deploy-production.sh." -ForegroundColor Yellow
