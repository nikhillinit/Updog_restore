 
 
 
 
 
import { useFundStore } from '../stores/useFundStore';

// ✅ Use this INSIDE React components or other custom hooks
export function useStageValidation() {
  return useFundStore(s => s.stageValidation());
}

// ✅ Use this ANYWHERE (schemas/helpers/module scope)
export function getStageValidation() {
  return useFundStore.getState().stageValidation();
}

