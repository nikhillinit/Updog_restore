/**
 * Changed-case manifest for the F_2.0.7 receipt 2.3.0 transition.
 *
 * Executable evidence that each listed case's result hash changed for exactly
 * one recorded reason. The normalized input, the normalizer, and
 * normalizedInputHash are byte-identical across each transition. A consuming
 * test asserts:
 *
 *   1. the frozen before-result hash below is preserved as recorded (it is
 *      byte-identical to the corresponding afterResultHash in the frozen
 *      manifest v1, which certifies the earlier-versions -> 2.2.0
 *      transitions);
 *   2. the live 2.3.0 derivation's resultHash equals afterResultHash;
 *   3. beforeResultHash !== afterResultHash.
 *
 * Each beforeResultHash is the frozen 2.2.0 full-receipt-preimage hash under
 * the 2.2.1 implementation identities (manifest v1 afterResultHash, frozen
 * historical evidence — never regenerated). Each afterResultHash is the 2.3.0
 * full-receipt-preimage hash, generated canonically by running the live
 * engine (deriveInternalEconomicsV2) on the case input, and independently
 * reproduced by the test oracle (canonical-receipt-oracle-v1).
 */
export const CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V2 = [
  {
    caseId: 'V2-S-0101',
    beforeReceiptVersion: 'internal-economics-receipt/2.2.0',
    afterReceiptVersion: 'internal-economics-receipt/2.3.0',
    normalizedInputHash: '8542190fbde01380510687ce1648cd0b18451e3da5a557934c26b470ca0f70ab',
    beforeResultHash: '78e001fb1c76ffc96da48d886a545d9bff9ce69cc9f5c25a22dc557026d230e4',
    afterResultHash: '5b4152788139b3fa55c5d902da420463e8897ad717a1c0018970f5a8a0f73973',
    reason:
      'Receipt 2.3.0 adds expenseTotalsByCategory to the closed receipt shape and canonical hash preimage (all-zero for this expense-free case) and moves the composite, event-engine, and serializer identities to 2.3.0 (missing-first refusal precedence, positive caller-event magnitudes, conditional other-description validation); the derived economics, the normalized input, and normalizedInputHash are unchanged.',
  },
  {
    caseId: 'V2-S-0100',
    beforeReceiptVersion: 'internal-economics-receipt/2.2.0',
    afterReceiptVersion: 'internal-economics-receipt/2.3.0',
    normalizedInputHash: '273367406da6294a58cc2ed6ebfc0d0ec2d67a1356f81fb59f51782e1a351d98',
    beforeResultHash: '63a0826d2ad848eae361ce5a97f32513257ac8eb9af1f95c1f079dd9fda8cc94',
    afterResultHash: '91f1034ecbdca46edf7086044c2816961d69d1256b7847d4ba7b3807b5df73d2',
    reason:
      'Receipt 2.3.0 adds expenseTotalsByCategory to the closed receipt shape and canonical hash preimage (all-zero for this expense-free case) and moves the composite, event-engine, and serializer identities to 2.3.0 (missing-first refusal precedence, positive caller-event magnitudes, conditional other-description validation); the derived economics, the normalized input, and normalizedInputHash are unchanged.',
  },
] as const;
