"use client";
import { useEffect, useState, useContext } from "react";
import axios from "axios";
import { ThemeContext } from "@/lib/theme-config";

interface SelectedChannelsResponse {
  message: string;
  data: { [key: string]: string }; // mapping of channel IDs to channel names
}

export default function SubscribedChannelsCard() {
  const [channels, setChannels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const channelsPerPage = 5; // 5 elements per page
  const { theme } = useContext(ThemeContext);

  useEffect(() => {
    axios
      .get<SelectedChannelsResponse>("http://localhost:8000/get_selected_channels")
      .then((res) => {
        // Extract channel names from the returned data object.
        const selectedChannels = res.data.data;
        const channelNames = Object.values(selectedChannels);
        setChannels(channelNames);
      })
      .catch((err) => {
        console.error("Error fetching subscribed channels:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Calculate pagination
  const totalPages = Math.ceil(channels.length / channelsPerPage);
  const indexOfLastChannel = currentPage * channelsPerPage;
  const indexOfFirstChannel = indexOfLastChannel - channelsPerPage;
  const currentChannels = channels.slice(indexOfFirstChannel, indexOfLastChannel);

  // Handle pagination navigation
  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };
  
  const goToPrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  return (
    <div 
      className={`pt-12 p-6 ${  // Changed from p-6 to pt-12 p-6
        theme === 'dark' ? 'bg-black border-gray-800' : 'bg-white border-gray-200'
      } border rounded-lg shadow-lg flex-1`}
    >
      <h2 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'} mb-4 text-center`}>
        Subscribed Channels
      </h2>
     
      {loading ? (
        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Loading...</p>
      ) : channels.length > 0 ? (
        <>
          <ul className="space-y-2 mb-4">
            {currentChannels.map((channelName, index) => (
              <li key={index} className={theme === 'dark' ? 'text-white' : 'text-gray-800'}>
                <span className={theme === 'dark' ? 'mr-2 text-gray-400' : 'mr-2 text-gray-500'}>{indexOfFirstChannel + index + 1}.</span>
                {channelName}
              </li>
            ))}
          </ul>
         
          {/* Pagination controls */}
          {channels.length > channelsPerPage && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={goToPrevPage}
                disabled={currentPage === 1}
                className={`px-3 py-1 ${
                  theme === 'dark' 
                    ? 'bg-gray-800 text-white disabled:bg-gray-900 disabled:text-gray-600' 
                    : 'bg-gray-200 text-gray-800 disabled:bg-gray-100 disabled:text-gray-400'
                } rounded`}
              >
                Previous
              </button>
             
              <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                Page {currentPage} of {totalPages}
              </span>
             
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 ${
                  theme === 'dark' 
                    ? 'bg-gray-800 text-white disabled:bg-gray-900 disabled:text-gray-600' 
                    : 'bg-gray-200 text-gray-800 disabled:bg-gray-100 disabled:text-gray-400'
                } rounded`}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>No subscribed channels found.</p>
      )}
    </div>
  );
}