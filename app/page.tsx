"use client";

import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { PhoneForm } from "@/components/phone-form";
import { VerificationForm } from "@/components/verification-form";
import { TwoStepForm } from "@/components/two-step-form";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { invoke } from "@tauri-apps/api/core";
import { EulaAgreement } from "@/components/eula";
import { handleExit } from "@/api/tauri";
import { useRouter } from "next/navigation";
import { useBackendData } from "@/src/context/BackendDataContext";

const API_BASE_URL = "http://localhost:8000";

type Step = "phone" | "verification" | "two-step" | "eula";

interface AuthResponse {
  success?: boolean;
  message: string;
  sessionId?: string;
  requires2FA?: boolean;
  username?: string;
}

interface AuthState {
  status: string;
  message: string;
  eulaAccepted: boolean;
  onboardingCompleted: boolean;
}

export default function Home() {
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const { authStatus, refreshAllData } = useBackendData();

  useEffect(() => {
    if (authStatus) {
      const eulaAcceptedBool = authStatus.eulaAccepted === "True";
      const onboardingCompletedBool = authStatus.onboardingCompleted === "True" || 
                                     authStatus.onboardingComplete === "True";
      
      setEulaAccepted(eulaAcceptedBool);
      setOnboardingCompleted(onboardingCompletedBool);
      
      if (!eulaAcceptedBool) {
        setStep("eula");
        return;
      }
      
      if (!onboardingCompletedBool) {
        router.push("/onboarding");
        return;
      }
      
      router.push("/home");
    }
  }, [authStatus, router]);

  const handlePhoneSubmit = async (phone: string) => {
    setLoading(true);
    setPhoneNumber(phone);
    try {
      const res = await axios.post(`${API_BASE_URL}/login`, { phoneNumber: phone });
      if (res.status === 200) {
        setSessionId(res.data.sessionId ?? "");
        setStep("verification");
      } else {
        toast({
          title: "Error",
          description: res.data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send verification code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (code: string) => {
    setLoading(true);
    try {
      const res = await axios.post<AuthResponse>(`${API_BASE_URL}/verify_otp`, {
        sessionId,
        OTP: code,
        phoneNumber,
      });

      if (res.status) {
        setSessionId(res.data.sessionId ?? "");
        
        await refreshAllData();
        
        if (res.data.requires2FA) {
          setStep("two-step");
        } else {
          if (authStatus?.eulaAccepted !== "True") {
            setStep("eula");
          } else {
            const onboardingCompletedBool = authStatus?.onboardingCompleted === "True" || 
                                            authStatus?.onboardingComplete === "True";
            router.push(!onboardingCompletedBool ? "/onboarding" : "/dashboard");
          }
        }
      } else {
        toast({
          title: "Error",
          description: res.data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to verify code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTwoStepSubmit = async (password: string) => {
    setLoading(true);
    try {
      const res = await axios.post<AuthResponse>(`${API_BASE_URL}/verify_2FA`, {
        sessionId,
        password,
      });

      if (res.status) {
        setSessionId(res.data.sessionId ?? "");
        if (authStatus?.eulaAccepted !== "True") {
          setStep("eula");
        } else {
          const onboardingCompletedBool = authStatus?.onboardingCompleted === "True" || 
                                          authStatus?.onboardingComplete === "True";
          router.push(!onboardingCompletedBool ? "/onboarding" : "/dashboard");
        }
      } else {
        toast({
          title: "Error",
          description: res.data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to verify password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAgree = async () => {
    try {
      const eulaRes = await axios.post(`${API_BASE_URL}/accept_eula`);
      if (eulaRes.status === 200) {
        router.push(!onboardingCompleted ? "/onboarding" : "/dashboard");
      } else {
        toast({
          title: "Error",
          description: "Failed to accept EULA",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process EULA acceptance",
        variant: "destructive",
      });
    }
  };

  const sessionReset = async () => {
    try {
      await axios.post(`${API_BASE_URL}/reset_auth`);
      setSessionId("");
      setStep("phone");
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to reset session",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const listener = (event: any) => {
      if (event.key === "F11") {
        event.preventDefault();
        invoke("toggle_fullscreen");
      }
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, []);

  return (
    <AuthLayout>
      {step === "eula" ? (
        <div className="w-auto min-w-[280px] max-w-[880px]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-6">
            <EulaAgreement onAgree={handleAgree} onDisagree={handleExit} />
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-6">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex flex-col items-center justify-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
                  Telegram Login
                </h1>
              </div>
              {step === "phone" && phoneNumber === "" && (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  Welcome, please enter your telegram number to login
                </div>
              )}
            </div>

            {step === "phone" && (
              <PhoneForm
                onSubmit={handlePhoneSubmit}
                loading={loading}
                onPhoneChange={(value: string) => setPhoneNumber(value)}
              />
            )}
            {step === "verification" && (
              <VerificationForm
                onSubmit={handleVerificationSubmit}
                onBack={sessionReset}
                loading={loading}
              />
            )}
            {step === "two-step" && (
              <TwoStepForm onSubmit={handleTwoStepSubmit} loading={loading} />
            )}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
