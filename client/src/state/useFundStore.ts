/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
// Stub implementation for the fund store
import { create } from 'zustand';

interface FundState {
  // Basic fund properties
  name: string;
  totalCommittedCapital: string;
  fundType: string;
  vintage: number;
  
  // Stage validation
  stageValidation: () => Record<string, boolean>;
  
  // Actions
  setName: (_name: string) => void;
  setTotalCommittedCapital: (_amount: string) => void;
  setFundType: (_type: string) => void;
  setVintage: (_year: number) => void;
}

export const useFundStore = create<FundState>((set, get) => ({
  // Initial state
  name: '',
  totalCommittedCapital: '',
  fundType: 'venture',
  vintage: new Date().getFullYear(),
  
  // Validation
  stageValidation: () => {
    const state = get();
    return {
      'fund-basics': Boolean(state.name && state.totalCommittedCapital),
      'fund-details': true,
      'portfolio': true,
    };
  },
  
  // Actions
  setName: (name) => set({ name }),
  setTotalCommittedCapital: (amount) => set({ totalCommittedCapital: amount }),
  setFundType: (type) => set({ fundType: type }),
  setVintage: (year) => set({ vintage: year }),
}));
