"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface PhoneFormProps {
  onSubmit: (phone: string) => void;
  loading?: boolean;
  onPhoneChange?: (phone: string) => void;
}

export function PhoneForm({ onSubmit, loading, onPhoneChange }: PhoneFormProps) {
  const [phone, setPhone] = useState("");
  const [isValid, setIsValid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validatePhoneNumber = (value: string) => {
    // Basic validation for international phone number format
    // Must start with + and contain 8-15 digits total
    const phoneRegex = /^\+[1-9]\d{7,14}$/;
    return phoneRegex.test(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onSubmit(phone);
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    console.log("State updated - Phone:", phone, "IsValid:", isValid, "Loading:", loading, "Button disabled:", loading || !isValid);
  }, [phone, isValid, loading]);

  useEffect(() => {
    setIsValid(validatePhoneNumber(phone));
  }, [phone]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const valid = validatePhoneNumber(value);
    
    setPhone(value);
    setIsValid(valid);    
    
    // Only call onPhoneChange with validated phone number
    if (onPhoneChange && valid) {
      onPhoneChange(value);
    }
  };

  // console.log("Render - Final state:", { phone, isValid, loading, buttonDisabled: loading || !isValid });
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="phone" className="dark:text-white">
          Phone Number
        </Label>
        <Input
          ref={inputRef}
          id="phone"
          type="tel"
          placeholder="Enter mobile with country code. Eg: +1xxxxxxxxxx"
          value={phone}
          onChange={handleChange}
          required
          disabled={loading}
          className={`text-black dark:text-white ${!isValid && phone ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
        />
        {phone && !isValid && (
          <p className="text-sm text-red-500">
            Please enter a valid phone number with country code (e.g., +1xxxxxxxxxx)
          </p>
        )}
      </div>
      <Button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        disabled={loading || !isValid}
      >
        {loading ? "Sending Code..." : "Send Code"}
      </Button>
    </form>
  );
}
