"use client";
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = "http://localhost:8000";

interface BackendDataContextType {
  authStatus: any;
  userInfo: any;
  botChannelStatus: any;
  botChannelStatusLoading: boolean;
  validationData: any;
  operationalSettings: any;
  isOnboardingComplete: boolean;
  isAuthenticated: boolean;
  fetchAuthStatus: (options?: { force?: boolean }) => Promise<any>;
  fetchUserInfo: (options?: { force?: boolean }) => Promise<any>;
  fetchBotChannelStatus: (options?: { force?: boolean }) => Promise<any>;
  fetchValidationData: (options?: { force?: boolean }) => Promise<any>;
  fetchOperationalSettings: (options?: { force?: boolean }) => Promise<any>;
  refreshAllData: () => Promise<void>;
}

export const BackendDataContext = createContext<BackendDataContextType>({
  authStatus: null,
  userInfo: null,
  botChannelStatus: null,
  botChannelStatusLoading: false,
  validationData: null,
  operationalSettings: null,
  isOnboardingComplete: false,
  isAuthenticated: false,
  fetchAuthStatus: async () => null,
  fetchUserInfo: async () => null,
  fetchBotChannelStatus: async () => null,
  fetchValidationData: async () => null,
  fetchOperationalSettings: async () => null,
  refreshAllData: async () => {},
});

export const BackendDataProvider = ({ children }: { children: ReactNode }) => {
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [botChannelStatus, setBotChannelStatus] = useState<any>(null);
  const [botChannelStatusLoading, setBotChannelStatusLoading] = useState<boolean>(false);
  const [validationData, setValidationData] = useState<any>(null);
  const [operationalSettings, setOperationalSettings] = useState<any>(null);
  const [botStatusLastFetched, setBotStatusLastFetched] = useState<number | null>(null);
  const [initialAuthCheckDone, setInitialAuthCheckDone] = useState(false);
  
  // Check if user is authenticated based on the actual response structure
  const isAuthenticated = authStatus?.status === "success" && 
                          authStatus?.message === "User authenticated";
  
  // Determine if onboarding is complete based on various data points
  const isOnboardingComplete = isAuthenticated && 
    !!userInfo && 
    authStatus?.eulaAccepted === "True";

  // Only fetch auth status on initial load - this is safe because it just checks
  // if there's an existing session, it doesn't cause errors if not authenticated
  const fetchAuthStatus = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force || false;
    
    // Skip if we already have data and aren't forcing
    if (!force && authStatus !== null) {
      return authStatus;
    }
    
    try {
      const res = await axios.get(`${API_BASE_URL}/auth_status`);
      console.log("Fetched auth status:", res.data);
      setAuthStatus(res.data);
      return res.data;
    } catch (error) {
      console.error("Error fetching auth status:", error);
      return null;
    }
  }, [authStatus]);

  // Only fetch user info if authenticated
  const fetchUserInfo = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force || false;
    
    // Skip if we already have data and aren't forcing
    if (!force && userInfo !== null) {
      return userInfo;
    }
    
    // Skip if not authenticated
    if (!isAuthenticated) {
      console.log("Skipping user info fetch - not authenticated");
      return null;
    }
    
    try {
      const res = await axios.get(`${API_BASE_URL}/get_user_info`);
      console.log("Fetched user info:", res.data);
      setUserInfo(res.data);
      return res.data;
    } catch (error) {
      console.error("Error fetching user info:", error);
      return null;
    }
  }, [userInfo, isAuthenticated]);

  const fetchBotChannelStatus = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force || false;
    
    // Skip if not authenticated
    if (!isAuthenticated) {
      console.log("Skipping bot check because user is not authenticated");
      return null;
    }
    
    // Check if we already have recent data (within last 5 minutes) to avoid unnecessary calls
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    if (!force && botStatusLastFetched && botStatusLastFetched > fiveMinutesAgo && botChannelStatus) {
      console.log("Using cached bot channel status");
      return botChannelStatus;
    }
    
    try {
      console.log("Fetching bot channel status from API");
      setBotChannelStatusLoading(true);
      const res = await axios.get(`${API_BASE_URL}/check_bot_in_channel`);
      console.log("Fetched bot channel status:", res.data);
      setBotChannelStatus(res.data);
      setBotStatusLastFetched(now);
      return res.data;
    } catch (error: any) {
      console.error("Error fetching bot channel status:", error);
      if (error?.response?.status === 500 && 
          error?.message?.includes("invalid literal for int()")) {
        setBotChannelStatus({ status: "not_configured" });
      } else {
        setBotChannelStatus({ status: "error", error: error.message });
      }
      setBotStatusLastFetched(now);
      return null;
    } finally {
      setBotChannelStatusLoading(false);
    }
  }, [isAuthenticated, botChannelStatus, botStatusLastFetched]);

  const fetchValidationData = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force || false;
    
    // Skip if we already have data and aren't forcing
    if (!force && validationData !== null) {
      return validationData;
    }
    
    // Skip if not authenticated - now using the correct property check
    if (!isAuthenticated) {
      console.log("Skipping validation data fetch - not authenticated");
      return null;
    }
    
    try {
      console.log("Fetching validation data from API");
      
      // IMPORTANT: We need to remove withCredentials for this endpoint
      // The server is configured with Access-Control-Allow-Origin: * 
      // which doesn't support credentials
      const res = await axios.get(`${API_BASE_URL}/validate_user`);
      
      console.log("Fetched validation data:", res.data);
      setValidationData(res.data);
      return res.data;
    } catch (error) {
      console.error("Error fetching validation data:", error);
      // More helpful error messaging
      if (error instanceof Error && error.message.includes("Cross-Origin")) {
        console.error("CORS issue detected: Try removing withCredentials or configuring server CORS properly");
      }
      
      setValidationData({ status: "error" });
      return null;
    }
  }, [validationData, isAuthenticated]);

  const fetchOperationalSettings = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force || false;
    
    // Skip if we already have data and aren't forcing
    if (!force && operationalSettings !== null) {
      return operationalSettings;
    }
    
    // Skip if not authenticated - now using the correct property check
    if (!isAuthenticated) {
      console.log("Skipping operational settings fetch - not authenticated");
      return null;
    }
    
    try {
      const res = await axios.get(`${API_BASE_URL}/get_operational_settings`);
      console.log("Fetched operational settings:", res.data);
      setOperationalSettings(res.data);
      return res.data;
    } catch (error) {
      console.error("Error fetching operational settings:", error);
      return null;
    }
  }, [operationalSettings, isAuthenticated]);

  // Function to refresh all data - useful after login/authentication
  const refreshAllData = useCallback(async () => {
    console.log("Refreshing all data");
    const auth = await fetchAuthStatus({ force: true });
    
    // If authenticated based on the actual response structure
    if (auth?.status === "success" && auth?.message === "User authenticated") {
      await Promise.all([
        fetchUserInfo({ force: true }),
        fetchValidationData({ force: true }),
        fetchOperationalSettings({ force: true })
      ]);
      
      await fetchBotChannelStatus({ force: true });
    }
  }, [fetchAuthStatus, fetchUserInfo, fetchValidationData, fetchOperationalSettings, fetchBotChannelStatus]);

  // Only check auth status on initial load
  useEffect(() => {
    if (!initialAuthCheckDone) {
      console.log("Performing initial auth check");
      fetchAuthStatus().then(() => {
        setInitialAuthCheckDone(true);
      });
    }
  }, [fetchAuthStatus, initialAuthCheckDone]);

  // When auth status changes to authenticated, fetch dependent data
  useEffect(() => {
    if (isAuthenticated && initialAuthCheckDone) {
      console.log("Auth status is authenticated, fetching dependent data");
      fetchUserInfo();
      fetchOperationalSettings();
      fetchValidationData();
    }
  }, [isAuthenticated, initialAuthCheckDone, fetchUserInfo, fetchOperationalSettings, fetchValidationData]);

  return (
    <BackendDataContext.Provider
      value={{
        authStatus,
        userInfo,
        botChannelStatus,
        botChannelStatusLoading,
        validationData,
        operationalSettings,
        isOnboardingComplete,
        isAuthenticated,
        fetchAuthStatus,
        fetchUserInfo,
        fetchBotChannelStatus,
        fetchValidationData,
        fetchOperationalSettings,
        refreshAllData,
      }}
    >
      {children}
    </BackendDataContext.Provider>
  );
};

export const useBackendData = () => useContext(BackendDataContext); 