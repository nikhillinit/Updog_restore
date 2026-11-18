import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  VehicleOnboardingReceiptSchema,
  VehicleOnboardingRequestSchema,
  type VehicleOnboardingReceipt,
  type VehicleOnboardingRequest,
} from '@shared/contracts/lp-reporting/vehicle-onboarding.contract';
import { contractFetch, type LpReportingHookError } from './contract-fetch';

export interface VehicleOnboardingCommand {
  actorId: string;
  fundId: number;
  body: VehicleOnboardingRequest;
  serializedBody: string;
  idempotencyKey: string;
  sourceSha256: string;
}

export function useVehicleOnboarding() {
  const queryClient = useQueryClient();
  return useMutation<VehicleOnboardingReceipt, LpReportingHookError, VehicleOnboardingCommand>({
    retry: false,
    gcTime: 0,
    mutationFn: async (command) => {
      const body = VehicleOnboardingRequestSchema.parse(command.body);
      if (JSON.stringify(body) !== command.serializedBody) {
        throw new Error('The frozen declaration does not match its request.');
      }
      const receipt = await contractFetch(
        `/api/funds/${command.fundId}/imports/actuals/main-fund`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': command.idempotencyKey,
          },
          body: command.serializedBody,
        },
        VehicleOnboardingReceiptSchema,
        'The declaration receipt is invalid. Retry the same declaration to recover its result.'
      );
      if (
        receipt.fundId !== command.fundId ||
        String(receipt.actorId) !== command.actorId ||
        receipt.vehicleSlug !== body.vehicleSlug ||
        receipt.name !== body.name ||
        receipt.committedCapital !== body.committedCapital ||
        receipt.sourceArtifactSha256 !== command.sourceSha256 ||
        receipt.sourceLocator !== body.sourceLocator
      ) {
        throw Object.assign(
          new Error('The receipt does not match this declaration. Retry it unchanged.'),
          {
            code: 'CONTRACT_PARSE_ERROR',
            status: 200,
          }
        );
      }
      return receipt;
    },
    onSuccess: (receipt) => {
      void queryClient.invalidateQueries({ queryKey: ['fund-metrics', receipt.fundId] });
      void queryClient.invalidateQueries({ queryKey: ['dual-forecast', receipt.fundId] });
    },
  });
}
