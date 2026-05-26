"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { ThemeContext } from "@/lib/theme-config";
import { Check, X } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

interface AlertNotificationDetails {
  status?: string;
  message?: string;
  channel_id?: string;
  botName?: string;
  channelName?: string;
}

export default function AlertNotificationCard() {
  const { theme } = useContext(ThemeContext);
  const [botChannelStatus, setBotChannelStatus] = useState<AlertNotificationDetails | null>(null);
  const [botChannelStatusLoading, setBotChannelStatusLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Use a ref to track if we've already fetched the data
  const hasTriggeredFetch = useRef(false);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log("Checking authentication status...");
        const authResult = await axios.get(`${API_BASE_URL}/auth_status`);
        console.log("Auth result:", authResult.data);
        
        const authenticated = authResult.data?.status === "success" && 
                            authResult.data?.message === "User authenticated";
        console.log("Is authenticated:", authenticated);
        setIsAuthenticated(authenticated);
      } catch (error) {
        console.error("Failed to check authentication status:", error);
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // Fetch bot status only once when component mounts and is authenticated
  useEffect(() => {
    const fetchBotStatus = async () => {
      if (isAuthenticated && !hasTriggeredFetch.current) {
        console.log("Fetching bot channel status...");
        hasTriggeredFetch.current = true;
        setBotChannelStatusLoading(true);
        
        try {
          const response = await axios.get(`${API_BASE_URL}/check_bot_in_channel`);
          console.log("Bot channel status response:", response.data);
          setBotChannelStatus(response.data);
        } catch (error) {
          console.error("Failed to fetch bot channel status:", error);
          // Set a default status object if the API call fails
          setBotChannelStatus({
            status: "error",
            message: "Failed to fetch bot status"
          });
        } finally {
          setBotChannelStatusLoading(false);
        }
      }
    };

    if (isAuthenticated) {
      fetchBotStatus();
    } else {
      console.log("Not authenticated, skipping bot status fetch");
      setBotChannelStatusLoading(false);
    }
  }, [isAuthenticated]);

  // Use the botChannelStatus from state (or an empty object if not loaded yet)
  const alertData: AlertNotificationDetails = botChannelStatus || {};
  // console.log("Current bot channel status:", alertData);

  // If the response contains structured fields (botName and channelName), use them;
  // otherwise, fall back to regex extraction from the message string.
  const botName =
    alertData.botName ||
    (alertData.message ? (alertData.message.match(/Bot '([^']+)'/) || [])[1] : "Not set");
  const channelName =
    alertData.channelName ||
    (alertData.message ? (alertData.message.match(/channel '([^']+)'/) || [])[1] : "Not set");

  // Determine if the bot is added. For example, if alertData.status equals "success", assume true.
  const botAdded = alertData.status === "success";

  return (
    <div
      className={`pt-12 p-6 ${
        theme === "dark" ? "bg-black border-gray-800" : "bg-white border-gray-200"
      } border rounded-lg shadow-lg flex-1 min-h-[240px]`}
    >
      <h2
        className={`text-2xl font-semibold ${
          theme === "dark" ? "text-white" : "text-gray-800"
        } mb-4 text-center`}
      >
        Alert Notification
      </h2>
      {botChannelStatusLoading ? (
        <p className="text-center">Loading bot status...</p>
      ) : !botChannelStatus ? (
        <p className="text-center">Bot status not available</p>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="font-medium">Bot:</span>
            <span>{botName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-medium">Channel:</span>
            <span>{channelName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-medium">Channel ID:</span>
            <span>{alertData.channel_id || "Not set"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-medium">Bot Added:</span>
            <span>
              {botAdded ? (
                <Tooltip content="Bot is successfully added to the channel">
                  <Check className="w-5 h-5 text-green-500" />
                </Tooltip>
              ) : (
                <X className="w-5 h-5 text-red-500" />
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}