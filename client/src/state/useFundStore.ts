import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GraduationRate {
  graduate: number;
  fail: number;
  remain: number;
  months: number;
}

interface FundData {
  totalCommitment?: number;
  targetCompanies?: number;
  deploymentPace?: number;
  graduationRates?: {
    seedToA: GraduationRate;
    aToB: GraduationRate;
    bToC: GraduationRate;
  };
  followOnChecks?: {
    A: number;
    B: number;
    C: number;
  };
}

interface FundStore {
  fundData: FundData;
  setFundData: (data: Partial<FundData>) => void;
  updateGraduationRate: (
    stage: 'seedToA' | 'aToB' | 'bToC',
    field: 'graduate' | 'fail' | 'remain' | 'months',
    value: number
  ) => void;
}

export const useFundStore = create<FundStore>()(
  persist(
    (set) => ({
      fundData: {
        totalCommitment: 100_000_000,
        targetCompanies: 30,
        deploymentPace: 10,
        graduationRates: {
          seedToA: { graduate: 35, fail: 35, remain: 30, months: 18 },
          aToB: { graduate: 50, fail: 25, remain: 25, months: 24 },
          bToC: { graduate: 60, fail: 20, remain: 20, months: 30 },
        },
        followOnChecks: {
          A: 800_000,
          B: 1_500_000,
          C: 2_500_000,
        },
      },
      setFundData: (data) =>
        set((state) => ({
          fundData: { ...state.fundData, ...data },
        })),
      updateGraduationRate: (stage, field, value) =>
        set((state) => {
          const currentRates = state.fundData.graduationRates || {
            seedToA: { graduate: 35, fail: 35, remain: 30, months: 18 },
            aToB: { graduate: 50, fail: 25, remain: 25, months: 24 },
            bToC: { graduate: 60, fail: 20, remain: 20, months: 30 },
          };
          
          return {
            fundData: {
              ...state.fundData,
              graduationRates: {
                ...currentRates,
                [stage]: {
                  ...currentRates[stage],
                  [field]: value,
                },
              },
            },
          };
        }),
    }),
    {
      name: 'fund-store',
    }
  )
);
