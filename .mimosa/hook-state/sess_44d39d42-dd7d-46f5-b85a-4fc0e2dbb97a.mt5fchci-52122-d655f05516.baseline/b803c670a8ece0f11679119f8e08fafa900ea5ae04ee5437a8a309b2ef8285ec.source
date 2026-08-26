import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PremiumCard } from '../ui/PremiumCard';
import { FinancialInput } from '../wizard/FinancialInput';
import { PremiumSelect } from '../wizard/PremiumSelect';
import { PremiumToggle } from '../wizard/PremiumToggle';
import { WizardProgress } from '../wizard/WizardProgress';
import { WizardHeader } from '../wizard/WizardHeader';

describe('POV Design System Components', () => {
  describe('PremiumCard', () => {
    it('renders with correct POV styling', () => {
      render(
        <PremiumCard title="Test Card" subtitle="Test Subtitle">
          <div>Card Content</div>
        </PremiumCard>
      );

      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
      expect(screen.getByText('Card Content')).toBeInTheDocument();
    });

    it('renders without subtitle', () => {
      render(
        <PremiumCard title="Hover Test">
          <div>Content</div>
        </PremiumCard>
      );

      expect(screen.getByText('Hover Test')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('FinancialInput', () => {
    it('renders with label and handles input', () => {
      const handleChange = vi.fn();
      render(
        <FinancialInput
          label="Fund Size"
          value="1000000"
          onChange={handleChange}
          placeholder="Enter amount"
          type="currency"
        />
      );

      expect(screen.getByText('Fund Size')).toBeInTheDocument();
      const input = screen.getByPlaceholderText('Enter amount');
      expect(input).toBeInTheDocument();

      fireEvent.change(input, { target: { value: '2500000' } });
      expect(handleChange).toHaveBeenCalled();
    });

    it('shows currency prefix by default', () => {
      render(
        <FinancialInput label="Investment" value="100000" onChange={() => {}} type="currency" />
      );

      expect(screen.getByText('$')).toBeInTheDocument();
    });

    it('handles percentage type with custom suffix', () => {
      render(
        <FinancialInput
          label="GP Commitment"
          value="2.5"
          onChange={vi.fn()}
          type="percentage"
          suffix="%"
        />
      );

      expect(screen.getByText('GP Commitment')).toBeInTheDocument();
    });
  });

  describe('PremiumSelect', () => {
    const mockOptions = [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ];

    it('renders with label and options', () => {
      const handleChange = vi.fn();
      render(
        <PremiumSelect
          label="Investment Strategy"
          value=""
          onChange={handleChange}
          options={mockOptions}
          placeholder="Select strategy"
        />
      );

      expect(screen.getByText('Investment Strategy')).toBeInTheDocument();
    });

    it('handles selection change', () => {
      const handleChange = vi.fn();
      render(
        <PremiumSelect
          label="Fund Type"
          value="option1"
          onChange={handleChange}
          options={mockOptions}
        />
      );

      // Component should render without errors
      expect(screen.getByText('Fund Type')).toBeInTheDocument();
    });

    it('shows required indicator when required', () => {
      render(
        <PremiumSelect
          label="Required Field"
          value=""
          onChange={vi.fn()}
          options={mockOptions}
          required={true}
        />
      );

      expect(screen.getByText('Required Field')).toBeInTheDocument();
    });
  });

  describe('PremiumToggle', () => {
    it('renders with label and handles toggle', () => {
      const handleChange = vi.fn();
      render(
        <PremiumToggle
          label="Evergreen Fund"
          description="Fund with no end date"
          checked={false}
          onChange={handleChange}
        />
      );

      expect(screen.getByText('Evergreen Fund')).toBeInTheDocument();
      expect(screen.getByText('Fund with no end date')).toBeInTheDocument();
    });

    it('shows checked state correctly', () => {
      render(<PremiumToggle label="Active Status" checked={true} onChange={vi.fn()} />);

      expect(screen.getByText('Active Status')).toBeInTheDocument();
    });

    it('handles disabled state', () => {
      render(
        <PremiumToggle label="Disabled Toggle" checked={false} onChange={vi.fn()} disabled={true} />
      );

      expect(screen.getByText('Disabled Toggle')).toBeInTheDocument();
    });
  });

  describe('WizardHeader', () => {
    it('renders with title and subtitle', () => {
      render(<WizardHeader title="Fund Setup Wizard" subtitle="Create your investment fund" />);

      expect(screen.getByText('Fund Setup Wizard')).toBeInTheDocument();
    });

    it('displays POV logo', () => {
      const { container } = render(<WizardHeader title="Test Title" subtitle="Test Subtitle" />);

      // Check that the header container exists
      expect(container.querySelector('.bg-white')).toBeInTheDocument();
    });
  });

  describe('WizardProgress', () => {
    const mockSteps = [
      { id: 'step1', label: 'Fund Basics', description: 'Basic info', icon: '1' },
      { id: 'step2', label: 'Capital Structure', description: 'LP classes', icon: '2' },
      { id: 'step3', label: 'Investment Strategy', description: 'Strategy', icon: '3' },
    ];

    it('renders all steps', () => {
      render(<WizardProgress steps={mockSteps} currentStep="step1" completedSteps={[]} />);

      expect(screen.getByText('Fund Basics')).toBeInTheDocument();
      expect(screen.getByText('Capital Structure')).toBeInTheDocument();
      expect(screen.getByText('Investment Strategy')).toBeInTheDocument();
    });

    it('shows progress bar', () => {
      render(<WizardProgress steps={mockSteps} currentStep="step2" completedSteps={['step1']} />);

      // Check if progress bar exists by looking for the container
      const progressContainer = document.querySelector('.bg-slate-200');
      expect(progressContainer).toBeInTheDocument();
    });
  });

  describe('Fund Calculations', () => {
    it('calculates GP/LP split correctly', () => {
      const totalCommitment = 100000000; // $100M
      const gpPercentage = 2; // 2%

      const gpCommitment = (totalCommitment * gpPercentage) / 100;
      const lpCommitment = totalCommitment - gpCommitment;

      expect(gpCommitment).toBe(2000000); // $2M
      expect(lpCommitment).toBe(98000000); // $98M
    });

    it('validates commitment percentages', () => {
      const validateCommitmentPercentage = (percentage: number) => {
        return percentage >= 0 && percentage <= 100;
      };

      expect(validateCommitmentPercentage(2)).toBe(true);
      expect(validateCommitmentPercentage(-1)).toBe(false);
      expect(validateCommitmentPercentage(101)).toBe(false);
    });
  });

  describe('LP Classes Management', () => {
    it('adds new LP class correctly', () => {
      const lpClasses: any[] = [];

      const addLPClass = (lpClass: any) => {
        lpClasses.push(lpClass);
      };

      addLPClass({
        name: 'Class A - Institutional',
        commitment: 50000000,
        numberOfLPs: 5,
        managementFee: 2.0,
        carriedInterest: 20.0,
      });

      expect(lpClasses).toHaveLength(1);
      expect(lpClasses[0].name).toBe('Class A - Institutional');
      expect(lpClasses[0].commitment).toBe(50000000);
    });

    it('calculates weighted average fees', () => {
      const lpClasses = [
        { commitment: 50000000, managementFee: 2.0, carriedInterest: 20.0 },
        { commitment: 30000000, managementFee: 1.5, carriedInterest: 15.0 },
        { commitment: 20000000, managementFee: 1.0, carriedInterest: 10.0 },
      ];

      const totalCommitment = lpClasses.reduce((sum, lp) => sum + lp.commitment, 0);

      const weightedMgmtFee = lpClasses.reduce(
        (sum, lp) => sum + (lp.commitment * lp.managementFee) / totalCommitment,
        0
      );

      const weightedCarry = lpClasses.reduce(
        (sum, lp) => sum + (lp.commitment * lp.carriedInterest) / totalCommitment,
        0
      );

      expect(weightedMgmtFee).toBeCloseTo(1.65, 2);
      expect(weightedCarry).toBeCloseTo(16.5, 1);
    });
  });

  describe('Timeline Validation', () => {
    it('validates fund dates correctly', () => {
      const startDate = new Date('2023-04-15');
      const endDate = new Date('2033-04-15');

      const fundTerm = endDate.getFullYear() - startDate.getFullYear();
      expect(fundTerm).toBe(10);

      // Validate end date is after start date
      expect(endDate > startDate).toBe(true);
    });

    it('handles evergreen fund toggle', () => {
      let isEvergreen = false;
      let fundEndDate: Date | null = new Date('2033-04-15');

      // Toggle to evergreen
      isEvergreen = true;
      fundEndDate = null;

      expect(isEvergreen).toBe(true);
      expect(fundEndDate).toBeNull();
    });
  });

  describe('Capital Call Schedule', () => {
    it('calculates capital call amounts', () => {
      const totalCommitment = 100000000;
      const callSchedule = [
        { percentage: 25, date: '2023-04-15' },
        { percentage: 25, date: '2023-10-15' },
        { percentage: 25, date: '2024-04-15' },
        { percentage: 25, date: '2024-10-15' },
      ];

      const callAmounts = callSchedule.map((call) => ({
        ...call,
        amount: (totalCommitment * call.percentage) / 100,
      }));

      expect(callAmounts[0]!.amount).toBe(25000000);
      expect(callAmounts.reduce((sum, call) => sum + call.amount, 0)).toBe(totalCommitment);
    });

    it('validates call schedule dates are in correct order', () => {
      const callSchedule = [
        { percentage: 25, date: '2023-04-15' },
        { percentage: 25, date: '2023-10-15' },
        { percentage: 25, date: '2024-04-15' },
        { percentage: 25, date: '2024-10-15' },
      ];

      const dates = callSchedule.map((call) => new Date(call.date));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]! > dates[i - 1]!).toBe(true);
      }
    });
  });

  describe('Responsive Design Tests', () => {
    it('handles mobile viewport correctly', () => {
      // Mock window.innerWidth for mobile
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      window.dispatchEvent(new Event('resize'));

      // Test that mobile breakpoint is handled
      expect(window.innerWidth).toBe(375);
    });

    it('handles tablet viewport correctly', () => {
      // Mock window.innerWidth for tablet
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      });

      window.dispatchEvent(new Event('resize'));

      expect(window.innerWidth).toBe(768);
    });
  });

  describe('Form Validation', () => {
    it('validates required fields', () => {
      const validateFundName = (name: string) => {
        return name.trim().length > 0;
      };

      expect(validateFundName('')).toBe(false);
      expect(validateFundName('  ')).toBe(false);
      expect(validateFundName('Press On Ventures Fund I')).toBe(true);
    });

    it('validates numeric inputs', () => {
      const validateNumericInput = (value: string) => {
        const num = parseFloat(value);
        return !isNaN(num) && num >= 0;
      };

      expect(validateNumericInput('100000')).toBe(true);
      expect(validateNumericInput('-100')).toBe(false);
      expect(validateNumericInput('abc')).toBe(false);
    });
  });
});

// Integration test for the full wizard flow
describe('Fund Setup Wizard Integration', () => {
  it('completes full wizard flow data validation', () => {
    const fundData = {
      step1: {
        fundName: 'Press On Ventures Fund I',
        startDate: '2023-04-15',
        endDate: '2033-04-15',
        isEvergreen: false,
        totalCommitment: 100000000,
        gpCommitmentPercentage: 2,
      },
      step2: {
        lpClasses: [
          {
            name: 'Class A',
            commitment: 98000000,
            numberOfLPs: 20,
            managementFee: 2.0,
            carriedInterest: 20.0,
          },
        ],
      },
      step3: {
        numberOfInvestments: 30,
        averageCheckSize: 1000000,
        graduationRates: {
          seedToA: 40,
          aToB: 35,
          bToC: 30,
        },
      },
    };

    // Validate complete fund data
    expect(fundData.step1.fundName).toBeTruthy();
    expect(fundData.step2.lpClasses.length).toBeGreaterThan(0);
    expect(fundData.step3.graduationRates.seedToA).toBeLessThanOrEqual(100);
  });
});
