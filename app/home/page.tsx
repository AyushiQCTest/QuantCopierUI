"use client";
import { useState, useContext, useEffect } from "react";
import HomeDashboard from "@/components/home/HomeDashboard";
import Sidebar from "@/components/home/Sidebar";
import EnhancedHeader from "@/components/home/EnhancedHeader";
import { ThemeContext } from "@/lib/theme-config";

export default function HomePage() {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const { theme } = useContext(ThemeContext);
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const reloaded = localStorage.getItem("homePageReloaded");
      if (!reloaded) {
        localStorage.setItem("homePageReloaded", "true");
        window.location.reload();
      }
    }
  }, []);
  
  return (
    <div className={`min-h-screen ${
      theme === 'dark' 
        ? 'bg-gradient-to-b from-black to-gray-900 text-white' 
        : 'bg-gradient-to-b from-white to-gray-100 text-black'
    }`}>
      <EnhancedHeader toggleSidebar={() => setSidebarExpanded(!sidebarExpanded)} />
      <Sidebar
        expanded={sidebarExpanded}
        onClose={() => setSidebarExpanded(false)}
        currentStep={null}
      />
     
      {/* Main Content */}
      <main className="pt-[88px] px-6">
        <HomeDashboard />
      </main>

      {/* Overlay when sidebar is expanded */}
      {sidebarExpanded && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarExpanded(false)}
        />
      )}
    </div>
  );
}