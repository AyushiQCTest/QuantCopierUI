"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

interface TwoStepFormProps {
  onSubmit: (password: string) => void
  loading?: boolean
}

export function TwoStepForm({ onSubmit, loading }: TwoStepFormProps) {
  const [password, setPassword] = useState("")
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(password)
  }
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus(); // Autofocus on mount
    }
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password" className="dark:text-white">Two-Step Verification Password</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} ref={inputRef} className="dark:text-white" required />
      </div>
      <Button type="submit" className="w-full dark:text-black dark:bg-white" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            loading...
          </>
        ) : (
          "Login"
        )}
      </Button>
    </form>
  )
}


