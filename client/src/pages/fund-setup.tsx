// client/src/pages/fund-setup.tsx
import React from "react";
import { useSearchParams } from "react-router-dom";
import InvestmentStrategyStep from "./InvestmentStrategyStep";
import ExitRecyclingStep from "./ExitRecyclingStep";
import WaterfallStep from "./WaterfallStep";
import StepNotFound from "./steps/StepNotFound";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type StepKey =
  | "investment-strategy"
  | "exit-recycling"
  | "waterfall"
  | "not-found";

const stepComponents: Record<string, React.ComponentType<any>> = {
  "investment-strategy": InvestmentStrategyStep,
  "exit-recycling": ExitRecyclingStep,
  "waterfall": WaterfallStep,
};

function normalizeStep(value: string | null): StepKey {
  if (!value) return "investment-strategy";

  const v = value.toLowerCase();
  switch (v) {
    case "2":
    case "investment-strategy":
    case "investment_strategy":
      return "investment-strategy";
    case "3":
    case "exit-recycling":
    case "exit_recycling":
      return "exit-recycling";
    case "4":
    case "waterfall":
      return "waterfall";
    default:
      return "not-found";
  }
}

export default function FundSetup() {
  const [params] = useSearchParams();
  const key = normalizeStep(params.get("step"));
  const Step = stepComponents[key] ?? StepNotFound;

  return (
    <ErrorBoundary>
      <div data-testid={`wizard-step-${key}-container`}>
        <Step />
      </div>
    </ErrorBoundary>
  );
}