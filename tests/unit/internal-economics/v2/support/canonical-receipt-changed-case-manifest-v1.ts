/**
 * Changed-case manifest for the F3b receipt 2.2.0 transition.
 *
 * Executable evidence that each listed case's result hash changed for exactly
 * one recorded reason. The normalized input, the normalizer, and
 * normalizedInputHash are byte-identical across each transition. A consuming
 * test asserts:
 *
 *   1. the frozen before-result hash below is preserved as recorded;
 *   2. the live 2.2.0 derivation's resultHash equals afterResultHash;
 *   3. beforeResultHash !== afterResultHash.
 *
 * V2-S-0101's beforeResultHash is the frozen 2.0.0 result hash captured at
 * the F2-entry base (origin/main@4d0bac211, receipt summary-payload hash
 * domain). V2-S-0100's beforeResultHash is the frozen 2.1.0 full-preimage
 * hash captured at the F2 certification base; its 2.1.0 receipt literal is
 * retained byte-frozen in the truth-case file as historical certification.
 * Each afterResultHash is the 2.2.0 full-receipt-preimage hash, independently
 * reproduced by the test oracle (canonical-receipt-oracle-v1).
 */
export const CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V1 = [
  {
    caseId: 'V2-S-0101',
    beforeReceiptVersion: 'internal-economics-receipt/2.0.0',
    afterReceiptVersion: 'internal-economics-receipt/2.2.0',
    normalizedInputHash: '8542190fbde01380510687ce1648cd0b18451e3da5a557934c26b470ca0f70ab',
    beforeResultHash: 'e0263b99740005feffcb89bb000d931b00b9232b6086b13056849a191eb07e28',
    afterResultHash: '1245dc90f4fa71ad11769a74ffc4cd2c599240261d2759a346f6c405202d5187',
    reason:
      'Receipt 2.2.0 replaces the 2.0.0 summary-payload hash domain with the single full-receipt preimage (receipt without resultHash), discloses lineage, and updates implementation component versions; the normalized input and normalizedInputHash are unchanged.',
  },
  {
    caseId: 'V2-S-0100',
    beforeReceiptVersion: 'internal-economics-receipt/2.1.0',
    afterReceiptVersion: 'internal-economics-receipt/2.2.0',
    normalizedInputHash: '273367406da6294a58cc2ed6ebfc0d0ec2d67a1356f81fb59f51782e1a351d98',
    beforeResultHash: 'ea74f8d284ba0625568f89e9b3ffe1dad32abb9d37bb0c0b05bdc2735a48916f',
    afterResultHash: '152d4b0daf24b6a75139532dbdad1b27284ee0b64371c823f9e814efe93c1535',
    reason:
      'Receipt 2.2.0 adds the lineage disclosure and updates the receipt, composite-implementation, event-engine, waterfall, and serializer version literals; the derived economics (fund cash equation, opening positions, journal, ledgers, tiers) and normalizedInputHash are byte-identical to the frozen 2.1.0 receipt.',
  },
] as const;
