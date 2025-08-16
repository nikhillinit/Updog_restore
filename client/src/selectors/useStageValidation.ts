/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { shallow } from 'zustand/shallow';
import { useFundStore } from '../state/useFundStore';

export function useStageValidation() {
  return useFundStore((s: any) => s.stageValidation());
}

