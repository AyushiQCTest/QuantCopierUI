"use client";

import { useState, useEffect, useContext } from "react";
import { ThemeContext } from "@/lib/theme-config";
import { Info, ExternalLink, X, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autoUpdater, UpdateInfo } from "@/lib/auto-updater";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type UpdateStatus = "idle" | "checking" | "update-available" | "up-to-date" | "error";

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const { theme } = useContext(ThemeContext);
  const [version, setVersion] = useState("1.3.2");
  const [releaseNotesUrl, setReleaseNotesUrl] = useState(
    "https://releases.quanttradertools.com"
  );
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Try to fetch version from backend
    const fetchVersion = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/version");
        if (response.ok) {
          const data = await response.json();
          setVersion(data.version);
        }
      } catch (error) {
        console.error("Failed to fetch version:", error);
        // Use default version from VERSION file
        setVersion("1.3.2");
      }
    };

    fetchVersion();
  }, []);

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
      } else {
        setUpdateStatus("error");
        setErrorMessage("Failed to check for updates");
      }
    } catch (error) {
      setUpdateStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "An error occurred");
    }
  };

  const handleDownloadUpdate = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch("http://localhost:8000/api/download-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to download update");
      }

      const result = await response.json();
      if (result.success) {
        // Show restart prompt
        alert("Update downloaded successfully. Please restart the application.");
        // Restart the app
        window.location.reload();
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
          <div
            className={`p-2 rounded-lg ${
              theme === "dark" ? "bg-blue-900/30" : "bg-blue-50"
            }`}
          >
            <Info
              className={`w-6 h-6 ${
                theme === "dark" ? "text-blue-400" : "text-blue-600"
              }`}
            />
          </div>
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
                  "Download Update"
                )}
              </Button>
            </div>
          )}

          {/* Release Notes Link */}
          <div className="pt-4 border-t border-gray-700">
            <a
              href={releaseNotesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                theme === "dark"
                  ? "bg-blue-900/20 text-blue-400 hover:bg-blue-900/40"
                  : "bg-blue-50 text-blue-600 hover:bg-blue-100"
              }`}
            >
              <span>View Release Notes</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Footer */}
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
      </div>
    </div>
  );
}
