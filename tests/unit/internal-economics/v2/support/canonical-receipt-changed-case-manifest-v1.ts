/**
 * Changed-case manifest for the F2 receipt 2.1.0 transition.
 *
 * Executable evidence that V2-S-0101's result hash changed for exactly one
 * reason: the receipt version and hash domain changed. The normalized input,
 * the normalizer, and normalizedInputHash are byte-identical across the
 * transition. A consuming test asserts:
 *
 *   1. the frozen 2.0.0 result hash below is preserved as recorded;
 *   2. the live 2.1.0 derivation's resultHash equals afterResultHash;
 *   3. beforeResultHash !== afterResultHash.
 *
 * beforeResultHash is the frozen 2.0.0 result hash captured at the F2-entry
 * base (origin/main@4d0bac211, receipt summary-payload hash domain).
 * afterResultHash is the 2.1.0 full-receipt-preimage hash, independently
 * reproduced by the test oracle (canonical-receipt-oracle-v1).
 */
export const CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V1 = [
  {
    caseId: 'V2-S-0101',
    beforeReceiptVersion: 'internal-economics-receipt/2.0.0',
    afterReceiptVersion: 'internal-economics-receipt/2.1.0',
    normalizedInputHash:
      '8542190fbde01380510687ce1648cd0b18451e3da5a557934c26b470ca0f70ab',
    beforeResultHash:
      'e0263b99740005feffcb89bb000d931b00b9232b6086b13056849a191eb07e28',
    afterResultHash:
      '36b5c917107abc2326ec7cc7048d8835e34cf4258705297740618824fe261331',
    reason:
      'Receipt 2.1.0 replaces the 2.0.0 summary-payload hash domain with the single full-receipt preimage (receipt without resultHash), closes the component manifest, and adds openingPositions/journal disclosures; the normalized input and normalizedInputHash are unchanged.',
  },
] as const;
