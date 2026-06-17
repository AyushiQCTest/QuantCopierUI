"""
Windows post-exit updater: download to staging, then swap via detached PowerShell.

Strategy
--------
* Files are staged next to the install dir first (no file-lock issues during download).
* A detached PowerShell script then:
  1. Waits for the Tauri app to close.
  2. Kills any remaining QuantCopier processes.
  3. Swaps each staged file using rename-then-replace so Windows file locks are
     not a problem:
        Rename  <target>.exe  →  <target>.exe.old   (always succeeds on Windows,
                                                      even on an in-use file)
        Copy    <staged>.exe  →  <target>.exe
        Delete  <target>.exe.old
  4. Writes the VERSION file.
  5. Persists QUANTCOPIER_INSTALL_DIR in the user environment.
  6. Relaunches the main application.
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

from gcp_bucket_manager import (
    GCPBucketManager,
    blob_name_for_component,
    fetch_releases_manifest_data,
    release_tag_from_manifest,
)

COMPONENT_KEYS = ("mainInstaller", "qcdemoSidecar", "apiSidecar")

STAGING_DIR_NAME = ".update_staging"

# Known names for the main UI executable (tried in order during target discovery).
MAIN_EXE_CANDIDATES = (
    "QuantCopierTelegramUI.exe",
    "QuantCopierMT5.exe",
    "QuantCopier.exe",
    "quantcopiermt5.exe",
    "quantcopierui.exe",
)

# Names for the API sidecar executable.
API_SIDECAR_CANDIDATES = (
    "QuantCopierAPI-x86_64-pc-windows-msvc.exe",
    "QuantCopierAPI.exe",
)


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def resolve_install_dir(explicit: Optional[str] = None) -> Path:
    """
    Resolve the application install root.

    Priority:
    1. QUANTCOPIER_INSTALL_DIR env var — always wins (set by PS updater after install,
       or in .env for testing / dev override). This ensures the correct install root
       is used even when the Tauri frontend passes an explicit path.
    2. Explicit path from API request (install_dir field in the POST body)
    3. Sidecar executable parent (parent of binaries/ when applicable)
    4. For PyInstaller: walk up temp dir tree looking for VERSION or main exe
    5. Project root in dev
    """
    # 1. QUANTCOPIER_INSTALL_DIR always wins — set by the PS updater after every
    #    successful update, or in .env for test/dev overrides.
    env_dir = os.getenv("QUANTCOPIER_INSTALL_DIR", "").strip()
    if env_dir:
        resolved = Path(env_dir).expanduser().resolve()
        print(f"[resolve_install_dir] Using QUANTCOPIER_INSTALL_DIR: {resolved}")
        return resolved

    # 2. Explicit path provided by the Tauri frontend
    if explicit:
        return Path(explicit).expanduser().resolve()

    if _is_frozen():
        exe_parent = Path(sys.executable).resolve().parent
        if exe_parent.name.lower() == "binaries":
            return exe_parent.parent

        # Running from PyInstaller temp directory — walk up to find install root
        if "temp" in exe_parent.as_posix().lower() or "_mei" in exe_parent.as_posix().lower():
            current = exe_parent
            for _ in range(6):
                version_file = current / "VERSION"
                if version_file.exists():
                    print(f"[resolve_install_dir] Found VERSION at {current}, using as install dir")
                    return current
                main_exe = current / "QuantCopierTelegramUI.exe"
                if main_exe.exists():
                    print(f"[resolve_install_dir] Found main exe at {current}, using as install dir")
                    return current
                current = current.parent
                if current == current.parent:
                    break

            # Dev fallback: project root
            project_root = Path(__file__).resolve().parent.parent
            if (project_root / "VERSION").exists():
                print(f"[resolve_install_dir] Using project root {project_root} as install dir")
                return project_root

        return exe_parent

    return Path(__file__).resolve().parent.parent



def _has_binaries_subdir(install_dir: Path) -> bool:
    """Return True if an explicit binaries/ subdirectory exists in the install root."""
    return (install_dir / "binaries").is_dir()


def api_sidecar_relative_targets(install_dir: Optional[Path] = None) -> list[str]:
    """Relative paths under install_dir for the API sidecar artifact.

    InnoSetup installs everything flat (no binaries/ subdirectory). Only use the
    binaries/ prefix when that directory actually exists at the install root.
    """
    if install_dir and _has_binaries_subdir(install_dir):
        return [
            "binaries/QuantCopierAPI-x86_64-pc-windows-msvc.exe",
            "binaries/QuantCopierAPI.exe",
        ]
    # Flat layout (InnoSetup default)
    return [
        "QuantCopierAPI-x86_64-pc-windows-msvc.exe",
        "QuantCopierAPI.exe",
    ]


def component_relative_targets(
    component_key: str, filename: str, install_dir: Optional[Path] = None
) -> list[str]:
    """Map a manifest component to one or more install-relative target paths."""
    if component_key == "mainInstaller":
        return [filename]
    if component_key == "apiSidecar":
        return api_sidecar_relative_targets(install_dir)
    if component_key == "qcdemoSidecar":
        if install_dir and _has_binaries_subdir(install_dir):
            return [f"binaries/{filename}"]
        return [filename]
    return [filename]


def discover_restart_exe(install_dir: Path, preferred: Optional[str] = None) -> Optional[Path]:
    """Pick the UI executable to relaunch after update."""
    if preferred:
        candidate = install_dir / preferred
        if candidate.is_file():
            return candidate

    for name in MAIN_EXE_CANDIDATES:
        candidate = install_dir / name
        if candidate.is_file():
            print(f"[WindowsUpdater] Found restart exe: {candidate}")
            return candidate

    print(f"[WindowsUpdater] No restart exe found in {install_dir}")
    return None


def build_swap_plan(manifest: dict, install_dir: Path) -> list[dict[str, str]]:
    """Build a list of {component, staging_name, target_path} swaps for all manifest components."""
    files = manifest.get("files") if isinstance(manifest.get("files"), dict) else {}
    plan: list[dict[str, str]] = []
    seen_staging: set[str] = set()

    for key in COMPONENT_KEYS:
        filename = files.get(key)
        if not filename:
            continue

        staging_name = filename
        for rel_target in component_relative_targets(key, filename, install_dir):
            if staging_name in seen_staging and rel_target in [p["staging_name"] for p in plan]:
                continue
            target = install_dir / rel_target
            plan.append(
                {
                    "component": key,
                    "staging_name": staging_name,
                    "target_path": str(target),
                }
            )
        seen_staging.add(staging_name)

    if not plan:
        raise ValueError("releases.json contains no installable components")

    return plan


def download_manifest_artifacts(
    manifest: dict,
    install_dir: Path,
    version: str,
    manager: Optional[GCPBucketManager] = None,
) -> Path:
    """Download all manifest binaries into install_dir/.update_staging/<version>/."""
    bucket_manager = manager or GCPBucketManager()
    if not bucket_manager.bucket:
        raise RuntimeError("GCS bucket manager is not initialized")

    staging_dir = install_dir / STAGING_DIR_NAME / version
    staging_dir.mkdir(parents=True, exist_ok=True)

    files = manifest.get("files") if isinstance(manifest.get("files"), dict) else {}
    downloaded: set[str] = set()

    for key in COMPONENT_KEYS:
        filename = files.get(key)
        if not filename or filename in downloaded:
            continue
        blob_name = blob_name_for_component(manifest, key)
        if not blob_name:
            raise RuntimeError(f"Missing blob path for manifest component: {key}")

        dest = staging_dir / filename
        print(f"[WindowsUpdater] Downloading {blob_name} -> {dest}")
        if not bucket_manager.download_file(blob_name, str(dest)):
            raise RuntimeError(f"Failed to download {blob_name}")

        downloaded.add(filename)

    print(f"[WindowsUpdater] Staged {len(downloaded)} file(s) in {staging_dir}")
    return staging_dir


def write_powershell_updater(
    install_dir: Path,
    staging_dir: Path,
    version: str,
    swap_plan: list[dict[str, str]],
    restart_exe: Optional[Path] = None,
) -> Path:
    """Write a detached PowerShell script that swaps staged files after the app exits.

    Uses the rename-then-replace pattern so Windows file locks are not a problem:
      Rename <target>.exe  →  <target>.exe.old
      Copy   <staged>.exe  →  <target>.exe
      Delete <target>.exe.old
    """
    script_path = install_dir / f"apply-update-{version}.ps1"
    plan_json = json.dumps(swap_plan)
    restart_literal = str(restart_exe) if restart_exe else ""

    # Build ordered list of all main-exe candidate names for target discovery
    main_exe_json = json.dumps(list(MAIN_EXE_CANDIDATES))

    script = f"""# Auto-generated QuantCopier updater - do not edit
# Log file is written next to this script for diagnostics.
$ErrorActionPreference = "Continue"
$LogFile = Join-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) "update-log.txt"
function Log {{
    param($msg)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] $msg"
    Write-Host $line
    try {{ $line | Out-File -LiteralPath $LogFile -Append -Encoding UTF8 }} catch {{}}
}}
$InstallDir   = "{install_dir}"
$StagingDir   = "{staging_dir}"
$Version      = "{version}"
$RestartExe   = "{restart_literal}"
$MainExeNames = @'
{main_exe_json}
'@ | ConvertFrom-Json

$SwapPlan = @'
{plan_json}
'@ | ConvertFrom-Json

# ---------------------------------------------------------------------------
# Step 1: Wait briefly for the Tauri UI to close cleanly
# ---------------------------------------------------------------------------
Log "QuantCopier updater v$Version starting - waiting for app to close..."
Start-Sleep -Seconds 3

# ---------------------------------------------------------------------------
# Step 2: Kill any remaining QuantCopier processes
# ---------------------------------------------------------------------------
$processNames = @(
    "QuantCopierTelegramUI",
    "QuantCopierMT5",
    "QuantCopierAPI",
    "QuantCopierUI",
    "QuantCopier"
)
foreach ($name in $processNames) {{
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($procs) {{
        Log "Stopping process: $name"
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    }}
}}
Start-Sleep -Seconds 2

# ---------------------------------------------------------------------------
# Helper: find the real target path for a staged file.
# ---------------------------------------------------------------------------
function Resolve-TargetPath {{
    param(
        [string]$StagedName,
        [string]$Component,
        [string]$PlanTarget
    )

    $planDir = Split-Path $PlanTarget -Parent
    if (Test-Path $PlanTarget) {{
        return $PlanTarget
    }}
    if ((Test-Path $planDir) -and $planDir -ne $InstallDir) {{
        return $PlanTarget
    }}

    if ($Component -eq "mainInstaller") {{
        foreach ($name in $MainExeNames) {{
            $candidate = Join-Path $InstallDir $name
            if (Test-Path $candidate) {{
                Log "  [TargetResolver] Mapped $StagedName -> $candidate"
                return $candidate
            }}
        }}
    }}

    $flat = Join-Path $InstallDir $StagedName
    Log "  [TargetResolver] Using flat path: $flat"
    return $flat
}}

# ---------------------------------------------------------------------------
# Helper: rename-then-replace swap (handles in-use / locked files)
# ---------------------------------------------------------------------------
function Swap-File {{
    param([string]$StagedPath, [string]$TargetPath)

    if (-not (Test-Path $StagedPath)) {{
        Log "  [Swap] Skipping missing staged file: $StagedPath"
        return
    }}

    $targetDir = Split-Path $TargetPath -Parent
    if (-not (Test-Path $targetDir)) {{
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }}

    $oldPath = "$TargetPath.old"

    if (Test-Path $oldPath) {{
        Remove-Item -LiteralPath $oldPath -Force -ErrorAction SilentlyContinue
    }}

    if (Test-Path $TargetPath) {{
        Log "  [Swap] Renaming $TargetPath -> $oldPath"
        try {{
            Rename-Item -LiteralPath $TargetPath -NewName ([System.IO.Path]::GetFileName($oldPath)) -Force
        }} catch {{
            Log "  [Swap] Rename failed: $_ - attempting direct overwrite"
            Copy-Item -LiteralPath $StagedPath -Destination $TargetPath -Force
            return
        }}
    }}

    Log "  [Swap] Placing $StagedPath -> $TargetPath"
    Copy-Item -LiteralPath $StagedPath -Destination $TargetPath -Force

    if (Test-Path $oldPath) {{
        Remove-Item -LiteralPath $oldPath -Force -ErrorAction SilentlyContinue
    }}
}}

# ---------------------------------------------------------------------------
# Step 3: Swap each component
# ---------------------------------------------------------------------------
$swapped = @{{}}
foreach ($item in $SwapPlan) {{
    $stagedPath = Join-Path $StagingDir $item.staging_name
    $targetPath = Resolve-TargetPath `
        -StagedName  $item.staging_name `
        -Component   $item.component `
        -PlanTarget  $item.target_path

    if ($swapped.ContainsKey($item.staging_name) -and $swapped[$item.staging_name] -eq $targetPath) {{
        continue
    }}

    Log "Swapping [$($item.component)]: $($item.staging_name) -> $targetPath"
    Swap-File -StagedPath $stagedPath -TargetPath $targetPath
    $swapped[$item.staging_name] = $targetPath
}}

# ---------------------------------------------------------------------------
# Step 4: Cleanup legacy VERSION file if present
# ---------------------------------------------------------------------------
$versionFile = Join-Path $InstallDir "VERSION"
if (Test-Path $versionFile) {{
    try {{
        Remove-Item -LiteralPath $versionFile -Force -ErrorAction SilentlyContinue
        Log "Removed legacy VERSION file"
    }} catch {{
        Log "Could not remove legacy VERSION file: $_"
    }}
}}

# ---------------------------------------------------------------------------
# Step 5: Persist QUANTCOPIER_INSTALL_DIR environment variable
# ---------------------------------------------------------------------------
$envSet = $false
try {{
    [System.Environment]::SetEnvironmentVariable("QUANTCOPIER_INSTALL_DIR", $InstallDir, "Machine")
    $envSet = $true
    Log "Set QUANTCOPIER_INSTALL_DIR (Machine) = $InstallDir"
}} catch {{
    Log "Machine-level env failed (need admin): $_"
}}
if (-not $envSet) {{
    try {{
        [System.Environment]::SetEnvironmentVariable("QUANTCOPIER_INSTALL_DIR", $InstallDir, "User")
        Log "Set QUANTCOPIER_INSTALL_DIR (User) = $InstallDir"
    }} catch {{
        Log "User-level env also failed: $_"
    }}
}}

# ---------------------------------------------------------------------------
# Step 6: Relaunch the application
# ---------------------------------------------------------------------------
if (-not $RestartExe) {{
    foreach ($name in $MainExeNames) {{
        $candidate = Join-Path $InstallDir $name
        if (Test-Path $candidate) {{
            $RestartExe = $candidate
            break
        }}
    }}
}}

if ($RestartExe -and (Test-Path $RestartExe)) {{
    Log "Relaunching: $RestartExe"
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $RestartExe
    $psi.WorkingDirectory = Split-Path $RestartExe -Parent
    $psi.UseShellExecute = $false
    $psi.EnvironmentVariables["QUANTCOPIER_INSTALL_DIR"] = $InstallDir
    [System.Diagnostics.Process]::Start($psi) | Out-Null
}} else {{
    Log "No restart exe found - skipping relaunch."
}}

# ---------------------------------------------------------------------------
# Step 7: Cleanup staging, VBS launcher, and this script
# ---------------------------------------------------------------------------
try {{
    if (Test-Path $StagingDir) {{
        Remove-Item -LiteralPath $StagingDir -Recurse -Force -ErrorAction SilentlyContinue
    }}
    $parentStaging = Split-Path $StagingDir -Parent
    if ((Test-Path $parentStaging) -and ((Get-ChildItem $parentStaging | Measure-Object).Count -eq 0)) {{
        Remove-Item -LiteralPath $parentStaging -Recurse -Force -ErrorAction SilentlyContinue
    }}
    # Remove the VBS launcher that was used to start this script
    $vbsLauncher = Join-Path $InstallDir "launch-update-$($MyInvocation.MyCommand.Name -replace '\.ps1$','').vbs"
    if (Test-Path $vbsLauncher) {{
        Remove-Item -LiteralPath $vbsLauncher -Force -ErrorAction SilentlyContinue
        Log "Removed VBS launcher: $vbsLauncher"
    }}
}} catch {{
    Log "Cleanup warning: $_"
}}

Start-Sleep -Seconds 1
Log "Update complete."
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
"""

    script_path.write_text(script, encoding="utf-8-sig")  # BOM so PS 5.1 reads as UTF-8
    print(f"[WindowsUpdater] Wrote updater script: {script_path}")
    return script_path


def launch_detached_powershell(script_path: Path) -> None:
    """Start the updater script fully detached from the current process tree.

    Uses a VBScript launcher (WScript.Shell.Run) so the PowerShell process is
    created outside Tauri's Windows Job Object. A direct subprocess.Popen with
    CREATE_BREAKAWAY_FROM_JOB raises [WinError 5] when the Job does not permit
    breakaway; WScript.Shell.Run bypasses this restriction entirely.
    """
    if platform.system() != "Windows":
        raise OSError("Detached PowerShell updater is only supported on Windows")

    # Escape double-quotes inside the path for embedding in the VBScript string.
    ps_path_escaped = str(script_path).replace('"', '""')

    vbs_content = (
        'Set WShell = CreateObject("WScript.Shell")\r\n'
        f'WShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -NonInteractive'
        f' -WindowStyle Hidden -File ""{ps_path_escaped}""", 0, False\r\n'
        'Set WShell = Nothing\r\n'
    )
    vbs_path = script_path.parent / f"launch-update-{script_path.stem}.vbs"
    vbs_path.write_text(vbs_content, encoding="ascii")

    # wscript.exe /nologo runs the VBS silently and exits immediately.
    # The PowerShell process it spawns is independent of this process tree.
    subprocess.Popen(
        ["wscript.exe", "/nologo", str(vbs_path)],
        shell=False,
        close_fds=True,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,  # type: ignore[attr-defined]
    )
    print(f"[WindowsUpdater] Launched detached updater via VBS: {script_path}")



def prepare_windows_update(
    install_dir: Optional[str] = None,
    restart_exe: Optional[str] = None,
) -> dict[str, Any]:
    """
    Download update artifacts, write swap script, and launch it detached.

    Returns metadata for the API response. The caller should exit the app after this.
    """
    root = resolve_install_dir(install_dir)
    print(f"[WindowsUpdater] Install dir: {root}")

    manifest = fetch_releases_manifest_data()
    if not manifest:
        raise RuntimeError("Could not fetch releases.json from GCS")

    version = str(manifest.get("latest", "")).lstrip("v").strip()
    if not version:
        version = str(manifest.get("version", "")).strip().lstrip("v")
    if not version:
        raise RuntimeError("releases.json is missing a version")

    swap_plan = build_swap_plan(manifest, root)
    staging_dir = download_manifest_artifacts(manifest, root, version)
    restart_path = discover_restart_exe(root, restart_exe)
    script_path = write_powershell_updater(
        install_dir=root,
        staging_dir=staging_dir,
        version=version,
        swap_plan=swap_plan,
        restart_exe=restart_path,
    )
    launch_detached_powershell(script_path)

    return {
        "success": True,
        "message": "Update downloaded. The app will close and relaunch automatically.",
        "version": version,
        "requires_restart": True,
        "install_dir": str(root),
        "staging_dir": str(staging_dir),
        "updater_script": str(script_path),
        "restart_exe": str(restart_path) if restart_path else None,
        "components": list({item["component"] for item in swap_plan}),
    }
