"use client";

import { useState, useEffect, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import axios from "axios";
import { ThemeContext } from "@/lib/theme-config";
import { useBackendData } from "@/src/context/BackendDataContext";

interface Step4SettingsProps {
  onBack: () => void;
  onNext: () => void;
  theme?: string;
  isRevisit: boolean;
}

const API_BASE_URL = "http://localhost:8000";

export default function Step4Settings({ onBack, onNext, theme, isRevisit }: Step4SettingsProps) {
  const [settings, setSettings] = useState({
    entry_price_variation_flag: true,
    risk_variation_flag: true,
    close_opposite_positions_symbolwise: true,
    console_log_output: false,
    move_sl_breakeven_criteria: "TP1",
    entry_time_variation: 1,
    risk_percent: 1.0,
    pending_order_time_expiration_minutes: 0,
    force_execute_market_orders: "",
  });

  const { theme: contextTheme } = useContext(ThemeContext);
  const activeTheme = theme || contextTheme;

  // Use operational settings from context
  const { operationalSettings, fetchOperationalSettings } = useBackendData();

  useEffect(() => {
    if (operationalSettings) {
      setSettings({
        entry_price_variation_flag: operationalSettings.entry_price_variation_flag,
        risk_variation_flag: operationalSettings.risk_variation_flag,
        close_opposite_positions_symbolwise: operationalSettings.close_opposite_positions_symbolwise,
        console_log_output: operationalSettings.console_log_output,
        move_sl_breakeven_criteria: operationalSettings.move_sl_breakeven_criteria,
        entry_time_variation: operationalSettings.entry_time_variation,
        risk_percent: operationalSettings.risk_percent,
        pending_order_time_expiration_minutes: operationalSettings.pending_order_time_expiration_minutes,
        force_execute_market_orders: operationalSettings.force_execute_market_orders || "",
      });
    }
  }, [operationalSettings]);

  const handleSave = async () => {
    try {
      await axios.post(`${API_BASE_URL}/save_operational_settings`, settings);
      if (!isRevisit) {
        await axios.post(`${API_BASE_URL}/set_onboarding_complete`);
      }

      // Force refresh operational settings in the context
      await fetchOperationalSettings({ force: true });

      onNext();
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const getThemeStyles = () => ({
    container: activeTheme === "dark" ? "text-white" : "text-gray-900",
    textSecondary: activeTheme === "dark" ? "text-gray-400" : "text-gray-600",
    buttonOutline:
      activeTheme === "dark"
        ? "border-gray-600 text-gray-300 hover:bg-gray-800"
        : "border-gray-300 text-gray-600 hover:bg-gray-200",
    buttonPrimary:
      activeTheme === "dark"
        ? "bg-[#22c55e] hover:bg-[#1ea54d] text-white"
        : "bg-blue-500 hover:bg-blue-600 text-white",
    radio:
      activeTheme === "dark" ? "text-[#22c55e] accent-[#22c55e]" : "text-blue-500 accent-blue-500",
  });

  const styles = getThemeStyles();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className={`text-2xl font-semibold ${styles.container}`}>
          Operational Settings
        </h2>
        <p className={styles.textSecondary}>
          See <a
            href="https://docs.google.com/document/d/e/2PACX-1vTCR_GmuEGMLDQ63Siq8_m_2iFZSmV87RRao6NLxy_EqWZNlbXvgCWzr3y3PAxEUgASiraQgh-luefS/pub"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-blue-500 hover:text-blue-600"
          >
            this documentation
          </a> for details on each setting.
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Label className={styles.container}>Entry Price Variation</Label>
          <Switch
            checked={settings.entry_price_variation_flag}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, entry_price_variation_flag: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className={styles.container}>Risk Variation</Label>
          <Switch
            checked={settings.risk_variation_flag}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, risk_variation_flag: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className={styles.container}>Close Opposite Positions (Symbolwise)</Label>
          <Switch
            checked={settings.close_opposite_positions_symbolwise}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, close_opposite_positions_symbolwise: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className={styles.container}>Console Log Output</Label>
          <Switch
            checked={settings.console_log_output}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, console_log_output: checked })
            }
          />
        </div>
        <div className="space-y-2">
          <Label className={styles.container}>Force Execute Market Orders (Symbols)</Label>
          <Input
            value={settings.force_execute_market_orders}
            onChange={(e) =>
              setSettings({ ...settings, force_execute_market_orders: e.target.value })
            }
            placeholder="e.g. XAUUSD+,XAGUSD"
            className={activeTheme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
          />
          <p className={`text-xs ${styles.textSecondary}`}>
            Comma-separated list of symbols to always execute as market orders.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Label className={styles.container}>Move SL Breakeven Criteria:</Label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="breakeven"
            value="TP1"
            checked={settings.move_sl_breakeven_criteria === "TP1"}
            onChange={(e) =>
              setSettings({ ...settings, move_sl_breakeven_criteria: e.target.value })
            }
            className={styles.radio}
          />
          <span className={styles.container}>TP1</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="breakeven"
            value="TP2"
            checked={settings.move_sl_breakeven_criteria === "TP2"}
            onChange={(e) =>
              setSettings({ ...settings, move_sl_breakeven_criteria: e.target.value })
            }
            className={styles.radio}
          />
          <span className={styles.container}>TP2</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="breakeven"
            value="none"
            checked={settings.move_sl_breakeven_criteria === "none"}
            onChange={(e) =>
              setSettings({ ...settings, move_sl_breakeven_criteria: e.target.value })
            }
            className={styles.radio}
          />
          <span className={styles.container}>None</span>
        </label>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className={styles.container}>
              Entry Time Variation (seconds)
            </Label>
            <span className={styles.container}>
              {settings.entry_time_variation}s
            </span>
          </div>
          <Slider
            value={[settings.entry_time_variation]}
            onValueChange={(value) =>
              setSettings({ ...settings, entry_time_variation: value[0] })
            }
            min={1}
            max={60}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className={styles.container}>Risk Percent</Label>
            <span className={styles.container}>{settings.risk_percent}%</span>
          </div>
          <Slider
            value={[settings.risk_percent]}
            onValueChange={(value) =>
              setSettings({ ...settings, risk_percent: value[0] })
            }
            min={0.1}
            max={100}
            step={0.1}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className={styles.container}>
              Pending Order Expiration (minutes)
            </Label>
            <span className={styles.container}>
              {settings.pending_order_time_expiration_minutes}m
            </span>
          </div>
          <Slider
            value={[settings.pending_order_time_expiration_minutes]}
            onValueChange={(value) =>
              setSettings({
                ...settings,
                pending_order_time_expiration_minutes: value[0],
              })
            }
            min={0}
            max={1440}
            step={5}
          />
        </div>
      </div>

      <div className={isRevisit ? "flex justify-center" : "flex justify-between"}>
        {isRevisit ? (
          <Button onClick={handleSave} className={styles.buttonPrimary}>
            Save
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onBack} className={styles.buttonOutline}>
              Previous Step
            </Button>
            <Button onClick={handleSave} className={styles.buttonPrimary}>
              Complete Setup
            </Button>
          </>
        )}
      </div>
    </div >
  );
}