"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { FaTelegram } from "react-icons/fa";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { useRouter } from "next/navigation";

interface Step2AlertsProps {
  onNext: () => void;
  onBack: () => void;
  theme?: string;
  isRevisit: boolean;
}

interface Channel {
  id: string;
  name: string;
  selected?: boolean;
}

const API_BASE_URL = "http://localhost:8000";

export default function Step2Alerts({ onNext, onBack, theme, isRevisit }: Step2AlertsProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    const initChannels = async () => {
      setLoading(true);
      try {
        const channelsRes = await axios.get(`${API_BASE_URL}/get_channels`);
        const channelsData = channelsRes.data.data || {};
        const formattedChannels = Object.entries(channelsData).map(
          ([id, name]) => ({
            id,
            name: name as string,
            selected: false,
          })
        );

        const savedChannelsRes = await axios.get(`${API_BASE_URL}/get_selected_channels`);
        const savedChannelsData = savedChannelsRes.data.data || {};
        const selectedChannelIds = Object.keys(savedChannelsData);

        const updatedChannels = formattedChannels.map((channel) => ({
          ...channel,
          selected: selectedChannelIds.includes(channel.id),
        }));

        setChannels(updatedChannels);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch channels or saved selections",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    initChannels();
  }, [toast]);

  const handleSave = async () => {
    const selectedChannels = channels.filter((ch) => ch.selected);
    if (selectedChannels.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one channel",
        variant: "destructive",
      });
      return;
    }

    try {
      const channelData = selectedChannels.map((ch) => ({
        id: ch.id,
        Channel_Name: ch.name,
      }));

      await axios.post(`${API_BASE_URL}/save_channels`, channelData);
      onNext();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save channel configuration",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {!isRevisit && (
        <div className="space-y-2">
          <h2 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Alerts Channel Setup
          </h2>
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            Configure your Telegram channel for receiving alerts
          </p>
        </div>
      )}

      <div className="space-y-6">
        <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} p-6 rounded-lg space-y-4`}>
          <div className="flex items-start space-x-4">
            <div className={`${theme === 'dark' ? 'bg-black' : 'bg-gray-50'} p-3 rounded-full flex-shrink-0 relative`}>
              <FaTelegram className={`w-6 h-6 ${theme === 'dark' ? 'text-[#22c55e]' : 'text-gray-600'} z-10`} />
            </div>
            <div className="flex-1">
              <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>
                Select Channels
              </h3>
              {loading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className={theme === 'dark' ? 'text-sm text-gray-400' : 'text-sm text-gray-600'}>
                    Loading channels...
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {channels.map((channel) => (
                    <div key={channel.id} className="flex items-center space-x-2">
                      <Checkbox
                        checked={channel.selected}
                        onCheckedChange={(checked) => {
                          setChannels(
                            channels.map((ch) =>
                              ch.id === channel.id
                                ? { ...ch, selected: !!checked }
                                : ch
                            )
                          );
                        }}
                      />
                      <span className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>{channel.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={isRevisit ? "flex justify-center" : "flex justify-between"}>
        {isRevisit ? (
          <Button onClick={handleSave}>Save</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onBack}>
              Previous Step
            </Button>
            <Button onClick={handleSave}>Next Step</Button>
          </>
        )}
      </div>
    </div>
  );
}