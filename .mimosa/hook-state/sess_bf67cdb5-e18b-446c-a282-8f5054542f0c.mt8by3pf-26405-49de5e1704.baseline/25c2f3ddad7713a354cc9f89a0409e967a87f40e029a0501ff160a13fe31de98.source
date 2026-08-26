import { NumericInput } from '@/components/ui/NumericInput';
import { cn } from '@/lib/utils';

export interface Tier {
  type: 'return' | 'pref' | 'catchup' | 'carry';
  value: number;
  label: string;
}

export interface WaterfallEditorProps {
  tiers: Tier[];
  onChange: (tiers: Tier[]) => void;
}

/**
 * WaterfallEditor - Edit waterfall tier structure for carry calculations
 *
 * Features:
 * - Grid layout for tier configuration (label, value, description)
 * - Type-specific descriptions (carry vs. other tiers)
 * - NumericInput with step 0.01 for precise values
 * - Press On Ventures branding
 *
 * @example
 * <WaterfallEditor
 *   tiers={[
 *     { type: 'return', value: 1.0, label: 'Return of Capital' },
 *     { type: 'pref', value: 0.08, label: 'Preferred Return' },
 *     { type: 'carry', value: 0.20, label: 'Carried Interest' }
 *   ]}
 *   onChange={setTiers}
 * />
 */
export function WaterfallEditor({ tiers, onChange }: WaterfallEditorProps) {
  /**
   * Get description text based on tier type
   */
  const getDescription = (type: Tier['type']): string => {
    switch (type) {
      case 'carry':
        return '% of excess';
      default:
        return '% / IRR target';
    }
  };

  /**
   * Handle value change for a specific tier
   */
  const handleTierChange = (index: number, newValue: number | undefined) => {
    const updatedTiers = tiers.map((tier, i) =>
      i === index ? { ...tier, value: newValue ?? 0 } : tier
    );
    onChange(updatedTiers);
  };

  return (
    <div className="space-y-3">
      {tiers.map((tier, index) => (
        <div
          key={index}
          className={cn(
            'grid grid-cols-[1fr,auto,1fr] items-center gap-4',
            'rounded-md bg-lightGray p-3',
            'transition-all duration-200 hover:bg-charcoal/5'
          )}
        >
          {/* Column 1: Label */}
          <div className="font-poppins text-sm font-medium text-charcoal">
            {tier.label}
          </div>

          {/* Column 2: Value Input */}
          <div className="w-32">
            <NumericInput
              label=""
              value={tier.value}
              onChange={(value) => handleTierChange(index, value)}
              step={0.01}
              min={0}
              max={1}
              mode="number"
              className="mb-0"
            />
          </div>

          {/* Column 3: Description */}
          <div className="font-poppins text-xs text-charcoal/60">
            {getDescription(tier.type)}
          </div>
        </div>
      ))}
    </div>
  );
}
