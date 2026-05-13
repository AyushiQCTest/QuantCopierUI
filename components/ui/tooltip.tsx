"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

const TooltipProvider = TooltipPrimitive.Provider
const TooltipRoot = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger
const TooltipContent = TooltipPrimitive.Content

export interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode | null
}

export function Tooltip({ children, content }: TooltipProps) {
  if (!content) return <>{children}</>

  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent 
          className="z-50 overflow-hidden rounded-md bg-black px-3 py-1.5 text-xs text-white"
          sideOffset={5}
        >
          {content}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
} 