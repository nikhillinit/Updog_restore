/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useFundStore } from '../stores/useFundStore';

// ✅ Use this INSIDE React components or other custom hooks
export function useStageValidation() {
  return useFundStore(s => s.stageValidation());
}

// ✅ Use this ANYWHERE (schemas/helpers/module scope)
export function getStageValidation() {
  return useFundStore.getState().stageValidation();
}

