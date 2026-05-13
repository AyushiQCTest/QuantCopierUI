"use client";

import { useState, useEffect, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import axios, { AxiosError } from "axios"; // Import AxiosError
import { Loader2, Trash2, Pencil } from "lucide-react";
import { ThemeContext } from "@/lib/theme-config";

const API_BASE_URL = "http://localhost:8000";

interface SymbolMapperProps {
  onBack?: () => void;
  onNext?: () => void;
  theme?: string;
}

export default function SymbolMapper({ onBack, onNext, theme }: SymbolMapperProps) {
  const { toast } = useToast();
  const [mappings, setMappings] = useState<{ [key: string]: string }>({});
  const [newSourceSymbol, setNewSourceSymbol] = useState("");
  const [newBrokerSymbol, setNewBrokerSymbol] = useState("");
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [editedSourceSymbol, setEditedSourceSymbol] = useState("");
  const [editedBrokerSymbol, setEditedBrokerSymbol] = useState("");
  const [loading, setLoading] = useState(true);
  const { theme: contextTheme } = useContext(ThemeContext);
  const activeTheme = theme || contextTheme;

  useEffect(() => {
    const fetchMappings = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/symbol_mapper`);
        setMappings(res.data);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load symbol mappings",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMappings();
  }, [toast]);

  const handleAddMapping = async () => {
    if (!newSourceSymbol || !newBrokerSymbol) {
      toast({
        title: "Missing Information",
        description: "Please fill both fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const newMapping = {
        source_symbol: newSourceSymbol,
        broker_symbol: newBrokerSymbol,
      };
      await axios.post(`${API_BASE_URL}/symbol_mapper/save`, newMapping);
      setMappings((prev) => ({ ...prev, [newSourceSymbol]: newBrokerSymbol }));
      setNewSourceSymbol("");
      setNewBrokerSymbol("");
      toast({
        title: "Success",
        description: "Symbol mapping added successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save symbol mapping",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (source: string, broker: string) => {
    setEditingSymbol(source);
    setEditedSourceSymbol(source);
    setEditedBrokerSymbol(broker);
  };

  const handleUpdateMapping = async (oldSource: string) => {
    if (!editedSourceSymbol || !editedBrokerSymbol) {
      toast({
        title: "Missing Information",
        description: "Please fill both fields",
        variant: "destructive",
      });
      return;
    }

    try {
      await axios.put(
        `${API_BASE_URL}/symbol_mapper/update/${encodeURIComponent(oldSource)}`,
        {
          new_source_symbol: editedSourceSymbol,
          new_broker_symbol: editedBrokerSymbol,
        }
      );
      const updatedMappings = { ...mappings };
      delete updatedMappings[oldSource];
      updatedMappings[editedSourceSymbol] = editedBrokerSymbol;
      setMappings(updatedMappings);
      setEditingSymbol(null);
      toast({
        title: "Success",
        description: "Symbol mapping updated successfully",
      });
    } catch (error) {
      const axiosError = error as AxiosError; // Type the error
      if (axiosError.response && axiosError.response.status === 404) {
        toast({
          title: "Error",
          description: "Symbol not found",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update symbol mapping",
          variant: "destructive",
        });
      }
    }
  };

  const handleDelete = async (source: string) => {
    try {
      await axios.delete(
        `${API_BASE_URL}/symbol_mapper/delete/${encodeURIComponent(source)}`
      );
      const updatedMappings = { ...mappings };
      delete updatedMappings[source];
      setMappings(updatedMappings);
      toast({
        title: "Success",
        description: "Symbol mapping deleted successfully",
      });
    } catch (error) {
      const axiosError = error as AxiosError; // Type the error
      if (axiosError.response && axiosError.response.status === 404) {
        toast({
          title: "Error",
          description: "Symbol not found",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete symbol mapping",
          variant: "destructive",
        });
      }
    }
  };

  const getThemeStyles = () => ({
    container: activeTheme === "dark" ? "text-white" : "text-gray-900",
    textSecondary: activeTheme === "dark" ? "text-gray-400" : "text-gray-600",
    buttonPrimary:
      activeTheme === "dark"
        ? "bg-green-500 hover:bg-green-600 text-white"
        : "bg-blue-500 hover:bg-blue-600 text-white",
    buttonOutline:
      activeTheme === "dark"
        ? "border-gray-600 text-gray-300 hover:bg-gray-800"
        : "border-gray-300 text-gray-600 hover:bg-gray-200",
    buttonGhost:
      activeTheme === "dark" ? "text-white hover:bg-gray-700" : "text-gray-900 hover:bg-gray-200",
    input:
      activeTheme === "dark"
        ? "text-white bg-gray-800 border-gray-600"
        : "text-gray-900 bg-white border-gray-200",
    tableBorder: activeTheme === "dark" ? "border-gray-700" : "border-gray-200",
    table: activeTheme === "dark" ? "bg-gray-800" : "bg-gray-100",
    iconColor: activeTheme === "dark" ? "text-green-500" : "text-blue-500",
    deleteIconColor: activeTheme === "dark" ? "text-red-500" : "text-red-600",
  });

  const styles = getThemeStyles();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className={`h-8 w-8 animate-spin ${styles.iconColor}`} />
        <span className={`ml-2 ${styles.container}`}>Loading symbol mappings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h2 className={`text-2xl font-semibold ${styles.container}`}>
        Symbol Mapper
      </h2>
      <p className={styles.textSecondary}>
        Map source symbols to broker symbols for MT5 Terminal.
      </p>

      <div className={`max-h-96 overflow-y-auto ${styles.table} p-4 rounded-lg`}>
        <table className="w-full">
          <thead>
            <tr>
              <th className={`text-left p-2 ${styles.container}`}>Source Symbol</th>
              <th className={`text-left p-2 ${styles.container}`}>Symbol Broker Name</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(mappings).map(([source, broker]) => (
              <tr key={source} className={`border-t ${styles.tableBorder}`}>
                <td className="p-2">
                  {editingSymbol === source ? (
                    <Input
                      value={editedSourceSymbol}
                      onChange={(e) => setEditedSourceSymbol(e.target.value)}
                      className={styles.input}
                      onKeyPress={(e) => e.key === "Enter" && handleUpdateMapping(source)}
                    />
                  ) : (
                    <span className={styles.container}>{source}</span>
                  )}
                </td>
                <td className="p-2">
                  {editingSymbol === source ? (
                    <Input
                      value={editedBrokerSymbol}
                      onChange={(e) => setEditedBrokerSymbol(e.target.value)}
                      className={styles.input}
                      onKeyPress={(e) => e.key === "Enter" && handleUpdateMapping(source)}
                    />
                  ) : (
                    <span className={styles.container}>{broker}</span>
                  )}
                </td>
                <td className="p-2 flex justify-end space-x-2">
                  {editingSymbol === source ? (
                    <Button
                      onClick={() => handleUpdateMapping(source)}
                      className={styles.buttonPrimary}
                    >
                      Save
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(source, broker)}
                      className={styles.buttonGhost}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(source)}
                    className={
                      activeTheme === "dark" ? "text-red-500 hover:bg-gray-700" : "text-red-600 hover:bg-gray-200"
                    }
                  >
                    <Trash2 className={`h-4 w-4 ${styles.deleteIconColor}`} />
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
            <Label className={styles.container}>Source Symbol</Label>
            <Input
              value={newSourceSymbol}
              onChange={(e) => setNewSourceSymbol(e.target.value)}
              className={styles.input}
              placeholder="e.g., Crude oil"
            />
          </div>
          <div className="space-y-2">
            <Label className={styles.container}>Symbol Broker Name</Label>
            <Input
              value={newBrokerSymbol}
              onChange={(e) => setNewBrokerSymbol(e.target.value)}
              className={styles.input}
              placeholder="e.g., xbrusd"
            />
          </div>
        </div>
        <div className="flex justify-center">
          <Button onClick={handleAddMapping} className={styles.buttonPrimary}>
            <span className="text-xl mr-2">+</span> Add Mapping
          </Button>
        </div>
      </div>
    </div>
  );
}