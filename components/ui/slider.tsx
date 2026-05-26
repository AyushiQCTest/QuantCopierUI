import React from "react";

export interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number; // Added min to match your usage
  max: number;
  step: number;
}

export function Slider({ value, onValueChange, min, max, step }: SliderProps) {
  return (
    <input
      type="range"
      value={value[0]}
      min={min} // Added min prop
      max={max}
      step={step}
      onChange={(e) => onValueChange([Number(e.target.value)])}
      className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
    />
  );
}