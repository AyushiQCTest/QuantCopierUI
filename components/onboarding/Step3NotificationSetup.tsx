"use client";

import { useState, useEffect, useContext } from "react";
import { Button } from "@/components/ui/button";
import { BotIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSearchParams, useRouter } from "next/navigation";
import { ThemeContext } from "@/lib/theme-config";
import { useBackendData } from "@/src/context/BackendDataContext";
import AlertNotificationCard from "@/components/home/AlertNotificationCard";
import Link from "next/link";

interface Step3NotificationSetupProps {
  onNext: () => void;
  onBack: () => void;
  theme?: string;
}

const API_BASE_URL = "http://localhost:8000";

export default function Step3NotificationSetup({ onNext, onBack, theme }: Step3NotificationSetupProps) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromSidebar = searchParams ? !!searchParams.get("step") : false; // Determines revisit mode
  
  // Initialize consentAccepted to true if fromSidebar is true
  const [consentAccepted, setConsentAccepted] = useState(fromSidebar);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [resetMode, setResetMode] = useState(false); // Tracks if user is in reset flow
  const { theme: contextTheme } = useContext(ThemeContext);
  const activeTheme = theme || contextTheme;
  
  // Use the centralized authStatus from our context
  const { authStatus } = useBackendData();

  // Instead of calling axios here, we react to changes in authStatus.
  useEffect(() => {
    if (authStatus && !fromSidebar) {
      // Assuming your backend response includes a property "notificationConsentAccepted"
      const notificationConsentAccepted = authStatus.notificationConsentAccepted || false;
      setConsentAccepted(notificationConsentAccepted);
    }
  }, [authStatus, fromSidebar]);

  // Handle channel creation and bot addition
  const createChannelAndAddBot = async () => {
    setCreatingChannel(true);
    try {
      await axios.get(`${API_BASE_URL}/create_channel_and_add_bot`);
      toast({
        title: "Success",
        description: "Channel created and bot added successfully",
        duration: 1500,
      });

      const botCheck = await axios.get(`${API_BASE_URL}/check_bot_in_channel`);
      if (botCheck.data.status === "success") {
        if (resetMode && fromSidebar) {
          // In reset mode with URL params, go back to showing the AlertNotificationCard
          setResetMode(false);
          setConsentAccepted(true);
        } else if (!fromSidebar) {
          // Automatically proceed to the next step after adding the bot
          onNext(); // Proceed to next step
        } else {
          // Other cases
          router.push("/home");
        }
      } else {
        toast({
          title: "Warning",
          description: "Bot is not properly configured in the channel",
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create channel",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setCreatingChannel(false);
    }
  };

  // Handle consent agreement
  const handleConsentAgree = () => {
    if (resetMode && fromSidebar) {
      // In reset mode with URL params, directly trigger channel creation
      createChannelAndAddBot();
    } else {
      // Normal flow - just mark consent as accepted
      setConsentAccepted(true);
      
      if (!fromSidebar) {
        axios.post(`${API_BASE_URL}/accept_notification_consent`)
          .catch(error => console.error("Error accepting notification consent:", error));
      }
    }
  };

  // Handle consent disagreement
  const handleConsentDisagree = () => {
    toast({
      title: "Consent Required",
      description: "You must agree to proceed with notifications setup.",
      variant: "destructive",
      duration: 3000,
    });
  };

  // Handle reset action in revisit mode
  const handleReset = () => {
    setResetMode(true);
    setConsentAccepted(false); // Show consent notice again
  };

  // Theme styles
  const getThemeStyles = () => ({
    container: activeTheme === 'dark' ? 'text-white' : 'text-gray-900',
    textSecondary: activeTheme === 'dark' ? 'text-gray-400' : 'text-gray-600',
    buttonSecondary: activeTheme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-600',
    buttonPrimary: activeTheme === 'dark' ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonOutline: activeTheme === 'dark' ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-200',
    card: activeTheme === 'dark' ? 'bg-gray-900 border-gray-800 shadow-lg' : 'bg-white border-gray-200 shadow-md',
    link: activeTheme === 'dark' ? 'text-blue-400' : 'text-blue-600',
    iconBg: activeTheme === 'dark' ? 'bg-black' : 'bg-gray-200',
    iconColor: activeTheme === 'dark' ? 'text-[#22c55e]' : 'text-blue-500',
  });

  const styles = getThemeStyles();

  // Determine what to render in the main content area
  const renderMainContent = () => {
    // Case 1: In revisit mode (with URL params) and not in reset mode, show AlertNotificationCard
    if (fromSidebar && !resetMode) {
      return <AlertNotificationCard />;
    }
    
    // Case 2: Consent not accepted (or in reset mode), show the consent notice
    if (!consentAccepted) {
      return (
        <Card className={`w-full ${styles.card} p-6 rounded-2xl`}>
          <CardHeader>
            <CardTitle className={`text-xl font-semibold ${styles.container}`}>
              QuantTraderTools Notice - Alerts & Notification
            </CardTitle>
          </CardHeader>
          <CardContent className={`space-y-4 ${styles.textSecondary}`}>
            <p>
              QuantTraderTools, the provider of the QuantTelegramCopier app, requires your consent to perform the following actions:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Create a Private Telegram Channel:</strong> Using your authenticated Telegram credentials, we will create a private Telegram channel with the name you provided.
              </li>
              <li>
                <strong>Add QuantCopierAlertsBot as an Admin:</strong> We will add the public bot <span className={`${styles.link} cursor-pointer`}>QuantCopierAlertsBot</span> as an administrator to the newly created private channel.
              </li>
            </ul>
            <p className="text-sm">
              The QuantCopierAlertsBot is designed solely for sending alerts related to your trading activities. Your Telegram credentials will not be used for any other purpose or disclosed to third parties. Your privacy is our priority. For more details, please read our{" "}
              <Link 
                href="https://quanttradertools.github.io/legal/privacy" 
                target="_blank" 
                rel="noopener noreferrer" 
                className={`${styles.link} cursor-pointer hover:underline`}
              >
                Privacy Policy
              </Link>.
            </p>
            <div className={`flex ${resetMode ? 'justify-center' : 'justify-end'} space-x-4 pt-4`}>
              {resetMode ? (
                <Button 
                  className={styles.buttonPrimary} 
                  onClick={handleConsentAgree}
                  disabled={creatingChannel}
                >
                  {creatingChannel ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : "OK"}
                </Button>
              ) : (
                <>
                  <Button variant="secondary" className={styles.buttonSecondary} onClick={handleConsentDisagree}>
                    Disagree
                  </Button>
                  <Button className={styles.buttonPrimary} onClick={handleConsentAgree}>
                    I Agree
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }
    
    // Case 3: Normal onboarding flow (not from sidebar) with consent accepted, show create channel section
    return (
      <div className={`p-6 ${styles.card} shadow-lg rounded-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-full ${styles.iconBg}`}>
              <BotIcon className={`w-6 h-6 ${styles.iconColor}`} />
            </div>
            <div>
              <h3 className={`font-semibold ${styles.container}`}>
                Create Alerts Channel
              </h3>
              <p className={`text-sm ${styles.textSecondary}`}>
                Create a private channel and add the notification bot.
              </p>
            </div>
          </div>
          <Button 
            onClick={createChannelAndAddBot} 
            disabled={creatingChannel}
            className={styles.buttonPrimary}
          >
            {creatingChannel ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Processing...
              </>
            ) : "Proceed"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className={`text-2xl font-semibold ${styles.container}`}>
          Setup Notifications
        </h2>
        <p className={styles.textSecondary}>
          {consentAccepted
            ? "Create an alerts channel and configure the notification bot."
            : "Please review and consent to our service requirements before proceeding."}
        </p>
      </div>

      {/* Main content area that changes based on the state */}
      {renderMainContent()}

      {/* Navigation Buttons Section */}
      {(fromSidebar && !resetMode) || (!fromSidebar && consentAccepted) ? (
        <div className={fromSidebar ? "flex justify-center" : "flex justify-between"}>
          {fromSidebar && !resetMode ? (
            // Revisit mode: Centered Reset button
            <Button onClick={handleReset} className={styles.buttonPrimary}>
              Reset
            </Button>
          ) : (
            // Normal mode: Show Previous button
            !fromSidebar && consentAccepted && (
              <>
                <Button variant="outline" onClick={onBack} className={styles.buttonOutline}>
                  Previous Step
                </Button>
              </>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}