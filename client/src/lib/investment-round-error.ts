import { ApiError } from '@/lib/queryClient';

const GENERIC = 'Something went wrong saving the round. Try again.';

export function roundErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC;
  const code = error.errorCode;
  switch (error.status) {
    case 400:
      if (code === 'supersede_target_other_investment') {
        return 'That round belongs to a different investment.';
      }
      if (code === 'fundId mismatch') {
        return 'Internal fund mismatch. Refresh and retry.';
      }
      return 'Check the highlighted fields and try again.';
    case 401:
      return 'Your session expired. Sign in and retry.';
    case 403:
      return "You don't have access to this fund.";
    case 404:
      if (code === 'supersede_target_missing') {
        return 'The round you are correcting no longer exists. Refresh and retry.';
      }
      return 'That investment no longer exists. Refresh and retry.';
    case 409:
      if (code === 'round_already_superseded') {
        return 'This round was already corrected. Refresh to see the latest.';
      }
      return 'This looks like a duplicate submission. Refresh and retry.';
    case 428:
      return 'Could not submit the round (missing precondition). Refresh and retry.';
    default:
      return GENERIC;
  }
}
