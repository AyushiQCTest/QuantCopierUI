"use client";

import { useState, useEffect, useContext, useRef } from "react";
import { ThemeContext } from "@/lib/theme-config";
import { Info, X, Loader2, Check, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autoUpdater, UpdateInfo } from "@/lib/auto-updater";
import { exit } from "@tauri-apps/plugin-process";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type UpdateStatus = "idle" | "checking" | "update-available" | "up-to-date" | "error" | "downloaded";

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const { theme } = useContext(ThemeContext);
  const [version, setVersion] = useState("1.3.5");
  const [releaseNotesUrl, setReleaseNotesUrl] = useState(
    "https://quant-copier-release-notes.vercel.app/"
  );
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(5);
  const [isExiting, setIsExiting] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Re-fetch every time the modal opens so the version is always current
    const fetchVersion = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/version");
        if (response.ok) {
          const data = await response.json();
          setVersion(data.version);
        }
      } catch (error) {
        console.error("Failed to fetch version:", error);
      }
    };

    fetchVersion();
  }, [isOpen]);

  const handleCheckForUpdates = async () => {
    setUpdateStatus("checking");
    setErrorMessage("");
    try {
      const info = await autoUpdater.manualCheck();
      if (info) {
        setUpdateInfo(info);
        if (info.available) {
          setUpdateStatus("update-available");
        } else {
          setUpdateStatus("up-to-date");
        }
        // Open release notes after a short delay
        setTimeout(() => {
          window.open(releaseNotesUrl, "_blank");
        }, 500);
      } else {
        // manualCheck returned null only when already in-progress
        setUpdateStatus("error");
        setErrorMessage("Update check already in progress, please wait.");
      }
    } catch (error) {
      setUpdateStatus("error");
      const msg = error instanceof Error ? error.message : String(error);
      // Friendly message for common network failures
      if (msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setErrorMessage("Cannot reach update server. Make sure the backend is running.");
      } else {
        setErrorMessage(msg || "An error occurred while checking for updates.");
      }
    }
  };

  const handleVisitReleaseNotes = () => {
    window.open(releaseNotesUrl, "_blank");
  };

  const handleDownloadUpdate = async () => {
    setIsDownloading(true);
    try {
      let installDir: string | undefined;
      try {
        installDir = await invoke<string>("get_install_dir");
      } catch (error) {
        console.warn("[AboutModal] Could not resolve install dir from Tauri:", error);
      }

      const response = await fetch("http://localhost:8000/api/download-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          install_dir: installDir,
          restart_exe: "QuantCopierMT5.exe", // Prefer main installer for relaunch
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to download update");
      }

      const result = await response.json();
      if (result.success) {
        // Switch to countdown state — the detached PowerShell script is already running.
        // It will wait 4 s, kill all QuantCopier processes, swap the binaries, and
        // relaunch the app. We call exit(0) here so the app closes cleanly.
        setUpdateStatus("downloaded");
        setCountdown(5);

        // Start countdown then exit
        let remaining = 5;
        countdownRef.current = setInterval(() => {
          remaining -= 1;
          setCountdown(remaining);
          if (remaining <= 0) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            doExit();
          }
        }, 1000);
      } else {
        throw new Error(result.message || "Update failed");
      }
    } catch (error) {
      setUpdateStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to download update");
    } finally {
      setIsDownloading(false);
    }
  };

  const doExit = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setIsExiting(true);

    // Primary: close the Tauri window (works in dev mode and production)
    getCurrentWindow()
      .close()
      .catch(() => {
        // Secondary: request process exit via plugin
        exit(0).catch(() => {
          // Last resort: native window.close (no-op in Tauri but harmless)
          window.close();
        });
      });

    // Nuclear fallback — if the window is still alive after 3 s, force exit
    setTimeout(() => {
      exit(0).catch(() => window.close());
    }, 3000);
  };

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center">
      <div
        className={`${
          theme === "dark"
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-200"
        } border rounded-lg shadow-lg max-w-md w-full mx-4 p-6 relative`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-1 rounded-full transition-colors ${
            theme === "dark"
              ? "hover:bg-gray-800 text-gray-400 hover:text-gray-200"
              : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <h2
            className={`text-xl font-semibold ${
              theme === "dark" ? "text-white" : "text-gray-900"
            }`}
          >
            About QuantCopier
          </h2>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Version */}
          <div>
            <p
              className={`text-sm ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Version
            </p>
            <p
              className={`text-lg font-mono font-semibold ${
                theme === "dark" ? "text-gray-200" : "text-gray-900"
              }`}
            >
              {version}
            </p>
          </div>

          {/* Description */}
          <div>
            <p
              className={`text-sm leading-relaxed ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              QuantCopier MT5 Telegram is a powerful tool for copying trades
              from Telegram alerts to your MetaTrader 5 accounts.
            </p>
          </div>

          {/* Update Status Messages */}
          {updateStatus === "checking" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Checking for updates...</span>
            </div>
          )}
          {updateStatus === "up-to-date" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
              <Check className="w-4 h-4" />
              <span className="text-sm">You're on the latest version</span>
            </div>
          )}
          {updateStatus === "update-available" && updateInfo && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">Update available: v{updateInfo.latestVersion}</span>
            </div>
          )}
          {updateStatus === "downloaded" && (
            <div className="flex flex-col gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm font-semibold">
                  {isExiting
                    ? "Closing app…"
                    : `Update downloaded — closing in ${countdown}s`}
                </span>
              </div>
              <p className="text-xs opacity-80">
                The updater will replace files and relaunch the app automatically.
              </p>
            </div>
          )}
          {updateStatus === "error" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{errorMessage}</span>
            </div>
          )}

          {/* Check for Updates Button */}
          <div className="pt-2">
            <Button
              onClick={handleCheckForUpdates}
              disabled={updateStatus === "checking" || isDownloading}
              className={`w-full ${
                theme === "dark"
                  ? "bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600"
                  : "bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
              } text-white`}
            >
              {updateStatus === "checking" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                "Check for Updates"
              )}
            </Button>
          </div>

          {/* Visit Release Notes Link */}
          <div className="pt-4 text-center">
            <button
              onClick={handleVisitReleaseNotes}
              className={`text-sm underline transition-colors ${
                theme === "dark"
                  ? "text-blue-400 hover:text-blue-300"
                  : "text-blue-600 hover:text-blue-700"
              }`}
            >
              Visit Release Notes
            </button>
          </div>

          {/* Download Update Button */}
          {updateStatus === "update-available" && (
            <div>
              <Button
                onClick={handleDownloadUpdate}
                disabled={isDownloading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  "Download & Install Update"
                )}
              </Button>
            </div>
          )}

          {/* Exit Now button during countdown */}
          {updateStatus === "downloaded" && (
            <div>
              <Button
                onClick={doExit}
                disabled={isExiting}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-70 disabled:cursor-not-allowed text-white"
              >
                {isExiting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Closing...
                  </>
                ) : (
                  `Close Now${countdown > 0 ? ` (${countdown}s)` : ""}`
                )}
              </Button>
            </div>
          )}


        </div>

        {/* Footer */}
        {updateStatus !== "downloaded" && (
          <div className="flex justify-end gap-2 mt-6">
            <Button
              onClick={onClose}
              variant="default"
              className={`${
                theme === "dark"
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
