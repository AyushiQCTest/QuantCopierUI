"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useContext, useState, useEffect } from "react";
import { ThemeContext } from "@/lib/theme-config";
import { Tooltip } from "@/components/ui/tooltip";
import React from "react";
import { FaDiscord } from "react-icons/fa";
import { useBackendData } from "@/src/context/BackendDataContext";
import { useToast } from "@/hooks/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ToastAction } from "@/components/ui/toast";

interface SidebarProps {
  expanded: boolean;
  onClose: () => void;
  currentStep?: string | null;
}


/*Closes any existing QuantCopierDiscord processes*/
async function closeQuantCopierDiscord() {
  try {
    console.log("Closing existing QuantCopierDiscord");
    const response = await fetch('http://127.0.0.1:8000/kill-discord-copier', {
      method: 'POST',
    });
    const data = await response.json();
    if (data.status === 'success') {
      console.log('Process output:', {
        stdout: data.stdout,
        stderr: data.stderr,
        returncode: data.returncode
      });
    } else {
      console.error('Failed to kill process:', data.message || 'Unknown error');
    }
  } catch (err) {
    console.error('Error while trying to close QuantCopierDiscord:', err);
  }
  // We don't throw here since this is a cleanup operation
}



export default function Sidebar({ expanded, onClose, currentStep }: SidebarProps) {
  const router = useRouter();
  const { toast, dismiss } = useToast();
  const { theme } = useContext(ThemeContext);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const { operationalSettings, fetchOperationalSettings } = useBackendData();


  // Load operational settings when component mounts
  useEffect(() => {
    fetchOperationalSettings();
  }, [fetchOperationalSettings]);

  const homeItem = {
    label: "Home",
    icon: (
      <Image
        src="/Home.svg"
        alt="Home"
        width={24}
        height={24}
        className="w-6 h-6"
      />
    ),
    route: "/home",
    step: "home",
  };

  const items = [
    {
      label: "MT5 Account Setup",
      icon: (
        <Image
          src="/MetaTrader5.png"
          alt="MT5"
          width={24}
          height={24}
          className="w-6 h-6"
        />
      ),
      step: "mt5-setup",
    },
    {
      label: "Discord Token",
      icon: (
        <FaDiscord
          className={`w-6 h-6 ${currentStep === "discord-token" || hoveredItem === "discord-token"
            ? theme === "dark"
              ? "text-white"
              : "text-blue-600"
            : theme === "dark"
              ? "text-gray-400"
              : "text-gray-500"
            }`}
        />
      ),
      step: "discord-token",
    },
    {
      label: "Select Channels",
      icon: (
        <Image
          src={"/OmniChannel.svg"}
          alt="Channels"
          width={24}
          height={24}
          className="w-6 h-6"
          style={{
            filter:
              currentStep === "channel-select" || hoveredItem === "channel-select"
                ? "none"
                : theme === "dark"
                  ? "grayscale(100%) brightness(200%)"
                  : "grayscale(100%) contrast(150%) brightness(50%)",
          }}
        />
      ),
      step: "channel-select",
    },
    {
      label: "Alerts & Notifications",
      icon: (
        <Image
          src="/Alert.svg"
          alt="Alerts"
          width={24}
          height={24}
          className="w-6 h-6"
          style={{
            filter:
              currentStep === "notification-setup" || hoveredItem === "notification-setup"
                ? "none"
                : theme === "dark"
                  ? "grayscale(100%) brightness(200%)"
                  : "grayscale(100%) contrast(150%) brightness(50%)",
          }}
        />
      ),
      step: "notification-setup",
    },
    {
      label: "Operational Settings",
      icon: (
        <Image
          src={theme === "dark" ? "/SettingsDark.svg" : "/SettingsLight.svg"}
          alt="Settings"
          width={24}
          height={24}
          className="w-6 h-6"
        />
      ),
      step: "settings",
    },
    {
      label: "Symbol Mapper",
      icon: (
        <Image
          src="/SymbolMapper.svg"
          alt="Symbol Mapper"
          width={24}
          height={24}
          className="w-6 h-6"
          style={{
            filter:
              currentStep === "symbol-mapper" || hoveredItem === "symbol-mapper"
                ? "none"
                : theme === "dark"
                  ? "grayscale(100%) brightness(200%)"
                  : "grayscale(100%) contrast(150%) brightness(50%)",
          }}
        />
      ),
      step: "symbol-mapper",
      route: "/onboarding?step=symbol-mapper"
    },
  ];

  const launchItem = {
    label: "Launch",
    icon: (
      <Image
        src="/Launch.svg"
        alt="Launch"
        width={24}
        height={24}
        className="w-6 h-6"
      />
    ),
    step: "launch",
  };

  const getThemeStyles = () => ({
    container: theme === "dark" ? "bg-black border-gray-800" : "bg-white border-gray-200",
    divider: theme === "dark" ? "border-gray-800" : "border-gray-500",
    text: theme === "dark" ? "text-white hover:text-blue-500" : "text-gray-800 hover:text-blue-600",
    activeText: theme === "dark" ? "text-blue-500" : "text-blue-600",
    activeBg: theme === "dark" ? "bg-[#3B82F6]" : "bg-[#93C5FD]",
  });

  const styles = getThemeStyles();

  const getIconStyles = (step: string | null) => {
    // Special case for the home icon:
    if (step === "home") {
      const isActive =
        currentStep === null || currentStep === "home" || hoveredItem === "home";
      return isActive ? { filter: "none" } : { filter: "grayscale(100%)" };
    }

    // Skip style application for discord icons
    if (step === "channel-select" || step === "discord-token") {
      return {};
    }

    // Existing logic for other items:
    const isActive = currentStep === step || hoveredItem === step;
    const defaultStyle = { filter: "grayscale(100%)" };
    const activeStyle = { filter: "none" };

    if (step === "settings" || step === "mt5-setup") {
      return isActive ? activeStyle : defaultStyle;
    } else if (step === "notification-setup" || step === "symbol-mapper") {
      return {}; // Icon styles applied directly in the icon prop
    } else if (step === "launch") {
      return isActive ? { filter: "none" } : { filter: "grayscale(100%)" };
    }
    return defaultStyle;
  };

  const renderIcon = (icon: JSX.Element, step: string | null) => {
    if (step === "channel-select" || step === "discord-token") {
      return icon; // Return discord icons as is since styles are handled via className
    }
    const styles = getIconStyles(step);
    if (step === "notification-setup" || step === "symbol-mapper") {
      return icon;
    }
    return React.cloneElement(icon, { style: styles });
  };

  return (
    <div
      className={`fixed left-0 h-[calc(100vh-88px)] top-[88px] hidden md:block ${expanded ? "w-64" : "w-16"
        } ${styles.container} border-r p-0 z-50 transition-all duration-300 ${expanded ? "overlay" : ""
        }`}
    >
      <ul className="space-y-4 p-4">
        {/* Home Item */}
        <li className="flex items-center h-10 relative">
          <Tooltip content={!expanded ? homeItem.label : null}>
            <div className="w-full h-full relative">
              {currentStep === null && (
                <div className={`absolute inset-x-[-16px] w-[calc(100%+32px)] h-full ${styles.activeBg}`}></div>
              )}
              <button
                className={`flex items-center gap-4 w-full h-full rounded-lg ${styles.text
                  } ${!expanded ? "justify-center" : ""} ${currentStep === null ? styles.activeText : ""
                  } ${currentStep === null ? "" : "hover:bg-gray-700/50"
                  } relative z-10`}
                onClick={() => {
                  router.push(homeItem.route);
                  onClose();
                }}
                onMouseEnter={() => setHoveredItem("home")}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <div
                  className={`flex items-center justify-center w-6 h-6 ${expanded ? "ml-2" : ""}`}
                >
                  {renderIcon(homeItem.icon, homeItem.step)}
                </div>
                {expanded && <span>{homeItem.label}</span>}
              </button>
            </div>
          </Tooltip>
        </li>

        {/* Divider after Home */}
        <li className="py-2">
          <hr className={`border-t-2 opacity-50 ${styles.divider}`} />
        </li>

        {/* Items */}
        {items.map((item, idx) => (
          <li key={idx} className="flex items-center h-10 relative">
            <Tooltip content={!expanded ? item.label : null}>
              <div className="w-full h-full relative">
                {currentStep === item.step && (
                  <div className={`absolute inset-x-[-16px] w-[calc(100%+32px)] h-full ${styles.activeBg}`}></div>
                )}
                <button
                  className={`flex items-center gap-4 w-full h-full rounded-lg ${styles.text
                    } ${!expanded ? "justify-center" : ""} ${currentStep === item.step ? styles.activeText : ""
                    } ${currentStep === item.step ? "" : "hover:bg-gray-700/50"
                    } relative z-10`}
                  onClick={async () => {
                    if (item.step === "settings") {
                      await fetchOperationalSettings({ force: true });
                    }
                    router.push(item.route || `/onboarding?step=${item.step}`);
                    onClose();
                  }}
                  onMouseEnter={() => setHoveredItem(item.step)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <div
                    className={`flex items-center justify-center w-6 h-6 ${expanded ? "ml-2" : ""}`}
                  >
                    {renderIcon(item.icon, item.step)}
                  </div>
                  {expanded && <span>{item.label}</span>}
                </button>
              </div>
            </Tooltip>
          </li>
        ))}

        {/* Divider before Launch */}
        <li className="py-2">
          <hr className={`border-t-2 opacity-50 ${styles.divider}`} />
        </li>

        {/* Launch Item */}
        <li className="flex items-center h-10 relative">
          <Tooltip content={!expanded ? launchItem.label : null}>
            <div className="w-full h-full relative">
              {currentStep === launchItem.step && (
                <div className={`absolute inset-x-[-16px] w-[calc(100%+32px)] h-full ${styles.activeBg}`}></div>
              )}
              <button
                className={`flex items-center gap-4 w-full h-full rounded-lg ${styles.text
                  } ${!expanded ? "justify-center" : ""} ${currentStep === launchItem.step ? styles.activeText : ""
                  } ${currentStep === launchItem.step ? "" : "hover:bg-gray-700/50"
                  } relative z-10`}
                onClick={async () => {
                  try {
                    // 1. Close existing instances
                    await closeQuantCopierDiscord();

                    // 2. Show launching toast
                    const { id: launchToastId } = toast({
                      title: "Launching QuantCopierDiscord...",
                      description: "Please wait while we start the background process.",
                      duration: 10000,
                    });

                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

                    // 3. Launch detached process
                    await invoke('launch_discord_detached');

                    // 4. Wait 3 seconds for it to stabilize
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // 5. Check if running
                    const isRunning = await invoke<boolean>('check_discord_process');

                    // Dismiss the launching toast
                    dismiss(launchToastId);

                    if (isRunning) {
                      toast({
                        title: "Launch Successful ✅",
                        description: "QuantCopierDiscord.exe - Launched Successfully. Close UI window to conserve system resources",
                        className: "bg-green-500 text-white border-green-600",
                        duration: 60000, // Close automatically after 1 minute
                        action: (
                          <ToastAction
                            altText="Close Window"
                            onClick={async () => {
                              const appWindow = getCurrentWindow();
                              await appWindow.close();
                            }}
                            className="bg-white text-green-600 hover:bg-gray-100 border-none"
                          >
                            Close Window
                          </ToastAction>
                        ),
                      });
                      router.push("/home");
                    } else {
                      toast({
                        variant: "destructive",
                        title: "Launch Verification Failed",
                        description: "The process does not appear to be running. Please check Task Manager or try again.",
                      });
                    }

                  } catch (e) {
                    console.error(e);
                    toast({
                      variant: "destructive",
                      title: "Launch Failed",
                      description: e instanceof Error ? e.message : 'An unexpected error occurred',
                    });
                  }
                  onClose();
                }}
                onMouseEnter={() => setHoveredItem(launchItem.step)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <div
                  className={`flex items-center justify-center w-6 h-6 ${expanded ? "ml-2" : ""}`}
                >
                  {renderIcon(launchItem.icon, launchItem.step)}
                </div>
                {expanded && <span>{launchItem.label}</span>}
              </button>
            </div>
          </Tooltip>
        </li>
      </ul>
    </div>
  );
}