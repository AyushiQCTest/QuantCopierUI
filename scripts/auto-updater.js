#!/usr/bin/env node
/**
 * Auto-update script for QuantCopier UI (Next.js)
 * Checks GitHub for newer versions and auto-updates the application
 * 
 * Usage:
 *   - Call from app startup to check for updates
 *   - For Tauri: Call from rust or frontend before app loads
 *   - For Next.js dev: Run as post-build script
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { spawn } from 'child_process';
import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream';

interface ReleaseInfo {
  version: string;
  name: string;
  download_url: string;
  size: number;
  published_at: string;
}

interface UpdateConfig {
  currentVersion: string;
  lastCheck: number;
  lastCheckVersion: string;
}

const logger = {
  info: (msg: string) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
};

class UIAutoUpdater {
  private readonly GITHUB_REPO = 'AyushiQCTest/QuantCopierUI';
  private readonly GITHUB_API_RELEASES = `https://api.github.com/repos/${this.GITHUB_REPO}/releases`;
  private readonly RELEASE_ASSET_FILTER = (name: string) =>
    name.endsWith('.tar.gz') || name.endsWith('.zip');
  
  private readonly CHECK_INTERVAL_DAYS = 7;
  
  private appDir: string;
  private configDir: string;
  private configFile: string;
  private versionFile: string;

  constructor(appDir?: string) {
    this.appDir = appDir || process.cwd();
    this.configDir = path.join(this.appDir, '.update-config-ui');
    this.configFile = path.join(this.configDir, 'update.json');
    this.versionFile = path.join(this.appDir, 'VERSION');
    
    try {
      mkdirSync(this.configDir, { recursive: true });
    } catch (e) {
      // Directory might exist
    }
  }

  /**
   * Get current version from package.json or VERSION file
   */
  private getCurrentVersion(): string {
    try {
      // Try VERSION file first (matches backend)
      if (fs.existsSync(this.versionFile)) {
        return fs.readFileSync(this.versionFile, 'utf-8').trim();
      }
      
      // Fallback to package.json
      const packageJsonPath = path.join(this.appDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return pkg.version || '1.0.0';
      }
    } catch (e) {
      logger.warn(`Could not read version: ${e}`);
    }
    
    return '1.3.2'; // Fallback version
  }

  /**
   * Fetch latest release information from GitHub
   */
  async fetchLatestReleaseInfo(): Promise<ReleaseInfo | null> {
    return new Promise((resolve) => {
      logger.info('Checking for updates from GitHub...');

      https.get(
        this.GITHUB_API_RELEASES,
        {
          headers: {
            'User-Agent': 'QuantCopier-UIAutoUpdater/1.0',
            'Accept': 'application/vnd.github.v3+json',
          },
          timeout: 10000,
        },
        (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const releases = JSON.parse(data);

              if (!Array.isArray(releases) || releases.length === 0) {
                logger.info('No releases found');
                resolve(null);
                return;
              }

              // Find the latest non-prerelease release with suitable asset
              for (const release of releases) {
                if (release.prerelease) continue;

                const tagName = (release.tag_name as string).replace(/^v/, '');
                
                // Find a suitable asset (tar.gz or zip)
                for (const asset of release.assets || []) {
                  if (this.RELEASE_ASSET_FILTER(asset.name)) {
                    resolve({
                      version: tagName,
                      name: asset.name,
                      download_url: asset.browser_download_url,
                      size: asset.size,
                      published_at: release.published_at,
                    });
                    return;
                  }
                }
              }

              logger.info('No suitable release found');
              resolve(null);
            } catch (e) {
              logger.error(`Failed to parse release info: ${e}`);
              resolve(null);
            }
          });
        }
      ).on('error', (e) => {
        logger.warn(`Failed to fetch release info: ${e}`);
        resolve(null);
      });
    });
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    
    return 0;
  }

  /**
   * Check if an update is needed
   */
  private shouldUpdate(latestVersion: string): boolean {
    const current = this.getCurrentVersion();
    const comparison = this.compareVersions(latestVersion, current);
    
    if (comparison <= 0) {
      logger.info(`Already on latest or newer version (${current})`);
      return false;
    }
    
    logger.info(`Update available: ${current} → ${latestVersion}`);
    return true;
  }

  /**
   * Download a file with progress reporting
   */
  private downloadFile(url: string, destPath: string, expectedSize: number = 0): Promise<boolean> {
    return new Promise((resolve) => {
      logger.info(`Downloading from ${url}...`);

      const file = createWriteStream(destPath);
      let downloadedSize = 0;

      https.get(url, { timeout: 60000 }, (res) => {
        const totalSize = expectedSize || parseInt(res.headers['content-length'] || '0', 10);

        res.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const percent = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
          logger.info(`Progress: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB)`);
        });

        pipeline(res, file, (err) => {
          if (err) {
            logger.error(`Download failed: ${err}`);
            resolve(false);
            return;
          }

          // Validate size
          if (expectedSize > 0 && downloadedSize !== expectedSize) {
            logger.warn(`Size mismatch: expected ${expectedSize}, got ${downloadedSize}`);
          }

          logger.info(`Downloaded to ${destPath}`);
          resolve(true);
        });
      }).on('error', (e) => {
        logger.error(`Download error: ${e}`);
        resolve(false);
      });
    });
  }

  /**
   * Extract tar.gz file
   */
  private async extractTarGz(filePath: string, destDir: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const tar = spawn('tar', ['-xzf', filePath, '-C', destDir]);

        tar.on('close', (code) => {
          if (code === 0) {
            logger.info(`Extracted ${filePath} to ${destDir}`);
            resolve(true);
          } else {
            logger.error(`Tar extraction failed with code ${code}`);
            resolve(false);
          }
        });

        tar.on('error', (e) => {
          logger.error(`Tar extraction error: ${e}`);
          resolve(false);
        });
      } catch (e) {
        logger.error(`Failed to spawn tar: ${e}`);
        resolve(false);
      }
    });
  }

  /**
   * Extract zip file (Windows)
   */
  private async extractZip(filePath: string, destDir: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Use built-in unzip or PowerShell on Windows
        const isWindows = process.platform === 'win32';
        
        if (isWindows) {
          const ps = spawn('powershell', [
            '-NoProfile',
            '-Command',
            `Expand-Archive -Path '${filePath}' -DestinationPath '${destDir}' -Force`,
          ]);

          ps.on('close', (code) => {
            if (code === 0) {
              logger.info(`Extracted ${filePath} to ${destDir}`);
              resolve(true);
            } else {
              logger.error(`PowerShell extraction failed with code ${code}`);
              resolve(false);
            }
          });

          ps.on('error', (e) => {
            logger.error(`PowerShell extraction error: ${e}`);
            resolve(false);
          });
        } else {
          // Use unzip on Unix
          const unzip = spawn('unzip', ['-o', filePath, '-d', destDir]);

          unzip.on('close', (code) => {
            if (code === 0) {
              logger.info(`Extracted ${filePath} to ${destDir}`);
              resolve(true);
            } else {
              logger.error(`Unzip failed with code ${code}`);
              resolve(false);
            }
          });

          unzip.on('error', (e) => {
            logger.error(`Unzip error: ${e}`);
            resolve(false);
          });
        }
      } catch (e) {
        logger.error(`Failed to extract: ${e}`);
        resolve(false);
      }
    });
  }

  /**
   * Backup current version
   */
  private backupCurrentVersion(): string {
    try {
      const backupDir = path.join(this.configDir, 'backups');
      mkdirSync(backupDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
      
      const backup = {
        version: this.getCurrentVersion(),
        timestamp: new Date().toISOString(),
        appDir: this.appDir,
      };
      
      fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
      logger.info(`Backed up version info to ${backupFile}`);
      
      return backupFile;
    } catch (e) {
      logger.warn(`Failed to create backup: ${e}`);
      return '';
    }
  }

  /**
   * Save update configuration
   */
  private saveUpdateConfig(version: string): void {
    try {
      const config: UpdateConfig = {
        currentVersion: version,
        lastCheck: Date.now(),
        lastCheckVersion: version,
      };
      
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      logger.info('Update config saved');
    } catch (e) {
      logger.warn(`Failed to save config: ${e}`);
    }
  }

  /**
   * Load update configuration
   */
  private loadUpdateConfig(): UpdateConfig {
    try {
      if (fs.existsSync(this.configFile)) {
        return JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
      }
    } catch (e) {
      logger.warn(`Failed to load config: ${e}`);
    }
    
    return {
      currentVersion: this.getCurrentVersion(),
      lastCheck: 0,
      lastCheckVersion: '',
    };
  }

  /**
   * Check if we should skip the update check
   */
  private shouldSkipCheck(): boolean {
    try {
      const config = this.loadUpdateConfig();
      const now = Date.now();
      const daysPassed = (now - config.lastCheck) / (24 * 60 * 60 * 1000);
      
      return daysPassed < this.CHECK_INTERVAL_DAYS;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get temporary directory for downloads
   */
  private getTempDir(): string {
    const tmpDir = path.join(this.configDir, 'tmp');
    mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }

  /**
   * Clean up temporary directory
   */
  private cleanupTempDir(tmpDir: string): void {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        logger.info('Cleaned up temporary directory');
      }
    } catch (e) {
      logger.warn(`Failed to cleanup temp dir: ${e}`);
    }
  }

  /**
   * Notify the application about the update (for Tauri)
   */
  private async notifyTauriAboutUpdate(): Promise<void> {
    try {
      // This would be called via IPC in Tauri
      // For now, just log the intention
      logger.info('Tauri notification would be sent here');
      
      // In a real implementation:
      // - Save a flag file
      // - Tauri reads this flag on startup
      // - Triggers UI update/reload
    } catch (e) {
      logger.warn(`Failed to notify Tauri: ${e}`);
    }
  }

  /**
   * Check for updates and perform the update
   */
  async checkAndUpdate(force: boolean = false): Promise<boolean> {
    logger.info('=== Auto-Update Check Started ===');

    try {
      // Check if we should skip
      if (!force && this.shouldSkipCheck()) {
        logger.info('Skipping check (within check interval)');
        return false;
      }

      // Fetch latest release
      const latestInfo = await this.fetchLatestReleaseInfo();
      if (!latestInfo) {
        logger.info('Could not fetch release information');
        this.saveUpdateConfig(this.getCurrentVersion());
        return false;
      }

      logger.info(`Latest version available: ${latestInfo.version}`);

      // Check if update needed
      if (!this.shouldUpdate(latestInfo.version)) {
        this.saveUpdateConfig(this.getCurrentVersion());
        return false;
      }

      // Create backup
      this.backupCurrentVersion();

      // Download the new version
      const tmpDir = this.getTempDir();
      const downloadPath = path.join(tmpDir, latestInfo.name);

      if (!await this.downloadFile(latestInfo.download_url, downloadPath, latestInfo.size)) {
        logger.error('Failed to download update');
        this.cleanupTempDir(tmpDir);
        return false;
      }

      // Extract the archive
      const extractDir = path.join(tmpDir, 'extracted');
      mkdirSync(extractDir, { recursive: true });

      const isZip = latestInfo.name.endsWith('.zip');
      const extracted = isZip
        ? await this.extractZip(downloadPath, extractDir)
        : await this.extractTarGz(downloadPath, extractDir);

      if (!extracted) {
        logger.error('Failed to extract update');
        this.cleanupTempDir(tmpDir);
        return false;
      }

      // For Next.js app, the extracted files would need to be deployed
      // This depends on your deployment strategy (Tauri, standalone, etc.)
      logger.info('✓ Update prepared successfully');
      logger.info('Note: Application restart may be required');

      // Save update config
      this.saveUpdateConfig(latestInfo.version);

      // Notify Tauri if running in that context
      await this.notifyTauriAboutUpdate();

      logger.info('=== Auto-Update Check Completed ===');

      // Clean up temp dir after a delay
      setTimeout(() => this.cleanupTempDir(tmpDir), 5000);

      return true;
    } catch (e) {
      logger.error(`Update check failed: ${e}`);
      return false;
    }
  }

  /**
   * Check only (don't update)
   */
  async checkOnly(): Promise<ReleaseInfo | null> {
    logger.info('Checking for updates...');
    return this.fetchLatestReleaseInfo();
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    appDir: undefined as string | undefined,
    force: false,
    checkOnly: false,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--app-dir' && args[i + 1]) {
      options.appDir = args[++i];
    } else if (args[i] === '--force') {
      options.force = true;
    } else if (args[i] === '--check-only') {
      options.checkOnly = true;
    }
  }

  const updater = new UIAutoUpdater(options.appDir);

  if (options.checkOnly) {
    const info = await updater.checkOnly();
    if (info) {
      logger.info(`Update available: ${info.version}`);
      logger.info(`Download URL: ${info.download_url}`);
    } else {
      logger.info('No updates available');
    }
  } else {
    const success = await updater.checkAndUpdate(options.force);
    process.exit(success ? 0 : 1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((e) => {
    logger.error(`Fatal error: ${e}`);
    process.exit(1);
  });
}

export { UIAutoUpdater };
