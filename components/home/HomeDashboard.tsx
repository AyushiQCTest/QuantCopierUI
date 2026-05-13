"use client";

import MT5AccountCard from "./MT5AccountCard";
import AlertNotificationCard from "./AlertNotificationCard";
import SubscribedChannelsCard from "./SubscribedChannelsCard";
import { Settings } from "lucide-react";
import Link from "next/link";
import { useContext } from "react";
import { ThemeContext } from "@/lib/theme-config";

// Wrapper component for cards with settings icon
const CardWrapper = ({ children, settingsLink }: { children: React.ReactNode, settingsLink: string }) => {
  const { theme } = useContext(ThemeContext);
  
  return (
    <div className="group relative">
      <Link 
        href={settingsLink}
        className={`absolute top-2 left-2 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity
          ${theme === "dark" 
            ? "hover:bg-gray-800 text-gray-400 hover:text-gray-200" 
            : "hover:bg-gray-100 text-gray-600 hover:text-gray-800"
          } z-10`}
      >
        <Settings size={20} />
      </Link>
      {children}
    </div>
  );
};

export default function HomeDashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 ml-16 mt-8">
      {/* First row in desktop: MT5 and Alert cards */}
      <div className="md:col-span-1 lg:col-span-1">
        <CardWrapper settingsLink="/onboarding?step=mt5-setup">
          <MT5AccountCard />
        </CardWrapper>
      </div>
      <div className="md:col-span-1 lg:col-span-1">
        <CardWrapper settingsLink="/onboarding?step=add-bot">
          <AlertNotificationCard />
        </CardWrapper>
      </div>

      {/* Second row in desktop: Subscribed Channels card */}
      <div className="md:col-span-2 lg:col-span-2">
        <CardWrapper settingsLink="/onboarding?step=channel-select">
          <SubscribedChannelsCard />
        </CardWrapper>
      </div>
    </div>
  );
}