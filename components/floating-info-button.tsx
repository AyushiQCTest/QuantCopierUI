"use client";

import { useState, useContext } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AboutModal } from "@/components/about-modal";
import { ThemeContext } from "@/lib/theme-config";

export function FloatingInfoButton() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const { theme } = useContext(ThemeContext);

  return (
    <>
      {/* Floating Info Button */}
      <button
        onClick={() => setAboutOpen(true)}
        className={`fixed bottom-6 left-6 z-40 p-3 rounded-full shadow-lg transition-all hover:scale-110 ${
          theme === "dark"
            ? "bg-blue-600 hover:bg-blue-700 text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
        title="About QuantCopier (Info & Updates)"
        aria-label="Open info and updates"
      >
        <Info className="w-6 h-6" />
      </button>

      {/* About Modal */}
      <AboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
