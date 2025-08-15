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
  setName: (name: string) => void;
  setTotalCommittedCapital: (amount: string) => void;
  setFundType: (type: string) => void;
  setVintage: (year: number) => void;
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