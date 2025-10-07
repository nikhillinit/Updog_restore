import React from 'react';
import { Button } from '../ui/Button';
import { ArrowLeftIcon, ArrowRightIcon, SaveIcon } from 'lucide-react';
interface WizardNavigationProps {
  onNext?: () => void;
  onPrevious?: () => void;
  onSave?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  isLastStep?: boolean;
  isFirstStep?: boolean;
}
export const WizardNavigation = ({
  onNext,
  onPrevious,
  onSave,
  canGoNext = true,
  canGoPrevious = true,
  isLastStep = false,
  isFirstStep = false
}: WizardNavigationProps) => {
  return <div className="flex justify-between pt-6 border-t border-lightGray mt-8">
      <div>
        {!isFirstStep && <Button variant="outline" onClick={onPrevious} disabled={!canGoPrevious} icon={<ArrowLeftIcon size={16} />}>
            Previous
          </Button>}
      </div>
      <div className="flex space-x-3">
        {onSave && <Button variant="outline" onClick={onSave} icon={<SaveIcon size={16} />}>
            Save Draft
          </Button>}
        {!isLastStep ? <Button variant="primary" onClick={onNext} disabled={!canGoNext} icon={<ArrowRightIcon size={16} />}>
            Continue
          </Button> : <Button variant="primary" onClick={onNext} disabled={!canGoNext}>
            Complete
          </Button>}
      </div>
    </div>;
};