"""
Integration Guide: Adding Auto-Update to Python Executables

This file shows how to integrate the python_auto_updater module into
QuantCopierTelegram.py and other Python executables.
"""

# ============================================================================
# BEFORE: Original application startup
# ============================================================================

"""
# Original QuantCopierTelegram.py
import asyncio
from QuantCopierTelegram import start_telegram_copier

async def main():
    # Application logic here
    await start_telegram_copier()

if __name__ == "__main__":
    asyncio.run(main())
"""

# ============================================================================
# AFTER: With auto-update integration
# ============================================================================

"""
# Updated QuantCopierTelegram.py with auto-update

import asyncio
import logging
from python_auto_updater import auto_update_on_startup
from QuantCopierTelegram import start_telegram_copier

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(name)s - %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    # APPLICATION STARTUP SEQUENCE
    
    # Step 1: Check for updates (runs at startup)
    logger.info("Checking for application updates...")
    update_applied = auto_update_on_startup()
    
    if update_applied:
        # This function will not return if update was applied
        # (application restarts automatically)
        logger.info("Update applied, application restarted")
        return
    
    logger.info("No updates available, starting application")
    
    # Step 2: Continue with normal application startup
    await start_telegram_copier()


if __name__ == "__main__":
    asyncio.run(main())
"""

# ============================================================================
# DETAILED INTEGRATION STEPS
# ============================================================================

"""
1. Import the auto-updater module:
   ────────────────────────────────
   from python_auto_updater import auto_update_on_startup


2. Call at the beginning of your main() function:
   ────────────────────────────────────────────────
   async def main():
       auto_update_on_startup()  # This blocks if update is available
       
       # Rest of your application code here


3. Optional: Check update status before proceeding:
   ─────────────────────────────────────────────────
   from python_auto_updater import check_and_update
   
   async def main():
       update_needed = check_and_update()
       
       if update_needed:
           logger.info("Update applied, restarting application")
           return  # Function will restart, this won't execute
       
       # Application logic here


4. For graceful shutdown during updates:
   ──────────────────────────────────────
   import signal
   
   def signal_handler(sig, frame):
       logger.info("Shutdown signal received")
       # Cleanup code here
       sys.exit(0)
   
   if __name__ == "__main__":
       signal.signal(signal.SIGINT, signal_handler)
       signal.signal(signal.SIGTERM, signal_handler)
       asyncio.run(main())
"""

# ============================================================================
# EXAMPLE: Full Integration for qcdemo
# ============================================================================

"""
# qcdemo/QuantCopierTelegram.py

import asyncio
import sys
import logging
from pathlib import Path

# Import auto-updater
from python_auto_updater import auto_update_on_startup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s][QuantCopierTelegram] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    '''Main application entry point'''
    
    # STEP 1: Check for and apply updates
    logger.info("QuantCopier Telegram - Starting...")
    logger.info("Checking for application updates...")
    
    try:
        # This will return True if update was applied and app restarted
        # Otherwise, returns False and continues
        auto_update_on_startup()
        logger.info("Application is up to date")
    except Exception as e:
        logger.error(f"Error checking for updates: {e}")
        # Continue anyway if update check fails
    
    # STEP 2: Rest of application startup
    logger.info("Initializing QuantCopier Telegram...")
    
    # Your existing initialization code here
    # ...
    
    logger.info("QuantCopier Telegram started successfully")
    
    # Your existing application logic
    # await your_actual_app_logic()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Application interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
"""

# ============================================================================
# ENVIRONMENT VARIABLES & CONFIGURATION
# ============================================================================

"""
The auto-updater uses the following environment variables (optional):

QUANT_COPIER_UPDATE_CHECK_ENABLED
  - Default: True
  - Set to "false" to disable auto-update checking
  
QUANT_COPIER_UPDATE_DEBUG
  - Default: False
  - Set to "true" for verbose logging
  
Example:
  export QUANT_COPIER_UPDATE_DEBUG=true
  python QuantCopierTelegram.py
"""

# ============================================================================
# API REFERENCE
# ============================================================================

"""
Module: python_auto_updater

Main Functions:
──────────────

1. auto_update_on_startup() -> bool
   ────────────────────────────────
   Called at application startup to check and apply updates.
   - Returns: True if update was applied (app will restart)
   - Returns: False if no update or update not applicable
   - This is the recommended way to integrate auto-update
   - Handles errors gracefully

   Usage:
     from python_auto_updater import auto_update_on_startup
     
     if auto_update_on_startup():
         return  # App will restart automatically
     
     # Continue with normal startup
     main_application_logic()


2. check_and_update() -> bool
   ────────────────────────
   Check for updates and apply if available.
   - More granular control than auto_update_on_startup()
   - Returns: True if update applied and restart initiated
   - Returns: False if no update available
   
   Usage:
     from python_auto_updater import check_and_update
     
     if check_and_update():
         print("Update applied, restarting...")
         return
     
     print("No updates available")


3. check_gcp_bucket_for_update(exe_name: str) -> Optional[dict]
   ──────────────────────────────────────────────────────────────
   Check GCP bucket for available updates without applying.
  - Args: exe_name (e.g., "QuantCopierUI.exe")
   - Returns: Dict with update info or None if no update
   
   Usage:
     from python_auto_updater import check_gcp_bucket_for_update
     
    update_info = check_gcp_bucket_for_update("QuantCopierUI.exe")
     if update_info:
         print(f"Update available: {update_info['version']}")
     else:
         print("No updates available")


4. compare_versions(v1: str, v2: str) -> int
   ──────────────────────────────────────────
   Compare two version strings.
   - Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   
   Usage:
     from python_auto_updater import compare_versions
     
     result = compare_versions("1.3.1", "1.3.2")
     # result = -1 (1.3.1 is older)
"""

# ============================================================================
# TESTING & DEBUGGING
# ============================================================================

"""
Test the auto-updater without deploying:
─────────────────────────────────────────

1. Check current version:
   python -c "from python_auto_updater import get_current_version; print(get_current_version())"

2. Check for updates (dry run):
   python python_auto_updater.py

3. With debug logging:
   export QUANT_COPIER_UPDATE_DEBUG=true
   python python_auto_updater.py

4. Verify GCP bucket connection:
  python -c "from python_auto_updater import check_gcp_bucket_for_update; 
          update = check_gcp_bucket_for_update('QuantCopierUI.exe'); 
          print(update)"

5. Test version comparison:
   python -c "from python_auto_updater import compare_versions; 
              print(compare_versions('1.3.1', '1.3.2'))"
"""

# ============================================================================
# TROUBLESHOOTING
# ============================================================================

"""
Issue: "ModuleNotFoundError: No module named 'google.cloud'"
Solution: Install google-cloud-storage
  pip install google-cloud-storage

Issue: "Failed to initialize GCS client"
Solution: 
  1. Verify GCP credentials: gcloud auth list
  2. Check service account permissions
  3. Verify bucket name is correct

Issue: "No versions found in GCP bucket"
Solution:
  1. Verify files are in gs://quantcopier-releases/v1.3.2/ format
  2. Check bucket exists: gsutil ls gs://quantcopier-releases/
  3. Verify authentication can read bucket

Issue: "Update applied but app didn't restart"
Solution:
  1. Check file permissions on executable
  2. Verify backup was created
  3. Check logs for error messages
  4. Ensure no other processes have file lock

Issue: "Version file not found"
Solution:
  1. Create VERSION file in same directory as script
  2. Or in parent directory
  3. Or in current working directory
"""

# ============================================================================
# DEPLOYMENT NOTES
# ============================================================================

"""
When deploying with auto-update:

1. Ensure VERSION file exists in repository
2. Add google-cloud-storage to requirements.txt
3. Set up GCP credentials (Workload Identity or service account key)
4. Test on development system first
5. Monitor first few releases for issues
6. Have rollback plan (keep previous executable backups)

PyInstaller/py2exe Considerations:
  - Auto-updater uses sys.executable and sys.frozen to detect executable path
  - Works correctly when compiled to .exe
  - Backup is created as {name}-backup-{version}.exe
  - Always test update flow with compiled executable, not .py

The auto-updater is production-ready and handles errors gracefully.
Failed updates do not prevent application from running.
"""
