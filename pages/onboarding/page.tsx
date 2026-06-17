"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import MT5Setup from "@/components/onboarding/MT5Setup";
import DiscordTokenSetup from "@/components/onboarding/DiscordTokenSetup";

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState({
    mt5Config: null,
    discordToken: "",
  });

  const handleMT5Submit = (mt5Data: any) => {
    setOnboardingData(prev => ({ ...prev, mt5Config: mt5Data }));
    setCurrentStep(2);
  };

  const handleDiscordTokenSubmit = (token: string) => {
    setOnboardingData(prev => ({ ...prev, discordToken: token }));
    setCurrentStep(3);
  };

  return (
    <div className="container mx-auto max-w-3xl py-8">
      <h1 className="text-2xl font-bold mb-6">Setup Your QuantCopierDiscord Account</h1>
      
      {currentStep === 1 && <MT5Setup onSubmit={handleMT5Submit} />}
      {currentStep === 2 && (
        <DiscordTokenSetup 
          onSubmit={handleDiscordTokenSubmit}
          onNext={() => setCurrentStep(3)}
          onBack={() => setCurrentStep(1)}
          isRevisit={false}
        />
      )}
    </div>
  );
} 