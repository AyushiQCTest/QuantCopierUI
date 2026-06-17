"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MT5SetupProps {
  onSubmit: (data: any) => void;
}

export default function MT5Setup({ onSubmit }: MT5SetupProps) {
  const [formData, setFormData] = useState({
    server: "",
    login: "",
    password: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">MT5 Account Configuration</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">MT5 Server</label>
          <Input
            type="text"
            value={formData.server}
            onChange={(e) => setFormData(prev => ({ ...prev, server: e.target.value }))}
            placeholder="Enter MT5 server address"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Login ID</label>
          <Input
            type="text"
            value={formData.login}
            onChange={(e) => setFormData(prev => ({ ...prev, login: e.target.value }))}
            placeholder="Enter your MT5 login ID"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <Input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            placeholder="Enter your MT5 password"
            required
          />
        </div>

        <Button type="submit" className="w-full">
          Continue to Discord Setup
        </Button>
      </form>
    </Card>
  );
} 