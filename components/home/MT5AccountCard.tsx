"use client";

import { useEffect, useState, useContext } from "react";
import axios from "axios";
import { Check, X } from "lucide-react";
import { ThemeContext } from "@/lib/theme-config";
import { Tooltip } from "@/components/ui/tooltip";

interface MT5Credentials {
  account: string;
  server: string;
  password?: string; // Added optional password field
}

interface MT5ValidityResponse {
  status: string;
  isValidAccount: boolean;
  accountDetails?: {
    email?: string;
    balance?: number;
    login?: number;
    type?: string;
    leverage?: number;
  };
}

export default function MT5AccountCard() {
  const [credentials, setCredentials] = useState<MT5Credentials | null>(null);
  const [validity, setValidity] = useState<MT5ValidityResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useContext(ThemeContext);

  useEffect(() => {
    Promise.all([
      axios.get<MT5Credentials>("http://localhost:8000/mt5/get_mt5_credentials"),
      axios.get<MT5ValidityResponse>("http://localhost:8000/mt5/MT5AccountValidityExtCheck"),
    ])
      .then(([credRes, validRes]) => {
        setCredentials(credRes.data);
        setValidity(validRes.data);
        setError(null);
      })
      .catch(async (err) => {
        console.error("Error in initial fetch:", err);
        try {
          const credRes = await axios.get<MT5Credentials>("http://localhost:8000/mt5/get_mt5_credentials");
          setCredentials(credRes.data);
          setValidity(null);
          setError(null);
        } catch (credErr) {
          console.error("Error fetching MT5 credentials:", credErr);
          setCredentials(null);
          setValidity(null);
          setError("MT5 details not set");
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const accountNumber = credentials?.account || "Not set";
  const server = credentials?.server || "Not set";
  const isAuthenticated = credentials !== null && (credentials.password?.length ?? 0) > 0; // Safely handle missing password
  const balance = validity?.accountDetails?.balance;

  return (
    <div
      className={`pt-12 p-6 ${
        theme === "dark" ? "bg-black border-gray-800" : "bg-white border-gray-200"
      } border rounded-lg shadow-lg flex-1`}
    >
      <h2
        className={`text-2xl font-semibold ${
          theme === "dark" ? "text-white" : "text-gray-800"
        } mb-4 text-center`}
      >
        MT5 Account
      </h2>
      {loading ? (
        <p className={`${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className={`${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
              Account Number:
            </span>
            <span className={`${theme === "dark" ? "text-white" : "text-black"}`}>
              {accountNumber}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
              Server:
            </span>
            <span className={`${theme === "dark" ? "text-white" : "text-black"}`}>
              {server}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
              Balance:
            </span>
            <span className={`${theme === "dark" ? "text-white" : "text-black"}`}>
              {balance !== undefined ? `$${balance.toFixed(2)}` : "Not available"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
              Authenticated:
            </span>
            <div className="flex items-center">
              {isAuthenticated ? (
                <Tooltip content={`Password set for MT5 Account ${accountNumber} in config.ini`}>
                  <Check className="w-5 h-5 text-green-500" />
                </Tooltip>
              ) : (
                <X className="w-5 h-5 text-red-500" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}