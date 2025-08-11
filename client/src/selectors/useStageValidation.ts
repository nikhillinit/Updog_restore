import { shallow } from 'zustand/shallow';
import { useFundStore } from '../state/useFundStore';

export function useStageValidation() {
  return useFundStore((s) => s.stageValidation(), shallow);
}
