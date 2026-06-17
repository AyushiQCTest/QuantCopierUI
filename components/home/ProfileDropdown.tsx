"use client";

import { useEffect, useState, useContext, useRef } from "react";
import axios from "axios";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { User, Key, Clock, Check, X, Phone } from "lucide-react";
import { ThemeContext } from "@/lib/theme-config";

// Cache with explicit types
let cachedTelegramDetails: TelegramDetails | null = null;
let cachedLicenses: License[] | null = null;
let cachedSelectedLicense: string | null = null;

interface TelegramDetails {
  username?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profilePhotoUrl?: string;
}

interface License {
  licenseKey: string;
  productType: string;
  subscriptionType: string;
  expirationDate: string;
  status: "active" | "expired";
}

export default function ProfileDropdown() {
  const [telegramDetails, setTelegramDetails] = useState<TelegramDetails>(
    cachedTelegramDetails || {}
  );
  const [licenses, setLicenses] = useState<License[]>(cachedLicenses || []);
  const [selectedLicense, setSelectedLicense] = useState<string | null>(
    cachedSelectedLicense || null
  );
  const [loading, setLoading] = useState(!cachedTelegramDetails || !cachedLicenses);
  const [activeTab, setActiveTab] = useState<'profile' | 'licenses'>('profile');
  const [profileImageError, setProfileImageError] = useState(false);
  const { theme } = useContext(ThemeContext);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (
      hasFetched.current &&
      cachedTelegramDetails &&
      cachedLicenses &&
      cachedSelectedLicense !== null
    ) {
      setTelegramDetails(cachedTelegramDetails);
      setLicenses(cachedLicenses);
      setSelectedLicense(cachedSelectedLicense);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch Telegram details
        if (!cachedTelegramDetails) {
          const telegramRes = await axios.get<TelegramDetails>(
            "http://localhost:8000/get_user_info"
          );
          cachedTelegramDetails = telegramRes.data;
          setTelegramDetails(telegramRes.data);
        }

        // Fetch licenses
        if (!cachedLicenses) {
          const licenseRes = await axios.get("http://localhost:8000/validate_user");
          const licensesObj = licenseRes.data.licenseInfo || {};
          const licensesArray: License[] = Object.keys(licensesObj).map((licenseKey) => {
            const details = licensesObj[licenseKey];
            const expirationDate = details.expirationDate || "";
            const status = expirationDate
              ? new Date(expirationDate) > new Date()
                ? "active"
                : "expired"
              : "active";
            return {
              licenseKey,
              productType: details.productType,
              subscriptionType: expirationDate ? "dated" : "lifetime",
              expirationDate,
              status, // Explicitly typed as "active" | "expired"
            };
          });
          cachedLicenses = licensesArray;
          setLicenses(licensesArray);
        }

        // Fetch selected license from MT5 config
        if (cachedSelectedLicense === null) {
          const mt5Res = await axios.get("http://localhost:8000/mt5/get_mt5_credentials");
          cachedSelectedLicense = mt5Res.data?.license_key || null;
          setSelectedLicense(cachedSelectedLicense);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
        hasFetched.current = true;
      }
    };

    fetchData();
  }, []);

  const fullName =
    telegramDetails.firstName && telegramDetails.lastName
      ? `${telegramDetails.firstName} ${telegramDetails.lastName}`
      : telegramDetails.firstName || "Not set";

  const getDropdownStyles = () => ({
    root: theme === "dark" ? "bg-black border border-gray-800" : "bg-white border border-gray-200",
    header:
      theme === "dark"
        ? "bg-gradient-to-r from-blue-900 to-blue-800 border-b border-gray-700"
        : "bg-gradient-to-r from-blue-200 to-blue-300 border-b border-gray-200",
    tabBorder: theme === "dark" ? "border-gray-700" : "border-gray-200",
    tabActive: theme === "dark" ? "text-blue-400 border-b-2 border-blue-400" : "text-blue-600 border-b-2 border-blue-600",
    tabInactive: theme === "dark" ? "text-gray-400" : "text-gray-600",
    contentBg: theme === "dark" ? "bg-gray-900 bg-opacity-50" : "bg-gray-100 bg-opacity-50",
    textPrimary: theme === "dark" ? "text-white" : "text-gray-900",
    textSecondary: theme === "dark" ? "text-gray-300" : "text-gray-600",
    textTertiary: theme === "dark" ? "text-gray-400" : "text-gray-500",
    footerBorder: theme === "dark" ? "border-t border-gray-700" : "border-t border-gray-200",
    buttonBg: theme === "dark" ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-500 hover:bg-blue-600",
  });

  const styles = getDropdownStyles();

  const renderProfileImage = () => {
    if (telegramDetails.profilePhotoUrl && !profileImageError) {
      return (
        <div className="w-12 h-12 rounded-full overflow-hidden">
          <Image
            src={`http://localhost:8000${telegramDetails.profilePhotoUrl}`}
            alt="Profile"
            width={48}
            height={48}
            className="w-full h-full object-cover"
            onError={() => setProfileImageError(true)}
            priority={true}
          />
        </div>
      );
    } else {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center">
          <User className="w-6 h-6 text-white" />
        </div>
      );
    }
  };

  const renderLicense = (license: License) => (
    <div className={`p-2 rounded ${styles.contentBg}`}>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center space-x-1">
          <Key className="w-3 h-3 text-blue-400" />
          <span className="text-xs font-medium text-blue-300">{license.productType}</span>
        </div>
        <div className="flex items-center space-x-1">
          {license.status === "active" ? (
            <Check className="w-3 h-3 text-green-500" />
          ) : (
            <X className="w-3 h-3 text-red-500" />
          )}
          <span className={`text-xs ${license.status === "active" ? "text-green-500" : "text-red-500"}`}>
            {license.status}
          </span>
        </div>
      </div>
      <p className={styles.textSecondary}>{license.licenseKey}</p>
      <div className="flex items-center mt-1 space-x-1">
        <Clock className="w-3 h-3 text-gray-400" />
        <span className={styles.textTertiary}>
          {license.subscriptionType === "lifetime"
            ? "Lifetime"
            : `Expires: ${new Date(license.expirationDate).toLocaleDateString()}`}
        </span>
      </div>
    </div>
  );

  return (
    <div
      className={`absolute right-0 top-full mt-2 w-72 ${styles.root} rounded-lg shadow-2xl z-50 overflow-hidden`}
    >
      {/* User Profile Header */}
      <div className={`p-3 ${styles.header}`}>
        <div className="flex items-center space-x-3">
          {renderProfileImage()}
          <div>
            <h3 className={styles.textPrimary}>{fullName}</h3>
            <p className={`text-xs ${styles.textSecondary}`}>
              @{telegramDetails.username || "not_set"}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={`flex ${styles.tabBorder}`}>
        <button
          className={`flex-1 py-2 text-sm font-medium ${
            activeTab === "profile" ? styles.tabActive : styles.tabInactive
          }`}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium ${
            activeTab === "licenses" ? styles.tabActive : styles.tabInactive
          }`}
          onClick={() => setActiveTab("licenses")}
        >
          Licenses
        </button>
      </div>

      <Card className="bg-transparent border-0 shadow-none">
        <CardContent className="p-4">
          {activeTab === "profile" && (
            <div className="space-y-3">
              <div className={`flex items-center space-x-2 p-2 rounded ${styles.contentBg}`}>
                <User className="w-4 h-4 text-blue-400" />
                <div className="flex-1">
                  <p className={styles.textTertiary}>Full Name</p>
                  <p className={styles.textPrimary}>{fullName}</p>
                </div>
              </div>
              <div className={`flex items-center space-x-2 p-2 rounded ${styles.contentBg}`}>
                <Phone className="w-4 h-4 text-blue-400" />
                <div className="flex-1">
                  <p className={styles.textTertiary}>Phone Number</p>
                  <p className={styles.textPrimary}>{telegramDetails.phoneNumber || "Not set"}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "licenses" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-blue-400">Active License</h3>
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : selectedLicense ? (
                licenses.length > 0 &&
                renderLicense(
                  licenses.find((l) => l.licenseKey === selectedLicense) || {
                    licenseKey: selectedLicense,
                    productType: "Unknown",
                    subscriptionType: "unknown",
                    expirationDate: "",
                    status: "active",
                  }
                )
              ) : (
                <p className={styles.textTertiary}>No license selected</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className={`${styles.footerBorder}`}>
        <a
          href="https://quanttradertools.vercel.app/login"
          target="_blank"
          rel="noopener noreferrer" 
          className={`block w-full py-2 ${styles.buttonBg} text-white text-sm font-medium rounded transition-colors text-center`}
        >
          Client Dashboard
        </a>
      </div>
    </div>
  );
}