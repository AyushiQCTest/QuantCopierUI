"use client";

import { useEffect, useState } from "react";
import MT5AccountCard from "./MT5AccountCard";
import AlertNotificationCard from "./AlertNotificationCard";
import SubscribedChannelsCard from "./SubscribedChannelsCard";
import { Card } from "@/components/ui/card";
import { FaDiscord } from "react-icons/fa";
import { Copy, Eye, EyeOff, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useBackendData } from "@/src/context/BackendDataContext";
import { useRouter } from "next/navigation";

interface HomeDashboardProps {
  isMobile?: boolean;
}

export default function HomeDashboard({ isMobile = false }: HomeDashboardProps) {
  const { discordToken, fetchDiscordToken } = useBackendData();
  const [showToken, setShowToken] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const getToken = async () => {
      console.log("Fetching discord token...");
      const token = await fetchDiscordToken({ force: true });
      console.log("Token fetched:", token ? "Found" : "Not found");
    };
    getToken();
  }, [fetchDiscordToken]);

  const handleCopyToken = () => {
    if (discordToken) {
      navigator.clipboard.writeText(discordToken);
      toast({
        title: "Copied!",
        description: "Discord token copied to clipboard",
        duration: 2000,
      });
    }
  };

  const maskToken = (token: string) => {
    if (!token || token === "") return "Not found!";
    return "•".repeat(32); // Show fixed number of dots for consistent appearance
  };

  return (
    <div className={`space-y-6 ${isMobile ? 'ml-0' : 'ml-16'} mt-8`}>
      {/* First row: MT5 and Alert cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="w-full">
          <MT5AccountCard />
        </div>
        <div className="w-full">
          <AlertNotificationCard />
        </div>
      </div>

      {/* Discord Token Card */}
      <div className="w-full">
        <Card 
          className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 relative group"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {isHovered && (
            <button
              onClick={() => router.push('/onboarding?step=discord-token')}
              className="absolute top-1 left-1 p-1 rounded-full transition-colors hover:bg-white/20 text-white/80 hover:text-white"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3">
              <FaDiscord className="w-6 h-6 text-white" />
              <div>
                <h3 className="text-white font-medium">Discord Token</h3>
                <p className="text-white/80 text-sm">Use this token to authenticate your Discord account</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="secondary"
                size="sm"
                className="bg-white/10 hover:bg-white/20 text-white border-0"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="bg-white/10 hover:bg-white/20 text-white border-0"
                onClick={handleCopyToken}
                disabled={!discordToken}
              >
                <Copy className="w-4 h-4 mr-2" />
              </Button>
            </div>
          </div>
          <div className="mt-3 p-2 bg-black/20 rounded text-white font-mono text-sm break-all">
            {discordToken ? (
              showToken ? discordToken : maskToken(discordToken)
            ) : (
              "Not found!"
            )}
          </div>
        </Card>
      </div>

      {/* Subscribed Channels card */}
      <div className="w-full">
        <SubscribedChannelsCard />
      </div>
    </div>
  );
}