/**
 * Example usage of LP Management Components
 * This file demonstrates how to use LPCard and WaterfallEditor
 */

import { useState } from 'react';
import { LPCard } from './LPCard';
import { WaterfallEditor, type Tier } from './WaterfallEditor';

/**
 * Example: LPCard Usage
 */
export function LPCardExample() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <LPCard
        name="Sequoia Capital"
        commitment={50000000}
        called={35000000}
        distributed={62000000}
      />
      <LPCard
        name="Andreessen Horowitz"
        commitment={30000000}
        called={22500000}
        distributed={18000000}
      />
      <LPCard
        name="Accel Partners"
        commitment={25000000}
        called={18750000}
        distributed={28000000}
      />
    </div>
  );
}

/**
 * Example: WaterfallEditor Usage (American Waterfall)
 */
export function AmericanWaterfallExample() {
  const [tiers, setTiers] = useState<Tier[]>([
    { type: 'return', value: 1.0, label: 'Return of Capital' },
    { type: 'carry', value: 0.20, label: 'Carried Interest (20%)' },
  ]);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h3 className="mb-2 font-heading text-lg font-semibold text-charcoal">
          American Waterfall
        </h3>
        <p className="mb-4 font-poppins text-sm text-charcoal/60">
          Simple carry structure with no preferred return
        </p>
      </div>
      <WaterfallEditor tiers={tiers} onChange={setTiers} />
    </div>
  );
}

/**
 * Example: WaterfallEditor Usage (European Waterfall)
 */
export function EuropeanWaterfallExample() {
  const [tiers, setTiers] = useState<Tier[]>([
    { type: 'return', value: 1.0, label: 'Return of Capital' },
    { type: 'pref', value: 0.08, label: 'Preferred Return (8%)' },
    { type: 'catchup', value: 0.5, label: 'GP Catch-Up (50%)' },
    { type: 'carry', value: 0.20, label: 'Carried Interest (20%)' },
  ]);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h3 className="mb-2 font-heading text-lg font-semibold text-charcoal">
          European Waterfall
        </h3>
        <p className="mb-4 font-poppins text-sm text-charcoal/60">
          Hurdle rate with catch-up and carry
        </p>
      </div>
      <WaterfallEditor tiers={tiers} onChange={setTiers} />
    </div>
  );
}

/**
 * Example: Complete LP Management Dashboard
 */
export function LPDashboardExample() {
  const [waterfallTiers, setWaterfallTiers] = useState<Tier[]>([
    { type: 'return', value: 1.0, label: 'Return of Capital' },
    { type: 'pref', value: 0.08, label: 'Preferred Return (8%)' },
    { type: 'catchup', value: 0.5, label: 'GP Catch-Up (50%)' },
    { type: 'carry', value: 0.20, label: 'Carried Interest (20%)' },
  ]);

  const lps = [
    {
      name: 'Sequoia Capital',
      commitment: 50000000,
      called: 35000000,
      distributed: 62000000,
    },
    {
      name: 'Andreessen Horowitz',
      commitment: 30000000,
      called: 22500000,
      distributed: 18000000,
    },
    {
      name: 'Accel Partners',
      commitment: 25000000,
      called: 18750000,
      distributed: 28000000,
    },
  ];

  return (
    <div className="space-y-8 p-8">
      {/* Fund Overview Section */}
      <div>
        <h2 className="mb-6 font-heading text-2xl font-bold text-charcoal">
          Fund I - LP Overview
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lps.map((lp) => (
            <LPCard key={lp.name} {...lp} />
          ))}
        </div>
      </div>

      {/* Waterfall Configuration Section */}
      <div>
        <h2 className="mb-6 font-heading text-2xl font-bold text-charcoal">
          Carry Waterfall Configuration
        </h2>
        <div className="rounded-lg border border-charcoal/10 bg-white p-6 shadow-card">
          <WaterfallEditor tiers={waterfallTiers} onChange={setWaterfallTiers} />
        </div>
      </div>
    </div>
  );
}
