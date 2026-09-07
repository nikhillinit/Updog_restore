/** Changed-case manifest for receipt 2.4.0 security-lineage correction. */
export const CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V3 = [
  {
    caseId: 'V2-S-0101',
    beforeReceiptVersion: 'internal-economics-receipt/2.3.0',
    afterReceiptVersion: 'internal-economics-receipt/2.4.0',
    normalizedInputHash: '8542190fbde01380510687ce1648cd0b18451e3da5a557934c26b470ca0f70ab',
    beforeResultHash: '5b4152788139b3fa55c5d902da420463e8897ad717a1c0018970f5a8a0f73973',
    afterResultHash: '3954453140ae346b9254aef43a70266a794bd5d68905597afe699aad01319b84',
    reason:
      'Receipt, serializer, event-engine, composite, and deal-by-deal identities move to security-lineage versions; normalized input and economics stay unchanged.',
  },
  {
    caseId: 'V2-S-0100',
    beforeReceiptVersion: 'internal-economics-receipt/2.3.0',
    afterReceiptVersion: 'internal-economics-receipt/2.4.0',
    normalizedInputHash: '273367406da6294a58cc2ed6ebfc0d0ec2d67a1356f81fb59f51782e1a351d98',
    beforeResultHash: '91f1034ecbdca46edf7086044c2816961d69d1256b7847d4ba7b3807b5df73d2',
    afterResultHash: '41a38f2ff1088ed4713476efb408fae6acc99298b4efe46f5ec7c05dda7d08a1',
    reason:
      'Receipt, serializer, event-engine, composite, and deal-by-deal identities move to security-lineage versions; normalized input and economics stay unchanged.',
  },
  {
    caseId: 'V2-S-0102-deal-by-deal',
    beforeReceiptVersion: 'internal-economics-receipt/2.3.0',
    afterReceiptVersion: 'internal-economics-receipt/2.4.0',
    normalizedInputHash: '006353987e891a32cf413df12cbd032306a0488edaa761340e29645e7d0f3009',
    beforeResultHash: 'c5f3281fef0e249b9bae28b350889383bfd07c29d66a8270d86b5591fff35ad9',
    afterResultHash: '1a1c2c61a9b0fa37fff6e4db3b53f753942684c6725ecde7fa32e6f9492b01dc',
    reason:
      'Multi-security realization proceeds are emitted and routed by exact admitted investment-lot security lineage.',
  },
  {
    caseId: 'V2-S-0102-whole-fund',
    beforeReceiptVersion: 'internal-economics-receipt/2.3.0',
    afterReceiptVersion: 'internal-economics-receipt/2.4.0',
    normalizedInputHash: '006353987e891a32cf413df12cbd032306a0488edaa761340e29645e7d0f3009',
    beforeResultHash: '89e19bde445c409f86961046687dd6a8f4ba45f9588d7bb3c95718de5553f692',
    afterResultHash: '13ee8a107f3c3858c77564adbeca7c42975d6c9c9f80ea07e1140f87c765849d',
    reason:
      'Private security-lineage receipt material changes while whole-fund economics remain conserved.',
  },
] as const;
