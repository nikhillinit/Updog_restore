/**
 * GuidedTour - GP Onboarding Tour Component
 *
 * Shows a guided tour for new GP users, highlighting the 5 main navigation areas.
 * Appears once per user (tracked via localStorage).
 * Gated by FLAGS.ONBOARDING_TOUR feature flag.
 */

import { useState, useEffect, useCallback } from 'react';
import { FLAGS } from '@/core/flags/featureFlags';
import { track } from '@/lib/telemetry';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Briefcase, LineChart, Settings, FileText, ChevronRight, X } from 'lucide-react';

const STORAGE_KEY = 'onboarding_seen_gp_v1';
const TOUR_VERSION = 'gp_v1';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  navItem: 'overview' | 'portfolio' | 'model' | 'operate' | 'report';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'overview',
    title: 'Welcome to Your Dashboard',
    description: 'Get a quick snapshot of your fund performance with key metrics and recent activity at a glance.',
    icon: LayoutDashboard,
    navItem: 'overview',
  },
  {
    id: 'portfolio',
    title: 'Portfolio Management',
    description: 'View and manage all your investments in one place. Track company progress, allocations, and performance.',
    icon: Briefcase,
    navItem: 'portfolio',
  },
  {
    id: 'model',
    title: 'Financial Modeling',
    description: 'Build scenarios, run projections, and analyze potential outcomes for your fund strategy.',
    icon: LineChart,
    navItem: 'model',
  },
  {
    id: 'operate',
    title: 'Operations Hub',
    description: 'Manage day-to-day fund operations, cash flows, and administrative tasks efficiently.',
    icon: Settings,
    navItem: 'operate',
  },
  {
    id: 'report',
    title: 'Reporting & Analytics',
    description: 'Generate LP reports, analyze fund metrics, and export data for stakeholder communications.',
    icon: FileText,
    navItem: 'report',
  },
];

export function GuidedTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Check if tour should show
  useEffect(() => {
    if (!FLAGS.ONBOARDING_TOUR) return;

    const hasSeenTour = localStorage.getItem(STORAGE_KEY);
    if (!hasSeenTour) {
      setIsOpen(true);
      track('tour_started', { version: TOUR_VERSION });
    }
  }, []);

  // Track step views
  useEffect(() => {
    if (isOpen) {
      track('tour_step_viewed', { stepIndex: currentStep });
    }
  }, [isOpen, currentStep]);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    track('tour_completed', { version: TOUR_VERSION });
    setIsOpen(false);
  }, []);

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    track('tour_completed', { version: TOUR_VERSION });
    setIsOpen(false);
  }, []);

  if (!FLAGS.ONBOARDING_TOUR || !isOpen) {
    return null;
  }

  const step = TOUR_STEPS[currentStep];
  const StepIcon = step.icon;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md border-presson-borderSubtle">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-presson-highlight">
              <StepIcon className="h-6 w-6 text-presson-text" />
            </div>
            <div className="flex gap-1">
              {TOUR_STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 w-6 rounded-full transition-colors ${
                    idx <= currentStep ? 'bg-presson-accent' : 'bg-presson-surfaceSubtle'
                  }`}
                />
              ))}
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-presson-text">
            {step.title}
          </DialogTitle>
          <DialogDescription className="text-presson-textMuted">
            {step.description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-presson-textMuted">
            Step {currentStep + 1} of {TOUR_STEPS.length}
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-presson-textMuted hover:text-presson-text"
          >
            <X className="h-4 w-4 mr-1" />
            Skip Tour
          </Button>
          <Button
            onClick={handleNext}
            className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
          >
            {isLastStep ? 'Get Started' : 'Next'}
            {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GuidedTour;
