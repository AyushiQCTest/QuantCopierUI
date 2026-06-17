"use client";

import { useState, useEffect, useContext, Suspense } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Step1MT5 from "@/components/onboarding/Step1MT5";
import Step2ChannelSelect from "@/components/onboarding/Step2ChannelSelect";
import Step3NotificationSetup from "@/components/onboarding/Step3NotificationSetup";
import Step4Settings from "@/components/onboarding/Step4Settings";
import SymbolMapper from "@/components/onboarding/SymbolMapper";
import { Bell, Settings } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import { ThemeContext } from "@/lib/theme-config";
import EnhancedHeader from "@/components/home/EnhancedHeader";
import Sidebar from "@/components/home/Sidebar";
import { useBackendData } from "@/src/context/BackendDataContext";

const API_BASE_URL = "http://localhost:8000";
const totalSteps = 4;

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme } = useContext(ThemeContext);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const stepParam = searchParams?.get("step") || "";
  const [currentStep, setCurrentStep] = useState<string>(stepParam || "mt5-setup");
  const isRevisit = !!stepParam;
  
  const { validationData, authStatus, fetchValidationData } = useBackendData();

  useEffect(() => {
    if (stepParam) {
      setCurrentStep(stepParam);
    }
  }, [stepParam]);

  useEffect(() => {
    if (authStatus) {
      console.log("Auth status from context:", authStatus);
      const completed = authStatus.onboardingCompleted === true || authStatus.onboardingCompleted === "True";
      setOnboardingCompleted(completed);
      setIsLoading(false);
    }
  }, [authStatus]);

  useEffect(() => {
    console.log("OnboardingPage - Current state:", {
      isLoading,
      currentStep,
      validationData: validationData ? "present" : "missing",
      authStatus: authStatus ? "present" : "missing",
      authenticated: authStatus?.authenticated
    });
    
    if (authStatus?.authenticated && isLoading) {
      console.log("Auth is present but still loading, forcing to step mt5-setup");
      setIsLoading(false);
      setCurrentStep("mt5-setup");
    }
  }, [isLoading, currentStep, validationData, authStatus]);

  useEffect(() => {
    const initializeOnboarding = async () => {
      if (authStatus?.authenticated) {
        console.log("Auth confirmed, setting to step mt5-setup and ending loading");
        setCurrentStep("mt5-setup");
        setIsLoading(false);
      }
    };

    initializeOnboarding();
  }, [authStatus]);

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        console.log("Loading timeout reached, forcing to step mt5-setup");
        setIsLoading(false);
        setCurrentStep("mt5-setup");
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    const checkDataAndProceed = () => {
      if (authStatus?.authenticated && !validationData && isLoading) {
        console.log("Auth is validated but no validation data yet, proceeding anyway");
        setIsLoading(false);
        setCurrentStep("mt5-setup");
      }
      
      if (authStatus?.authenticated && validationData) {
        console.log("Both auth and validation data present, proceeding to step mt5-setup");
        setIsLoading(false);
        setCurrentStep("mt5-setup");
      }
    };
    
    checkDataAndProceed();
  }, [authStatus, validationData, isLoading]);

  useEffect(() => {
    const refreshValidationData = async () => {
      if (authStatus?.authenticated) {
        console.log("Auth detected, ensuring validation data is fresh");
        try {
          await fetchValidationData({ force: true });
        } catch (err) {
          console.error("Failed to refresh validation data:", err);
        }
      }
    };
    
    refreshValidationData();
  }, [authStatus?.authenticated, fetchValidationData]);

  useEffect(() => {
    const loadData = async () => {
      if (authStatus?.authenticated && !validationData && isLoading) {
        console.log("Auth detected, loading validation data for onboarding");
        try {
          await fetchValidationData({ force: true });
        } catch (error) {
          console.error("Failed to load validation data:", error);
          // Still continue with onboarding even if validation failed
          // The Step1MT5 component will show appropriate errors
          setIsLoading(false);
        }
      }
    };
    
    loadData();
  }, [authStatus, validationData, isLoading, fetchValidationData]);

  const allSteps = [
    { name: "mt5-setup", title: "MT5 Setup", icon: "mt5", component: Step1MT5 },
    { name: "channel-select", title: "Select Channels", icon: "telegram", component: Step2ChannelSelect },
    { name: "add-bot", title: "Alerts and Notifications", icon: "bell", component: Step3NotificationSetup },
    { name: "settings", title: "Operational Settings", icon: "settings", component: Step4Settings },
    { name: "symbol-mapper", title: "Symbol Mapper", icon: "$", component: SymbolMapper },
    { name: "launch", title: "Launch", icon: "rocket", component: null },
  ];

  const currentStepTitle = allSteps.find((s) => s.name === currentStep)?.title || "Settings";
  const progressBarSteps = allSteps.slice(0, totalSteps);
  const CurrentComponent = allSteps.find((s) => s.name === currentStep)?.component;

  useEffect(() => {
    console.log("Current step set to:", currentStep);
    console.log("Component for this step:", CurrentComponent ? "Found" : "Not found");
  }, [currentStep, CurrentComponent]);

  const handleNext = () => {
    const currentIndex = allSteps.findIndex((s) => s.name === currentStep);
    if (isRevisit || currentIndex >= totalSteps - 1) {
      router.push("/home");
      return;
    }
    const nextStep = allSteps[currentIndex + 1].name;
    setCurrentStep(nextStep);
    if (currentIndex === totalSteps - 2) {
      axios
        .post(`${API_BASE_URL}/set_onboarding_complete`)
        .then(() => {
          console.log("Onboarding completed");
          setOnboardingCompleted(true); // immediate UI update to hide progress bar / redirect logic
        })
        .catch((error) => console.error("Error completing onboarding:", error));
    }
  };

  const handleBack = () => {
    const currentIndex = allSteps.findIndex((s) => s.name === currentStep);
    if (currentIndex > 0) {
      if (isRevisit) {
        const prevStep = allSteps[currentIndex - 1].name;
        router.push(`/onboarding?step=${prevStep}`);
      } else {
        setCurrentStep(allSteps[currentIndex - 1].name);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className={theme === "dark" ? "text-white" : "text-gray-900"}>Loading...</div>
      </div>
    );
  }

  if (onboardingCompleted && !isRevisit && !isLoading) {
    console.log("Redirecting to home because onboarding is completed");
    router.push("/home");
    return null;
  }

  if (!CurrentComponent && currentStep !== "launch") {
    return (
      <div className={theme === "dark" ? "text-center text-white" : "text-center text-gray-900"}>
        Step not found
      </div>
    );
  }

  const getThemeStyles = () => ({
    container: theme === "dark" ? "bg-gradient-to-b from-black to-gray-900 text-white" : "bg-gradient-to-b from-gray-100 to-white text-gray-900",
    card: theme === "dark" ? "bg-black border-gray-800" : "bg-white border-gray-200",
    progressBar: "bg-gray-200",
    progressFill: "bg-blue-500",
    divider: "bg-gray-300",
    stepCompleted: theme === "dark" ? "bg-blue-500 border-blue-500" : "bg-blue-500 border-blue-500",
    stepActive: theme === "dark" ? "border-blue-500 bg-black" : "border-blue-500 bg-white",
    stepInactive: theme === "dark" ? "border-gray-600 bg-black" : "border-gray-300 bg-white",
    textStepCompleted: "text-blue-600",
    textStepInactive: theme === "dark" ? "text-gray-500" : "text-gray-400",
    overlay: theme === "dark" ? "bg-black bg-opacity-50" : "bg-gray-900 bg-opacity-30",
  });

  const styles = getThemeStyles();

  return (
    <div className={`min-h-screen ${styles.container}`}>
      <EnhancedHeader
        toggleSidebar={isRevisit ? () => setSidebarExpanded(!sidebarExpanded) : undefined}
      />
      {isRevisit && (
        <Sidebar
          expanded={sidebarExpanded}
          onClose={() => setSidebarExpanded(false)}
          currentStep={currentStep}
        />
      )}

      <div
        className={`pt-[88px] ${
          isRevisit && sidebarExpanded ? "ml-64" : isRevisit ? "ml-16" : "ml-0"
        } px-6 transition-all duration-300`}
      >
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="space-y-6">
            <h1
              className={`text-3xl font-bold text-center mb-16 mt-10 ${
                theme === "dark" ? "text-white" : "text-gray-900"
              }`}
            >
              {isRevisit ? `Edit Your ${currentStepTitle}` : "Setup Your Account"}
            </h1>

            {(!isRevisit && !onboardingCompleted) && (
              <div className="relative" style={{ height: "90px" }}>
                <div className={`absolute left-0 right-0 bottom-0 h-1 ${styles.progressBar}`}>
                  {[1, 2, 3].map((divider) => (
                    <div
                      key={divider}
                      className={`absolute h-3 w-0.5 ${styles.divider} -top-1`}
                      style={{ left: `${(divider / totalSteps) * 100}%` }}
                    ></div>
                  ))}
                  <div
                    className={`h-1 ${styles.progressFill} transition-all duration-300`}
                    style={{
                      width: `${
                        (progressBarSteps.findIndex((s) => s.name === currentStep) / totalSteps) * 100
                      }%`,
                    }}
                  ></div>
                </div>

                {progressBarSteps.map((step, index) => {
                  const leftPercent = ((index + 0.5) / totalSteps) * 100;
                  const isCompleted = progressBarSteps.findIndex((s) => s.name === currentStep) > index;
                  const isActive = progressBarSteps.findIndex((s) => s.name === currentStep) >= index;
                  return (
                    <div
                      key={step.name}
                      style={{
                        position: "absolute",
                        left: `${leftPercent}%`,
                        transform: "translateX(-50%)",
                      }}
                      className="flex flex-col items-center"
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                          isCompleted
                            ? styles.stepCompleted
                            : isActive
                            ? styles.stepActive
                            : styles.stepInactive
                        }`}
                      >
                        {step.icon === "mt5" && (
                          <Image
                            src="/MetaTrader5.png"
                            alt="MT5"
                            width={24}
                            height={24}
                            className=""
                          />
                        )}
                        {step.icon === "telegram" && (
                          isCompleted ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 256 256"
                              width={18}
                              height={18}
                              className="text-xl"
                            >
                              (
                                <>
                                  <path
                                    fill="#FFFFFF"
                                    d="M128 0C94.06 0 61.48 13.494 37.5 37.49A128.04 128.04 0 0 0 0 128c0 33.934 13.5 66.514 37.5 90.51C61.48 242.506 94.06 256 128 256s66.52-13.494 90.5-37.49c24-23.996 37.5-56.576 37.5-90.51s-13.5-66.514-37.5-90.51C194.52 13.494 161.94 0 128 0"
                                  />
                                  <path
                                    fill="#1D4ED8"
                                    d="M57.94 126.648q55.98-24.384 74.64-32.152c35.56-14.786 42.94-17.354 47.76-17.441c1.06-.017 3.42.245 4.96 1.49c1.28 1.05 1.64 2.47 1.82 3.467c.16.996.38 3.266.2 5.038c-1.92 20.24-10.26 69.356-14.5 92.026c-1.78 9.592-5.32 12.808-8.74 13.122c-7.44.684-13.08-4.912-20.28-9.63c-11.26-7.386-17.62-11.982-28.56-19.188c-12.64-8.328-4.44-12.906 2.76-20.386c1.88-1.958 34.64-31.748 35.26-34.45c.08-.338.16-1.598-.6-2.262c-.74-.666-1.84-.438-2.64-.258c-1.14.256-19.12 12.152-54 35.686c-5.1 3.508-9.72 5.218-13.88 5.128c-4.56-.098-13.36-2.584-19.9-4.708c-8-2.606-14.38-3.984-13.82-8.41c.28-2.304 3.46-4.662 9.52-7.072"
                                  />
                                </>
                              )
                            </svg>
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 256 256"
                              width={18}
                              height={18}
                              className="text-xl"
                            >
                              <path
                                fill="#9CA3AF"
                                d="M128 0C94.06 0 61.48 13.494 37.5 37.49A128.04 128.04 0 0 0 0 128c0 33.934 13.5 66.514 37.5 90.51C61.48 242.506 94.06 256 128 256s66.52-13.494 90.5-37.49c24-23.996 37.5-56.576 37.5-90.51s-13.5-66.514-37.5-90.51C194.52 13.494 161.94 0 128 0"
                              />
                              <path
                                fill="#FFFFFF"
                                d="M57.94 126.648q55.98-24.384 74.64-32.152c35.56-14.786 42.94-17.354 47.76-17.441c1.06-.017 3.42.245 4.96 1.49c1.28 1.05 1.64 2.47 1.82 3.467c.16.996.38 3.266.2 5.038c-1.92 20.24-10.26 69.356-14.5 92.026c-1.78 9.592-5.32 12.808-8.74 13.122c-7.44.684-13.08-4.912-20.28-9.63c-11.26-7.386-17.62-11.982-28.56-19.188c-12.64-8.328-4.44-12.906 2.76-20.386c1.88-1.958 34.64-31.748 35.26-34.45c.08-.338.16-1.598-.6-2.262c-.74-.666-1.84-.438-2.64-.258c-1.14.256-19.12 12.152-54 35.686c-5.1 3.508-9.72 5.218-13.88 5.128c-4.56-.098-13.36-2.584-19.9-4.708c-8-2.606-14.38-3.984-13.82-8.41c.28-2.304 3.46-4.662 9.52-7.072"
                              />
                            </svg>
                          )
                        )}
                        {step.icon === "bell" && (
                          isCompleted ? (
                            <Bell
                              className={`w-6 h-6 ${
                                theme === "dark"
                                  ? "text-white"
                                  : "text-white"
                              }`}
                            />
                          ) : (
                            <Bell
                              className={`w-6 h-6 ${styles.textStepInactive}`}
                            />
                          )
                        )}
                        {step.icon === "settings" && (
                          <Settings
                            className={`w-6 h-6 ${
                              isCompleted
                                ? theme === "dark"
                                  ? "text-white"
                                  : "text-blue-600"
                                : styles.textStepInactive
                            }`}
                          />
                        )}
                      </div>
                      <div className="mt-2">
                        <span
                          className={`text-xs whitespace-nowrap font-medium ${
                            isCompleted || isActive ? styles.textStepCompleted : styles.textStepInactive
                          }`}
                        >
                          {step.title}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Card className={`p-6 ${styles.card}`}>
            {CurrentComponent ? (
              <CurrentComponent
                onNext={handleNext}
                onBack={handleBack}
                theme={theme}
                isRevisit={isRevisit}
              />
            ) : currentStep === "launch" ? (
              <div className="text-center">
                <h2
                  className={`text-2xl font-semibold ${
                    theme === "dark" ? "text-white" : "text-gray-900"
                  }`}
                >
                  Ready to Launch!
                </h2>
                <p className={`mt-2 ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
                  Your setup is complete. Click below to start using Quant Copier.
                </p>
                <Button onClick={() => router.push("/home")} className="mt-4">
                  Launch
                </Button>
              </div>
            ) : (
              <div className={theme === "dark" ? "text-white" : "text-gray-900"}>Loading...</div>
            )}
          </Card>
        </div>
      </div>

      {isRevisit && sidebarExpanded && (
        <div
          className={`fixed inset-0 ${styles.overlay} z-40`}
          onClick={() => setSidebarExpanded(false)}
        />
      )}
    </div>
  );
}