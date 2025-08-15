import { z } from 'zod';
/**
 * zBooleanish accepts common boolean representations from HTTP/query/form inputs
 * and normalizes to a strict boolean. Use ONLY at the DTO/request boundary.
 */
export const zBooleanish = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
  }
  return v;
}, z.boolean());

// Example DTO/domain split you can adopt in shared/schema.ts:
// export const UpdateFlagsDTO = z.object({ enabled: zBooleanish });
// export type UpdateFlagsDTO = z.infer<typeof UpdateFlagsDTO>;
// export const UpdateFlags = z.object({ enabled: z.boolean() });
// export type UpdateFlags = z.infer<typeof UpdateFlags>;
// export const toDomainFlags = (dto: UpdateFlagsDTO): UpdateFlags => UpdateFlags.parse(dto);