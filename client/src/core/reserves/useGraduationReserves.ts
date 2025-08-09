import { useMemo } from "react";
// adjust the path below if your store lives elsewhere
import { useFundStore } from "../../state/useFundStore";
import { computeReservesFromGraduation } from "./computeReservesFromGraduation";

export function useGraduationReserves() {
  const fund = useFundStore((s: any) => s.fundData);

  return useMemo(() => {
    const graduationRates = fund?.graduationRates ?? {
      seedToA: { graduate: 35, fail: 35, remain: 30, months: 18 },
      aToB:    { graduate: 50, fail: 25, remain: 25, months: 24 },
      bToC:    { graduate: 60, fail: 20, remain: 20, months: 30 },
    };

    // If you already modeled these in fundData, replace defaults with store values
    const followOnChecks = fund?.followOnChecks ?? { A: 800_000, B: 1_500_000, C: 2_500_000 };

    const totalCommitment = fund?.totalCommitment ?? 100_000_000;
    const targetCompanies = fund?.targetCompanies ?? 30;
    const deploymentPacePerYear = fund?.deploymentPace ?? 10;
    
    // Calculate average check size based on commitment and companies
    const avgCheckSize = totalCommitment / targetCompanies / 2; // Rough estimate for seed round

    return computeReservesFromGraduation({
      totalCommitment,
      targetCompanies,
      avgCheckSize,
      deploymentPacePerYear,
      graduationRates: {
        seedToA: graduationRates.seedToA,
        aToB: graduationRates.aToB,
        bToC: graduationRates.bToC,
      },
      followOnChecks,
      startQuarter: 0,
      horizonQuarters: 64, // TODO: bind to Fund Basics years * 4
    });
  }, [fund]);
}
