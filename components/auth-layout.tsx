import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/lib/theme-config"
import { Button } from "@/components/ui/button"
import type React from "react"
import Image from "next/image"

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      {/* Logo container */}
      <div className="mb-8">
        {theme === "dark" ? (
          <Image
            src="/QCT_Logo_Dark.svg"
            alt="QCT Logo"
            width={200}
            height={80}
            priority
          />
        ) : (
          <Image
            src="/QCT_Logo_Light.svg"
            alt="QCT Logo"
            width={200}
            height={80}
            priority
          />
        )}
      </div>
      
      {/* Content */}
      <div className="w-full flex justify-center px-4">
        <Button variant="ghost" size="icon" className="fixed top-4 right-4 dark:bg-gray-900 hover:bg-transparent" onClick={toggleTheme}>
          {theme === "light" ? <Moon className="h-5 w-5 dark:text-white " /> : <Sun className="h-5 w-5 bg-gray-900 text-white" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
        {children}
      </div>
    </div>
  )
}

