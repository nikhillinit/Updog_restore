import React from 'react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface PremiumToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function PremiumToggle({
  label,
  description,
  checked,
  onChange,
  className = '',
  disabled = false
}: PremiumToggleProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="font-poppins font-medium text-sm text-pov-charcoal">
            {label}
          </Label>
          {description && (
            <p className="font-poppins text-xs text-gray-600">
              {description}
            </p>
          )}
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          className="data-[state=checked]:bg-pov-charcoal"
        />
      </div>
    </div>
  );
}
