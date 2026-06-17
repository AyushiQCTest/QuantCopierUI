"use client";

import { useEffect, useState, useContext, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBackendData } from "@/src/context/BackendDataContext";
import { ThemeContext } from "@/lib/theme-config";

interface License {
  licenseKey: string;
  productType: string;
  subscriptionType: string;
  expirationDate: string;
  status: "active" | "expired";
}

interface MT5Account {
  accountNr: number;
  server: string;
  licenseKey?: string;
  comment?: string;
  magic_number?: string;
}

interface Step1MT5Props {
  onNext: () => void;
  onBack?: () => void;
  theme?: string;
  isRevisit: boolean;
}

const API_BASE_URL = "http://localhost:8000";

export default function Step1MT5({ onNext, onBack, theme, isRevisit }: Step1MT5Props) {
  const { toast } = useToast();
  const [initialLoading, setInitialLoading] = useState(true);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [selectedLicense, setSelectedLicense] = useState<string>("");
  const [mt5Accounts, setMt5Accounts] = useState<MT5Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [noAccountsError, setNoAccountsError] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    server: "",
    comment: "",
    magic_number: "",
  });
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { theme: contextTheme } = useContext(ThemeContext);
  const activeTheme = theme || contextTheme;
  // Keep track of whether we've attempted to fetch data
  const [dataFetchAttempted, setDataFetchAttempted] = useState(false);
  
  // Use the validation data from context
  const { validationData, fetchValidationData } = useBackendData();

  const fetchAccounts = useCallback(async (licenseKey: string, prefilledAccount?: number | null) => {
    setNoAccountsError(false);
    setAccountsLoading(true);
    setMt5Accounts([]);
    setSelectedAccount(null);

    try {
      console.log(`Fetching accounts for license: ${licenseKey}`);
      const res = await axios.get(`${API_BASE_URL}/mt5/get_mt5_accounts?license_key=${licenseKey}`);
      console.log(`Received accounts for license ${licenseKey}:`, res.data);
      
      const accountsList = res.data.accounts || [];
      setMt5Accounts(accountsList);

      if (accountsList.length > 0) {
        let accountToSelect = accountsList[0].accountNr;
        if (prefilledAccount) {
          const accountMatch = accountsList.find(
            (acc: MT5Account) => acc.accountNr === prefilledAccount
          );
          accountToSelect = accountMatch ? accountMatch.accountNr : accountsList[0].accountNr;
        }
        setSelectedAccount(accountToSelect);
        
        // Only set server from account if not in revisit mode
        if (!isRevisit) {
          const selectedAcc = accountsList.find((acc: MT5Account) => acc.accountNr === accountToSelect);
          setFormData((prev) => ({
            ...prev,
            server: selectedAcc?.server || prev.server,
          }));
        }
      } else {
        setNoAccountsError(true);
      }
    } catch (error) {
      console.error(`Error fetching MT5 accounts for license ${licenseKey}:`, error);
      toast({
        title: "Error",
        description: "Failed to fetch MT5 accounts",
        variant: "destructive",
        duration: 2000,
      });
      setNoAccountsError(true);
    } finally {
      setAccountsLoading(false);
    }
  }, [toast, isRevisit]);

  useEffect(() => {
    console.log("Step1MT5 useEffect triggered, validationData:", validationData);
    
    const loadValidationData = async () => {
      // Only attempt to fetch data once
      if (!dataFetchAttempted) {
        setDataFetchAttempted(true);
        
        try {
          // First check if we're authenticated
          console.log("Checking authentication status");
          const authResult = await axios.get(`${API_BASE_URL}/auth_status`);
          
          if (authResult.data?.status !== "success" || authResult.data?.message !== "User authenticated") {
            console.log("Not authenticated yet, waiting before fetching validation data");
            setInitialLoading(false);
            toast({
              title: "Authentication Required",
              description: "Please log in to access this feature",
              variant: "destructive",
              duration: 3000,
            });
            return; // Exit if not authenticated
          }

          // Fetch MT5 credentials first to get the server value
          try {
            const mt5Res = await axios.get(`${API_BASE_URL}/mt5/get_mt5_credentials`);
            if (mt5Res.status === 200 && mt5Res.data) {
              const configData = mt5Res.data;
              setFormData(prev => ({
                ...prev,
                server: configData.server || "",
                password: configData.password || "",
                comment: configData.comment || "",
                magic_number: configData.magic_number || "",
              }));
            }
          } catch (error) {
            console.error("Error fetching MT5 credentials:", error);
          }
          
          // Continue with validation data fetch...
          console.log("Directly fetching validation data");
          const validationResponse = await axios.get(`${API_BASE_URL}/validate_user`);
          
          if (validationResponse.data) {
            // Process the validation data
            const validationDataDirect = validationResponse.data;
            
            if (validationDataDirect.status === "error") {
              console.log("Validation data has error status");
              toast({
                title: "Error",
                description: "Could not validate user. Please try again later.",
                variant: "destructive",
                duration: 3000,
              });
              setInitialLoading(false);
              return;
            }
            
            // Extract the valid licenses from the licenseInfo structure
            const validLicenseInfo = validationDataDirect.licenseInfo || {};
            
            console.log('License info structure:', JSON.stringify(validLicenseInfo, null, 2));
            console.log('Found license keys:', Object.keys(validLicenseInfo).length);
            
            const licensesArray: License[] = Object.keys(validLicenseInfo)
              .filter(licenseKey => {
                // Filter by product type - only include QuantCopier Telegram products
                const details = validLicenseInfo[licenseKey];
                return details.productType && details.productType.startsWith("QuantCopierMT5Telegram");
              })
              .map((licenseKey) => {
                const details = validLicenseInfo[licenseKey];
                console.log(
                  `License: ${licenseKey}, ProductType: ${details.productType}, Expiration: ${details.expirationDate}`
                );
                const expirationDate = details.expirationDate || "";
                const status =
                  expirationDate === ""
                    ? "active"
                    : new Date(expirationDate) > new Date()
                    ? "active"
                    : "expired";
                return {
                  licenseKey,
                  productType: details.productType,
                  subscriptionType: details.subscriptionType || (expirationDate ? "dated" : "lifetime"),
                  expirationDate,
                  status: status as "active" | "expired",
                };
              });
            
            const activeLicenses = licensesArray.filter((license) => license.status === "active");
            
            console.log('Active licenses found:', activeLicenses.length);
            
            if (activeLicenses.length === 0) {
              toast({
                title: "No Active Licenses",
                description: "No active subscriptions found. Please check your account.",
                variant: "destructive",
                duration: 3000,
              });
              setLicenses([]);
              setInitialLoading(false);
              return;
            }
            
            // Update the licenses state
            setLicenses(activeLicenses);
            
            // Also update the context for future use
            fetchValidationData({ force: false });
            
            let prefilledLicense = "";
            let prefilledAccount = null;
            
            // Only fetch MT5 credentials if revisiting
            if (isRevisit) {
              try {
                const mt5Res = await axios.get(`${API_BASE_URL}/mt5/get_mt5_credentials`);
                if (mt5Res.status === 200 && mt5Res.data) {
                  const configData = mt5Res.data;
                  console.log("Saved config data:", configData);
                  
                  const licenseExists = activeLicenses.some(
                    (license) => license.licenseKey === configData.license_key
                  );
                  if (licenseExists) {
                    prefilledLicense = configData.license_key;
                    prefilledAccount = Number(configData.account);
                    setFormData({
                      password: configData.password || "",
                      server: configData.server || "",
                      comment: configData.comment || "",
                      magic_number: configData.magic_number || "",
                    });
                  }
                }
              } catch (error) {
                console.error("Error fetching MT5 credentials:", error);
                // Non-fatal error, continue processing
              }
            }
            
            if (!prefilledLicense && activeLicenses.length > 0) {
              prefilledLicense = activeLicenses[0].licenseKey;
            }
            setSelectedLicense(prefilledLicense);
            
            if (prefilledLicense) {
              try {
                await fetchAccounts(prefilledLicense, prefilledAccount);
                if (isRevisit && prefilledAccount) {
                  setSelectedAccount(prefilledAccount);
                }
              } catch (error) {
                console.error("Error fetching accounts:", error);
                // Non-fatal error
              }
            }
          }
        } catch (error) {
          console.error("Failed during authentication or data loading:", error);
          toast({
            title: "Connection Error",
            description: "Could not connect to server. Please try again.",
            variant: "destructive",
            duration: 3000,
          });
        } finally {
          setInitialLoading(false);
        }
      }
    };
    
    // Add a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (initialLoading) {
        console.log("Loading timeout reached, stopping auto-reload to prevent loop");
        setInitialLoading(false);
        toast({
          title: "Connection Issue",
          description: "Could not load subscription data. Please refresh the page manually.",
          variant: "destructive",
          duration: 3000,
        });
      }
    }, 5000); // 5 seconds timeout
    
    // Only load data if we're still in initial loading state
    if (initialLoading) {
      loadValidationData();
    }
    
    return () => clearTimeout(timeoutId);
  }, [initialLoading, isRevisit, fetchAccounts, fetchValidationData, toast, dataFetchAttempted, validationData]);

  useEffect(() => {
    if (selectedLicense && !initialLoading) {
      console.log(`License selection changed to: ${selectedLicense}`);
      fetchAccounts(selectedLicense);
    }
  }, [selectedLicense, initialLoading, fetchAccounts]);

  const formatLicenseDisplay = (license: License) => {
    const subscriptionTypeFormatted = license.subscriptionType
      .replace("half-yearly", "Half-Yearly")
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    const base = `${license.productType} (${subscriptionTypeFormatted}) - ${license.licenseKey}`;
    if (license.subscriptionType === "lifetime") {
      return base;
    }
    if (license.expirationDate) {
      const expiryDate = new Date(license.expirationDate);
      return `${base} - Expires ${expiryDate.toLocaleDateString()}`;
    }
    return base;
  };

  const handleSubmit = async () => {
    if (!selectedAccount || !formData.password || !formData.server) {
      toast({
        title: "Missing Information",
        description: "Please fill all required fields",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const payload = {
      account: selectedAccount,
      password: formData.password,
      server: formData.server,
      license_key: selectedLicense,
      comment: formData.comment || undefined,
      magic_number: formData.magic_number || undefined,
    };
    console.log("Payload sent to /mt5/save:", payload);

    try {
      await axios.post(`${API_BASE_URL}/mt5/save`, payload);
      toast({
        title: "Success",
        description: "MT5 configuration saved successfully",
        duration: 3000,
      });
      onNext();
    } catch (error) {
      console.error("Error saving MT5 configuration:", error);
      toast({
        title: "Error",
        description: "Failed to save MT5 configuration",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleAccountSelection = (accountNr: number) => {
    console.log("Selecting account:", accountNr);
    const selectedAcc = mt5Accounts.find((acc) => Number(acc.accountNr) === accountNr);
    console.log("Found account details:", selectedAcc);
    setSelectedAccount(accountNr);
    
    // Always update server when account selection changes
    if (selectedAcc) {
      setFormData((prev) => ({
        ...prev,
        server: selectedAcc.server || prev.server,
      }));
    }
  };

  const handleLicenseChange = (licenseKey: string) => {
    console.log(`Changing license to: ${licenseKey}`);
    setSelectedLicense(licenseKey);
    setSelectedAccount(null);
    
    // Only reset server if not in revisit mode
    if (!isRevisit) {
      setFormData((prev) => ({
        ...prev,
        server: "",
      }));
    }
  };

  const autoFill = licenses.length === 1 && mt5Accounts.length === 1 && !accountsLoading;

  const getThemeStyles = () => ({
    container: activeTheme === "dark" ? "text-white" : "text-gray-900",
    textSecondary: activeTheme === "dark" ? "text-gray-400" : "text-gray-600",
    buttonPrimary:
      activeTheme === "dark" ? "bg-[#22c55e] hover:bg-[#1ea54d] text-white" : "bg-blue-500 hover:bg-blue-600 text-white",
    buttonDisabled: activeTheme === "dark" ? "bg-gray-600 text-gray-400" : "bg-gray-300 text-gray-500",
    input: activeTheme === "dark" ? "text-white bg-gray-800 border-gray-600" : "text-gray-900 bg-white border-gray-200",
    select: activeTheme === "dark" ? "bg-black text-white border-gray-600" : "bg-white text-gray-900 border-gray-200",
    alert: activeTheme === "dark" ? "bg-red-900 text-red-200" : "bg-red-100 text-red-800",
    card: activeTheme === "dark" ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-200",
  });

  const styles = getThemeStyles();

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2
          className={`h-8 w-8 animate-spin ${activeTheme === "dark" ? "text-[#22c55e]" : "text-blue-500"}`}
        />
        <span className={`ml-2 ${styles.container}`}>Loading subscriptions...</span>
      </div>
    );
  }

  if (licenses.length === 0) {
    return (
      <div className="text-center p-6">
        <h3 className={`text-lg font-medium ${styles.container}`}>
          No Active Subscriptions Found
        </h3>
        <p className={styles.textSecondary}>
          Please contact support if you believe this is an error
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className={`text-2xl font-semibold ${styles.container}`}>
          MT5 Configuration
        </h2>
        <p className={styles.textSecondary}>
          Link your MT5 account to your subscription. Manage your MT5 accounts in the <a href="https://quanttradertools.vercel.app/login" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600">Client Dashboard</a>
        </p>
      </div>

      <div className="space-y-4">
        {autoFill ? (
          <div className={`p-4 border rounded ${styles.card}`}>
            <div className="mb-4">
              <Label className={styles.container}>Active Subscription</Label>
              <Input
                value={formatLicenseDisplay(licenses[0])}
                disabled
                className={styles.input}
              />
            </div>
            <div className="mb-4">
              <Label className={styles.container}>Linked MT5 Account</Label>
              <Input
                value={`${mt5Accounts[0].server} - #${mt5Accounts[0].accountNr}`}
                disabled
                className={styles.input}
              />
            </div>
          </div>
        ) : (
          <>
            <div>
              <Label className={styles.container}>Active Subscriptions</Label>
              <select
                value={selectedLicense || ""}
                onChange={(e) => handleLicenseChange(e.target.value)}
                className={`w-full p-2 border rounded ${styles.select}`}
              >
                <option value="">Select a subscription</option>
                {licenses.map((license) => (
                  <option key={license.licenseKey} value={license.licenseKey}>
                    {formatLicenseDisplay(license)}
                  </option>
                ))}
              </select>
            </div>

            {accountsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2
                  className={`h-6 w-6 animate-spin ${activeTheme === "dark" ? "text-[#22c55e]" : "text-blue-500"}`}
                />
              </div>
            ) : noAccountsError ? (
              <Alert variant="destructive" className={styles.alert}>
                <AlertDescription>
                  No MT5 accounts are associated with this license. Please link an MT5 account first.
                </AlertDescription>
              </Alert>
            ) : (
              selectedLicense &&
              mt5Accounts.length > 0 && (
                <div>
                  <Label className={styles.container}>Linked MT5 Accounts</Label>
                  <select
                    value={selectedAccount !== null ? selectedAccount : ""}
                    onChange={(e) => handleAccountSelection(Number(e.target.value))}
                    className={`w-full p-2 border rounded ${styles.select}`}
                  >
                    <option value="">Select an account</option>
                    {mt5Accounts.map((account) => (
                      <option key={account.accountNr} value={account.accountNr}>
                        {account.server} - #{account.accountNr}
                      </option>
                    ))}
                  </select>
                </div>
              )
            )}
          </>
        )}

        {selectedAccount && (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="accountNumber" className={styles.container}>
                Account Number
              </Label>
              <Input
                id="accountNumber"
                value={selectedAccount}
                disabled
                className={styles.input}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="server" className={styles.container}>
                Server
              </Label>
              <Input
                id="server"
                value={formData.server}
                disabled
                className={styles.input}
              />
            </div>
          </div>
        )}

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="password" className={styles.container}>
              MT5 Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className={styles.input}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${styles.container}`}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment" className={styles.container}>
              Comment (Optional)
            </Label>
            <Input
              id="comment"
              value={formData.comment}
              onChange={(e) =>
                setFormData({ ...formData, comment: e.target.value })
              }
              className={styles.input}
              placeholder="Add a comment for this account"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="magic_number" className={styles.container}>
              Magic Number (Optional)
            </Label>
            <Input
              id="magic_number"
              value={formData.magic_number}
              onChange={(e) =>
                setFormData({ ...formData, magic_number: e.target.value })
              }
              className={styles.input}
              placeholder="Enter magic number"
            />
          </div>
        </div>
      </div>

      <div className={isRevisit ? "flex justify-center" : "flex justify-end"}>
        {isRevisit ? (
          <Button
            onClick={handleSubmit}
            disabled={
              !selectedAccount ||
              !formData.password ||
              !formData.server ||
              noAccountsError ||
              accountsLoading
            }
            className={
              !selectedAccount ||
              !formData.password ||
              !formData.server ||
              noAccountsError ||
              accountsLoading
                ? styles.buttonDisabled
                : styles.buttonPrimary
            }
          >
            Save
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={
              !selectedAccount ||
              !formData.password ||
              !formData.server ||
              noAccountsError ||
              accountsLoading
            }
            className={
              !selectedAccount ||
              !formData.password ||
              !formData.server ||
              noAccountsError ||
              accountsLoading
                ? styles.buttonDisabled
                : styles.buttonPrimary
            }
          >
            Save & Continue
          </Button>
        )}
      </div>
    </div>
  );
}