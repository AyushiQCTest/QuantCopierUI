"""
Auto-update module for Python executables (QC-demo.exe and quant-copier-AP.exe)
Checks GCP bucket for updates on startup and auto-updates if newer version is available
"""

import os
import sys
import json
import shutil
import subprocess
import logging
from pathlib import Path
from typing import Optional, Tuple
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s][%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger("PythonAutoUpdater")


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
    - /v1.3.2/QC-demo.exe
    - /v1.3.2/quant-copier-AP.exe
    
    Args:
        exe_name: Name of executable (e.g., 'QC-demo.exe')
    
    Returns:
        Dict with update info or None if no update available
    """
    try:
        from google.cloud import storage
        
        logger.info(f"Checking GCP bucket for {exe_name}...")
        
        client = storage.Client()
        bucket = client.bucket("quantcopier-releases")
        
        # Get current version
        current_version = get_current_version()
        
        # List all blobs and find versions
        versions = {}
        blobs = client.list_blobs("quantcopier-releases")
        
        for blob in blobs:
            if exe_name in blob.name and '/v' in blob.name:
                parts = blob.name.split('/')
                if len(parts) >= 2 and parts[0].startswith('v'):
                    version_str = parts[0][1:]  # Remove 'v' prefix
                    try:
                        version_tuple = tuple(map(int, version_str.split('.')))
                        versions[version_tuple] = {
                            'version': version_str,
                            'blob_name': blob.name,
                            'size': blob.size,
                            'updated_time': blob.updated,
                        }
                    except (ValueError, AttributeError):
                        continue
        
        if not versions:
            logger.info(f"No versions found in GCP bucket for {exe_name}")
            return None
        
        # Get the highest version
        latest_version_tuple = max(versions.keys())
        latest_info = versions[latest_version_tuple]
        latest_version = latest_info['version']
        
        logger.info(f"Latest version in GCP: {latest_version}, Current: {current_version}")
        
        # Check if update is available
        if compare_versions(current_version, latest_version) < 0:
            logger.info(f"Update available: {current_version} -> {latest_version}")
            return latest_info
        else:
            logger.info(f"Already on latest version ({current_version})")
            return None
    
    except ImportError:
        logger.warning("google-cloud-storage not installed, skipping GCP check")
        return None
    except Exception as e:
        logger.error(f"Error checking GCP bucket: {e}")
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
        from google.cloud import storage
        
        logger.info(f"Downloading {blob_name}...")
        
        client = storage.Client()
        bucket = client.bucket("quantcopier-releases")
        blob = bucket.blob(blob_name)
        blob.download_to_filename(destination_path)
        
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
        exe_name: Name of executable to check for (e.g., 'QC-demo.exe')
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
        temp_exe_path = str(temp_dir / f"{exe_name}.new")
        
        if not download_update(update_info['blob_name'], temp_exe_path):
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
