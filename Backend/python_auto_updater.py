"""
Auto-update module for Python executables (QuantCopierUI.exe and QuantCopierAPI.exe)
Checks GCP bucket for updates on startup and auto-updates if newer version is available
"""

import os
import sys
import json
import shutil
import subprocess
import logging
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Tuple
from datetime import datetime
# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s][%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger("PythonAutoUpdater")

from gcp_bucket_manager import (
    GCPBucketManager,
    fetch_releases_manifest_data,
    release_info_from_manifest,
    normalize_storage_bucket,
)

FIREBASE_BUCKET = normalize_storage_bucket(
    os.getenv('FIREBASE_STORAGE_BUCKET')
)


def _resolve_component_key(exe_name: str) -> Optional[str]:
    """Map an executable name to releases.json component key."""
    name = exe_name.lower()
    # API sidecar (e.g., QuantCopierAPI.exe)
    if 'quantcopierapi' in name or name.endswith('api.exe') or ('api' in name and 'quantcopier' in name):
        return 'apiSidecar'
    # QCDemo sidecar (e.g., QuantCopierTelegram.exe / qcdemo.exe)
    if ('quantcopiertelegram' in name and 'ui' not in name) or 'qc-demo' in name or 'qcdemo' in name:
        return 'qcdemoSidecar'
    # Main UI application (e.g., QuantCopierTelegramUI.exe, QuantCopierMT5.exe, QuantCopier.exe)
    if 'quantcopier' in name or 'ui' in name:
        return 'mainInstaller'
    return None


def get_current_version() -> str:
    """
    Get the current application version
    
    Looks for VERSION file in:
    1. Parent directory of script (e.g., ../VERSION)
    2. Current directory (./VERSION)
    3. Falls back to "1.0.0"
    
    Returns:
        Version string (e.g., "1.3.2")
    """
    possible_paths = [
        Path(__file__).parent.parent / "VERSION",
        Path(__file__).parent / "VERSION",
        Path.cwd() / "VERSION",
    ]
    
    for version_file in possible_paths:
        if version_file.exists():
            try:
                with open(version_file, 'r') as f:
                    return f.read().strip()
            except Exception as e:
                logger.warning(f"Failed to read VERSION file {version_file}: {e}")
    
    return "1.0.0"


def get_executable_name() -> str:
    """Get the name of the current executable"""
    if hasattr(sys, 'frozen'):
        return Path(sys.executable).name
    return Path(sys.argv[0]).name


def compare_versions(v1: str, v2: str) -> int:
    """
    Compare two version strings
    
    Args:
        v1: First version string (e.g., "1.3.2")
        v2: Second version string (e.g., "1.4.0")
    
    Returns:
        -1 if v1 < v2, 0 if equal, 1 if v1 > v2
    """
    try:
        v1_parts = tuple(map(int, v1.split('.')))
        v2_parts = tuple(map(int, v2.split('.')))
        
        if v1_parts < v2_parts:
            return -1
        elif v1_parts > v2_parts:
            return 1
        else:
            return 0
    except Exception:
        logger.error(f"Error comparing versions: {v1} vs {v2}")
        return 0


def check_gcp_bucket_for_update(exe_name: str) -> Optional[dict]:
    """
    Check GCP bucket for newer version of the executable
    
    Looks in bucket for patterns like:
    - /v1.3.2/QuantCopierUI.exe
    - /v1.3.2/QuantCopierAPI.exe

    Args:
        exe_name: Name of executable (e.g., 'QuantCopierUI.exe')
    
    Returns:
        Dict with update info or None if no update available
    """
    try:
        logger.info(f"Checking releases.json for {exe_name} (authenticated GCS)...")

        data = fetch_releases_manifest_data()
        if not data:
            logger.error('Failed to fetch releases.json from GCS')
            return None

        component_key = _resolve_component_key(exe_name) or 'mainInstaller'
        release_info = release_info_from_manifest(data, component_key=component_key)
        if not release_info:
            logger.warning('releases.json missing latest version')
            return None

        latest_version = release_info['version']
        current_version = get_current_version()
        if compare_versions(current_version, latest_version) >= 0:
            logger.info(f"Already on latest version ({current_version})")
            return None

        target_name = release_info.get('name') or exe_name
        logger.info(f"Update available: {current_version} -> {latest_version}")
        return {
            'version': latest_version,
            'download_url': release_info.get('download_url'),
            'blob_name': release_info.get('blob_name'),
            'target_name': target_name,
            'size': 0,
        }

    except Exception as e:
        logger.error(f"Error checking updates from releases.json: {e}")
        return None


def download_update(blob_name: str, destination_path: str) -> bool:
    """
    Download update file from GCP bucket
    
    Args:
        blob_name: Name of blob in GCS bucket
        destination_path: Local path to save file
    
    Returns:
        True if successful, False otherwise
    """
    try:
        logger.info(f"Downloading {blob_name}...")

        if blob_name.startswith("http://") or blob_name.startswith("https://"):
            urllib.request.urlretrieve(blob_name, destination_path)
            logger.info(f"Downloaded to {destination_path}")
            return True

        manager = GCPBucketManager(bucket_name=FIREBASE_BUCKET)
        if not manager.download_file(blob_name, destination_path):
            return False

        logger.info(f"Downloaded to {destination_path}")
        return True
    except Exception as e:
        logger.error(f"Error downloading update: {e}")
        return False


def apply_update(current_exe_path: str, new_exe_path: str, current_version: str, new_version: str) -> bool:
    """
    Apply the downloaded update
    
    Steps:
    1. Backup current executable
    2. Move new executable to current location
    3. Return True to indicate restart needed
    
    Args:
        current_exe_path: Path to current executable
        new_exe_path: Path to downloaded executable
        current_version: Current version string
        new_version: New version string
    
    Returns:
        True if update was applied (restart needed), False otherwise
    """
    try:
        current_path = Path(current_exe_path)
        new_path = Path(new_exe_path)
        
        if not current_path.exists():
            logger.error(f"Current executable not found: {current_exe_path}")
            return False
        
        if not new_path.exists():
            logger.error(f"New executable not found: {new_exe_path}")
            return False
        
        # Backup current executable
        backup_path = current_path.parent / f"{current_path.stem}-backup-{current_version}{current_path.suffix}"
        logger.info(f"Backing up current executable to {backup_path}")
        shutil.copy2(current_path, backup_path)
        
        # Wait a moment for file handles to close
        import time
        time.sleep(1)
        
        # Remove current executable
        current_path.unlink()
        
        # Move new executable to current location
        logger.info(f"Installing new version to {current_exe_path}")
        new_path.rename(current_path)
        
        logger.info(f"Update applied successfully: {current_version} -> {new_version}")
        return True
    
    except Exception as e:
        logger.error(f"Error applying update: {e}")
        return False


def check_and_update(exe_name: Optional[str] = None) -> bool:
    """
    Check for updates and apply them if available
    
    This function should be called at application startup
    
    Args:
        exe_name: Name of executable to check for (e.g., 'QuantCopierUI.exe')
                 If None, will use current executable name
    
    Returns:
        True if update was applied and restart is needed, False otherwise
    """
    try:
        if exe_name is None:
            exe_name = get_executable_name()
        
        logger.info(f"Starting auto-update check for {exe_name}...")
        
        current_version = get_current_version()
        
        # Check for update
        update_info = check_gcp_bucket_for_update(exe_name)
        
        if not update_info:
            logger.info("No update available")
            return False
        
        # Create temp directory for download
        temp_dir = Path.cwd() / ".update_temp"
        temp_dir.mkdir(exist_ok=True)
        
        # Download update
        new_version = update_info['version']
        target_name = update_info.get('target_name', exe_name)
        temp_exe_path = str(temp_dir / f"{Path(target_name).name}.new")
        
        download_source = update_info.get('blob_name') or update_info.get('download_url')
        if not download_source or not download_update(download_source, temp_exe_path):
            logger.error("Failed to download update")
            return False
        
        # Get current executable path
        if hasattr(sys, 'frozen'):
            current_exe_path = sys.executable
        else:
            current_exe_path = str(Path(sys.argv[0]).resolve())
        
        # Apply update
        if apply_update(current_exe_path, temp_exe_path, current_version, new_version):
            logger.info("Update applied, restart needed")
            
            # Clean up temp directory
            try:
                shutil.rmtree(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to clean up temp directory: {e}")
            
            return True
        else:
            logger.error("Failed to apply update")
            return False
    
    except Exception as e:
        logger.error(f"Unexpected error in check_and_update: {e}")
        return False


def restart_application(exe_name: Optional[str] = None):
    """
    Restart the application
    
    Args:
        exe_name: Name of executable to restart (if None, restarts current)
    """
    try:
        if exe_name is None:
            if hasattr(sys, 'frozen'):
                exe_path = sys.executable
            else:
                exe_path = str(Path(sys.argv[0]).resolve())
        else:
            exe_path = str(Path.cwd() / exe_name)
        
        logger.info(f"Restarting application: {exe_path}")
        
        # Detach from current process and start new one
        if sys.platform == 'win32':
            # Windows
            subprocess.Popen(exe_path, shell=False)
        else:
            # Unix-like
            os.execv(exe_path, [exe_path])
        
        sys.exit(0)
    
    except Exception as e:
        logger.error(f"Error restarting application: {e}")
        sys.exit(1)


# Convenience function for main usage
def auto_update_on_startup() -> bool:
    """
    Automatically check and update on startup
    If update is applied, this will restart the application
    
    Returns:
        True if restart was initiated, False otherwise
    """
    if check_and_update():
        logger.info("Restarting application with new version...")
        import time
        time.sleep(2)  # Give user a moment to see the message
        restart_application()
        return True
    return False


if __name__ == "__main__":
    # Can be run standalone for testing
    result = check_and_update()
    print(f"Update check result: {result}")
