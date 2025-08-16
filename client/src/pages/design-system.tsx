/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState } from 'react';
import { WizardProgress } from "@/components/wizard/WizardProgress";
import { FinancialInput } from "@/components/wizard/FinancialInput";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { PremiumSelect } from "@/components/wizard/PremiumSelect";
import { PremiumToggle } from "@/components/wizard/PremiumToggle";
import { Button } from "@/components/ui/button";
import { POVBrandHeader } from "@/components/ui/POVLogo";
import { BrandComplianceShowcase } from "@/components/ui/BrandShowcase";
import { Building2, TrendingUp, DollarSign, Users, Target } from 'lucide-react';

export default function DesignSystem() {
  const [fundName, setFundName] = useState('Acme Ventures Fund I');
  const [fundSize, setFundSize] = useState('100000000');
  const [currency, setCurrency] = useState('USD');
  const [isEvergreen, setIsEvergreen] = useState(false);
  
  const sampleSteps = [
    { id: 'basics', label: 'Fund Basics', description: 'Name, currency, and structure', icon: '1' },
    { id: 'capital', label: 'Capital Structure', description: 'LP/GP commitments', icon: '2' },
    { id: 'strategy', label: 'Investment Strategy', description: 'Sectors and stages', icon: '3' },
    { id: 'terms', label: 'Terms & Waterfall', description: 'Distribution terms', icon: '4' },
    { id: 'review', label: 'Review', description: 'Final review', icon: '✓' },
  ];

  const currencyOptions = [
    { value: 'USD', label: 'United States Dollar ($)', description: 'Primary global reserve currency' },
    { value: 'EUR', label: 'Euro (€)', description: 'European Union currency' },
    { value: 'GBP', label: 'British Pound (£)', description: 'United Kingdom currency' },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Design System"
        subtitle="Premium venture capital fund modeling platform with institutional-grade design standards"
        variant="light"
      />

      {/* Wizard Progress Showcase */}
      <div className="bg-white border-b border-gray-200">
        <WizardProgress
          steps={sampleSteps}
          currentStep="strategy"
          completedSteps={['basics', 'capital']}
        />
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        
        {/* Hero Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <PremiumCard
            title="Fund Metrics"
            subtitle="Real-time portfolio performance"
            variant="highlight"
            headerActions={<TrendingUp className="h-5 w-5 text-pov-success" />}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="font-mono text-2xl font-bold text-pov-charcoal">$125M</div>
                <div className="font-poppins text-sm text-gray-600">Total Committed</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-2xl font-bold text-pov-success">2.8x</div>
                <div className="font-poppins text-sm text-gray-600">Current MOIC</div>
              </div>
            </div>
          </PremiumCard>

          <PremiumCard
            title="Portfolio Companies"
            subtitle="Active investments overview"
            headerActions={<Users className="h-5 w-5 text-pov-charcoal" />}
          >
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-poppins text-sm">Active</span>
                <span className="font-mono font-bold text-pov-charcoal">24</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-poppins text-sm">Exited</span>
                <span className="font-mono font-bold text-pov-success">8</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-poppins text-sm">Written Off</span>
                <span className="font-mono font-bold text-pov-error">3</span>
              </div>
            </div>
          </PremiumCard>

          <PremiumCard
            title="Capital Deployment"
            subtitle="Investment pacing analysis"
            headerActions={<Target className="h-5 w-5 text-pov-warning" />}
          >
            <div className="space-y-3">
              <div className="w-full bg-pov-gray rounded-full h-2">
                <div className="bg-gradient-to-r from-pov-charcoal to-pov-beige h-2 rounded-full" style={{ width: '68%' }}></div>
              </div>
              <div className="flex justify-between">
                <span className="font-poppins text-xs text-gray-600">Deployed</span>
                <span className="font-mono text-xs font-bold">68%</span>
              </div>
            </div>
          </PremiumCard>
        </div>

        {/* Form Components Showcase */}
        <PremiumCard
          title="Premium Form Components"
          subtitle="Enhanced input components with validation and styling"
          variant="default"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <FinancialInput
                label="Fund Name"
                value={fundName}
                onChange={setFundName}
                type="text"
                placeholder="Enter fund name"
                required
                description="The official name of your venture capital fund"
              />
              
              <FinancialInput
                label="Fund Size"
                value={fundSize}
                onChange={setFundSize}
                type="currency"
                placeholder="100000000"
                required
                description="Total committed capital from all limited partners"
              />
            </div>
            
            <div className="space-y-6">
              <PremiumSelect
                label="Fund Currency"
                value={currency}
                onChange={setCurrency}
                options={currencyOptions}
                placeholder="Select currency"
                required
                description="Primary currency for fund operations"
              />
              
              <PremiumToggle
                label="Evergreen Fund"
                description="Fund with no fixed end date, can invest indefinitely"
                checked={isEvergreen}
                onChange={setIsEvergreen}
              />
            </div>
          </div>
        </PremiumCard>

        {/* Button Showcase */}
        <PremiumCard
          title="Button Components"
          subtitle="Consistent button styling across the platform"
        >
          <div className="flex flex-wrap gap-4">
            <Button className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white">
              Primary Action
            </Button>
            <Button variant="outline" className="border-pov-charcoal/20 hover:bg-pov-charcoal hover:text-pov-white">
              Secondary Action
            </Button>
            <Button variant="secondary" className="bg-pov-beige text-pov-charcoal hover:bg-pov-beige/80">
              Tertiary Action
            </Button>
            <Button variant="ghost" className="hover:bg-pov-beige/20 text-pov-charcoal">
              Ghost Button
            </Button>
          </div>
        </PremiumCard>

        {/* Typography Showcase */}
        <PremiumCard
          title="Typography System"
          subtitle="Consistent typography with Inter and Poppins fonts"
        >
          <div className="space-y-6">
            <div>
              <h1 className="font-inter font-bold text-4xl text-pov-charcoal mb-2">Heading 1</h1>
              <p className="font-poppins text-gray-600">Large heading for main page titles</p>
            </div>
            <div>
              <h2 className="font-inter font-bold text-3xl text-pov-charcoal mb-2">Heading 2</h2>
              <p className="font-poppins text-gray-600">Section headers and important content</p>
            </div>
            <div>
              <h3 className="font-inter font-bold text-2xl text-pov-charcoal mb-2">Heading 3</h3>
              <p className="font-poppins text-gray-600">Subsection headers and card titles</p>
            </div>
            <div>
              <p className="font-poppins text-base text-gray-700 mb-2">Body Text</p>
              <p className="font-poppins text-gray-600">Main content and descriptions</p>
            </div>
            <div>
              <p className="font-mono text-base text-pov-charcoal mb-2">$125,000,000</p>
              <p className="font-poppins text-gray-600">Financial data and numeric values</p>
            </div>
          </div>
        </PremiumCard>

        {/* Brand Identity Showcase */}
        <PremiumCard
          title="Press On Ventures Brand Identity"
          subtitle="Official logo variations and brand applications"
        >
          <div className="space-y-8">
            {/* Logo Variations */}
            <div>
              <h4 className="font-inter font-semibold text-lg text-pov-charcoal mb-6">Logo Variations</h4>
              {/* Logo and Icon Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Icon Variations */}
                <div className="space-y-6">
                  <h5 className="font-inter font-semibold text-sm text-pov-charcoal">Icon Only</h5>

                  <div className="bg-pov-white border border-pov-gray rounded-lg p-6 text-center">
                    <img
                      src="https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2Fbe1ff0f489c346bb87e5a21a3de55ae4?format=webp&width=800"
                      alt="POV Icon - Dark"
                      className="h-12 w-12 mx-auto mb-3 object-contain"
                    />
                    <p className="font-poppins text-xs text-gray-600">Dark Icon</p>
                  </div>

                  <div className="bg-pov-beige rounded-lg p-6 text-center">
                    <img
                      src="https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2Fa02554ba930546fa8bb20213ec027712?format=webp&width=800"
                      alt="POV Icon - Light"
                      className="h-12 w-12 mx-auto mb-3 object-contain"
                    />
                    <p className="font-poppins text-xs text-pov-charcoal/70">Light Icon</p>
                  </div>

                  <div className="bg-pov-charcoal rounded-lg p-6 text-center">
                    <img
                      src="https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2F832e7518a4a94541bf981160d3e94afd?format=webp&width=800"
                      alt="POV Icon - White"
                      className="h-12 w-12 mx-auto mb-3 object-contain"
                    />
                    <p className="font-poppins text-xs text-pov-white/80">White Icon</p>
                  </div>
                </div>

                {/* Full Logo Variations */}
                <div className="md:col-span-2 space-y-6">
                  <h5 className="font-inter font-semibold text-sm text-pov-charcoal">Full Logo</h5>

                  <div className="bg-pov-white border border-pov-gray rounded-lg p-8 text-center">
                    <img
                      src="https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2F2e9c074662e8408c8bf0fd2e6f62254f?format=webp&width=800"
                      alt="POV Logo - Dark on Light"
                      className="h-12 mx-auto mb-3 object-contain"
                    />
                    <p className="font-poppins text-sm text-gray-600">Primary - Dark Logo on Light Background</p>
                  </div>

                  <div className="bg-pov-beige rounded-lg p-8 text-center">
                    <img
                      src="https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2Ff49ea40289bd4c9f935555b532cb6506?format=webp&width=800"
                      alt="POV Logo - Light on Beige"
                      className="h-12 mx-auto mb-3 object-contain"
                    />
                    <p className="font-poppins text-sm text-pov-charcoal/80">Secondary - Light Logo on Brand Background</p>
                  </div>

                  <div className="bg-pov-charcoal rounded-lg p-8 text-center">
                    <img
                      src="https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2Fb3de3760e5924b7caf12011c893cbadd?format=webp&width=800"
                      alt="POV Logo - White on Dark"
                      className="h-12 mx-auto mb-3 object-contain"
                    />
                    <p className="font-poppins text-sm text-pov-white/80">Inverse - White Logo on Dark Background</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PremiumCard>

        {/* Color Palette */}
        <PremiumCard
          title="Brand Color Palette"
          subtitle="Press On Ventures brand colors and their usage"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-pov-charcoal rounded-lg mx-auto mb-3 shadow-sm"></div>
              <h4 className="font-poppins font-medium text-sm text-pov-charcoal">Charcoal</h4>
              <p className="font-mono text-xs text-gray-600">#292929</p>
              <p className="font-poppins text-xs text-gray-500 mt-1">Primary brand color</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-pov-beige rounded-lg mx-auto mb-3 shadow-sm"></div>
              <h4 className="font-poppins font-medium text-sm text-pov-charcoal">Beige</h4>
              <p className="font-mono text-xs text-gray-600">#E0D8D1</p>
              <p className="font-poppins text-xs text-gray-500 mt-1">Secondary accent</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-pov-success rounded-lg mx-auto mb-3 shadow-sm"></div>
              <h4 className="font-poppins font-medium text-sm text-pov-charcoal">Success</h4>
              <p className="font-mono text-xs text-gray-600">#10B981</p>
              <p className="font-poppins text-xs text-gray-500 mt-1">Positive metrics</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-pov-error rounded-lg mx-auto mb-3 shadow-sm"></div>
              <h4 className="font-poppins font-medium text-sm text-pov-charcoal">Error</h4>
              <p className="font-mono text-xs text-gray-600">#EF4444</p>
              <p className="font-poppins text-xs text-gray-500 mt-1">Alerts & warnings</p>
            </div>
          </div>
        </PremiumCard>

        {/* Brand Compliance Showcase */}
        <BrandComplianceShowcase />
      </div>
    </div>
  );
}

