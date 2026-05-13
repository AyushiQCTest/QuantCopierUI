"use client";

import { useState, useContext } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu, UserCircle, Sun, Moon } from "lucide-react";
import ProfileDropdown from "@/components/home/ProfileDropdown";
import { ThemeContext } from "@/lib/theme-config";
import { useBackendData } from "@/src/context/BackendDataContext";

export default function EnhancedHeader({ toggleSidebar }: { toggleSidebar?: () => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { userInfo } = useBackendData();
  const [imageError, setImageError] = useState(false);

  // Derive the profile photo URL from context (if present)
  const profilePhotoUrl = userInfo?.profilePhotoUrl && !imageError
    ? `http://localhost:8000${userInfo.profilePhotoUrl}`
    : null;

  const getThemeStyles = () => ({
    container: theme === "dark" ? "bg-black text-white" : "bg-white text-gray-900",
    border: theme === "dark" ? "border-gray-800" : "border-gray-200",
    text: theme === "dark" ? "text-gray-300" : "text-gray-600",
    hover: theme === "dark" ? "hover:bg-gray-800" : "hover:bg-gray-100",
  });

  const styles = getThemeStyles();

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 flex items-center px-6 h-[88px] border-b ${
        theme === "dark"
          ? "border-gray-800 bg-gradient-to-r from-black to-gray-900"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between w-full">
        {/* Left section with menu button */}
        <div className="flex items-center -ml-2">
          {typeof toggleSidebar === "function" && (
            <Button
              variant="ghost"
              onClick={toggleSidebar}
              className={`p-2 ${
                theme === "dark" ? "hover:bg-gray-800" : "hover:bg-gray-100"
              } rounded-full transition-colors`}
            >
              <Menu
                className={`w-6 h-6 ${
                  theme === "dark" ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-black"
                }`}
              />
            </Button>
          )}
        </div>

        {/* Center - Logo */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <Image
            src={theme === "dark" ? "/QCT_Logo_Dark.svg" : "/QCT_Logo_Light.svg"}
            alt="QCT Logo"
            width={720}
            height={300}
            className="h-40 w-auto"
          />
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={toggleTheme}
            className={`p-2 ${
              theme === "dark" ? "hover:bg-gray-800" : "hover:bg-gray-100"
            } rounded-full transition-colors`}
          >
            {theme === "dark" ? (
              <Sun className="w-6 h-6 text-gray-300 hover:text-white" />
            ) : (
              <Moon className="w-6 h-6 text-gray-600 hover:text-black" />
            )}
          </Button>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className={`w-10 h-10 rounded-full border overflow-hidden ${
              theme === "dark"
                ? "border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900 hover:from-blue-900 hover:to-blue-800"
                : "border-gray-300 bg-gradient-to-br from-gray-100 to-white hover:from-blue-50 hover:to-blue-100"
            } flex items-center justify-center transition-all duration-300`}
          >
            {profilePhotoUrl ? (
              <Image
                src={profilePhotoUrl}
                alt="Profile"
                width={48}
                height={48}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
                priority={true}
              />
            ) : (
              <UserCircle className={`w-8 h-8 ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`} />
            )}
          </button>
          {profileOpen && <ProfileDropdown />}
        </div>
      </div>
    </header>
  );
}