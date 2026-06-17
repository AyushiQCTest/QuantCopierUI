"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { Loader2, Trash2, Pencil } from "lucide-react";

interface Channel {
  id: string;
  name: string;
}

interface Step2ChannelSelectProps {
  onNext: () => void;
  onBack: () => void;
  theme?: string;
  isRevisit: boolean;
}

const API_BASE_URL = "http://localhost:8000";

export default function Step2ChannelSelect({ onNext, onBack, theme, isRevisit }: Step2ChannelSelectProps) {
  const [channels, setChannels] = useState<{ [key: string]: string }>({});
  const [newChannelId, setNewChannelId] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editedChannelName, setEditedChannelName] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDiscordChannels();
  }, []);

  const fetchDiscordChannels = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/discord/channels`);
      if (response.status === 200) {
        setChannels(response.data.data);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch Discord channels",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!newChannelId) {
      toast({
        title: "Missing Information",
        description: "Channel ID is required",
        variant: "destructive",
      });
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/discord/channels/save`, {
        channel_id: newChannelId,
        channel_name: newChannelName || `Channel ${newChannelId}`
      });

      setChannels(prev => ({
        ...prev,
        [newChannelId]: newChannelName || `Channel ${newChannelId}`
      }));

      setNewChannelId("");
      setNewChannelName("");
      
      toast({
        title: "Success",
        description: "Channel added successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add channel",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (channelId: string) => {
    try {
      await axios.delete(`${API_BASE_URL}/discord/channels/delete/${channelId}`);
      const updatedChannels = { ...channels };
      delete updatedChannels[channelId];
      setChannels(updatedChannels);
      toast({
        title: "Success",
        description: "Channel removed successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove channel",
        variant: "destructive",
      });
    }
  };

  const getThemeStyles = () => ({
    container: theme === "dark" ? "text-white" : "text-gray-900",
    card: theme === "dark" ? "bg-black border-gray-800" : "bg-white border-gray-200",
    textSecondary: theme === "dark" ? "text-gray-400" : "text-gray-600",
    buttonPrimary: theme === "dark" 
      ? "bg-blue-600 hover:bg-blue-700 text-white" 
      : "bg-blue-600 hover:bg-blue-700 text-white",
    buttonOutline: theme === "dark"
      ? "border-gray-700 hover:bg-gray-800 text-white"
      : "border-gray-300 hover:bg-gray-100 text-gray-900",
    input: theme === "dark"
      ? "bg-gray-800 border-gray-700 text-white"
      : "bg-white border-gray-200 text-gray-900",
    table: theme === "dark" ? "bg-gray-800" : "bg-gray-100",
    tableBorder: theme === "dark" ? "border-gray-700" : "border-gray-200",
  });

  const styles = getThemeStyles();

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className={`text-2xl font-semibold ${styles.container}`}>
          Configure Discord Channels
        </h2>
        <p className={styles.textSecondary}>
          Add the Discord channels you want to monitor for trading signals.
        </p>
      </div>

      <div className={`max-h-96 overflow-y-auto ${styles.table} p-4 rounded-lg`}>
        <table className="w-full">
          <thead>
            <tr>
              <th className={`text-left p-2 ${styles.container}`}>Channel ID</th>
              <th className={`text-left p-2 ${styles.container}`}>Channel Name (Optional)</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(channels).map(([id, name]) => (
              <tr key={id} className={`border-t ${styles.tableBorder}`}>
                <td className={`p-2 ${styles.container}`}>{id}</td>
                <td className={`p-2 ${styles.container}`}>{name}</td>
                <td className="p-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className={styles.container}>Channel ID</Label>
            <Input
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              className={styles.input}
              placeholder="Enter Discord channel ID"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className={styles.container}>Channel Name (Optional)</Label>
            <Input
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              className={styles.input}
              placeholder="Enter a friendly name for the channel"
            />
          </div>
        </div>
        <div className="flex justify-center">
          <Button onClick={handleAddChannel} className={styles.buttonPrimary}>
            <span className="text-xl mr-2">+</span> Add Channel
          </Button>
        </div>
      </div>

      <div className={isRevisit ? "flex justify-center" : "flex justify-between"}>
        {isRevisit ? (
          <Button onClick={onNext} className={styles.buttonPrimary}>
            Save Changes
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onBack} className={styles.buttonOutline}>
              Previous Step
            </Button>
            <Button onClick={onNext} className={styles.buttonPrimary}>
              Continue
            </Button>
          </>
        )}
      </div>
    </div>
  );
}