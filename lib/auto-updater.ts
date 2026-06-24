/**
 * Auto-updater integration for Tauri
 * Handles checking and applying updates on application startup
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
}

class TauriAutoUpdater {
  private isCheckingForUpdates = false;

  /**
   * Initialize the auto-updater
   * Should be called once at app startup
   */
  async initialize(): Promise<void> {
    try {
      console.log('[AutoUpdater] Initializing...');

      // Listen for manual update checks
      await listen('check-for-updates', () => {
        this.checkForUpdates().catch((e) =>
          console.warn('[AutoUpdater] Background check-for-updates error:', e)
        );
      });

      // Check for updates on startup (non-blocking, errors are silently swallowed)
      setTimeout(() =>
        this.checkForUpdates().catch((e) =>
          console.warn('[AutoUpdater] Startup update check error:', e)
        ), 2000);

      console.log('[AutoUpdater] Initialized successfully');
    } catch (error) {
      console.error('[AutoUpdater] Initialization failed:', error);
    }
  }

  /**
   * Check for updates
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (this.isCheckingForUpdates) {
      console.log('[AutoUpdater] Already checking for updates');
      return null;
    }

    try {
      this.isCheckingForUpdates = true;
      console.log('[AutoUpdater] Checking for updates...');

      // Call the backend check endpoint
      const response = await fetch('http://localhost:8000/api/check-update', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Update check failed (HTTP ${response.status})${body ? ': ' + body.slice(0, 200) : ''}`);
      }

      const updateInfo: UpdateInfo = await response.json();

      // Surface any server-side error field
      if ((updateInfo as any).error) {
        throw new Error((updateInfo as any).error);
      }

      if (updateInfo.available) {
        console.log(
          `[AutoUpdater] Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`
        );
        // Emit update available event
        window.dispatchEvent(
          new CustomEvent('update-available', { detail: updateInfo })
        );
      } else {
        console.log('[AutoUpdater] Already on latest version');
      }

      return updateInfo;
    } catch (error) {
      console.error('[AutoUpdater] Check failed:', error);
      // Re-throw so callers (e.g. AboutModal) can surface the real message
      throw error;
    } finally {
      this.isCheckingForUpdates = false;
    }
  }

  /**
   * Apply update
   */
  async applyUpdate(): Promise<boolean> {
    try {
      console.log('[AutoUpdater] Applying update...');

      const response = await fetch('http://localhost:8000/api/apply-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        console.log('[AutoUpdater] Update applied successfully');
        // Restart the application after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 1000);
        return true;
      } else {
        throw new Error(result.message || 'Update failed');
      }
    } catch (error) {
      console.error('[AutoUpdater] Apply update failed:', error);
      return false;
    }
  }

  /**
   * Manual check trigger
   */
  async manualCheck(): Promise<UpdateInfo | null> {
    return this.checkForUpdates();
  }
}

// Create singleton instance
const autoUpdater = new TauriAutoUpdater();

// Export for use in app
export { autoUpdater };
export type { UpdateInfo };
