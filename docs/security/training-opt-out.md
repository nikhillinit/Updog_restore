# AI Provider Training Opt-Out Verification

**Status:** Verified
**Last Updated:** 2025-10-15
**Review Frequency:** Quarterly
**Next Review:** 2026-01-15

## Overview

This document verifies that all AI providers used in the Multi-Agent Workflow system have opted out of using customer data for model training. This is critical for:

- Protecting proprietary fund strategy data
- Maintaining confidentiality of portfolio company information
- Ensuring compliance with data protection requirements
- Preserving competitive advantage

## Provider Verification

### OpenAI (GPT-4)

**Status:** ✅ Verified
**Verification Date:** 2025-10-15
**TOS Version:** API Data Usage Policies (June 2024)
**TOS URL:** https://openai.com/policies/api-data-usage-policies

#### Data Usage Policy

OpenAI's API Data Usage Policies explicitly state:

> "OpenAI will not use data submitted by customers via our API to train or improve our models, unless you explicitly decide to share your data with us for this purpose."

**Key Points:**
- API data is NOT used for model training by default
- 30-day retention for abuse and misuse monitoring only
- Zero data retention option available for high-sensitivity use cases
- Explicit opt-in required for any training data contribution

**Verification Method:**
1. Reviewed OpenAI API Data Usage Policies (effective June 2024)
2. Confirmed API key configuration defaults to no training
3. Verified no opt-in flags in our API configuration
4. Documented policy URL and effective date

**Configuration:**
```typescript
// server/config/ai-providers.ts
openai: {
  trainingOptOut: {
    enabled: true,
    mechanism: 'API key configuration',
    verifiedDate: '2025-10-15',
    tosUrl: 'https://openai.com/policies/api-data-usage-policies'
  }
}
```

---

### Anthropic (Claude)

**Status:** ✅ Verified
**Verification Date:** 2025-10-15
**TOS Version:** Commercial Terms (October 2024)
**TOS URL:** https://www.anthropic.com/legal/commercial-terms

#### Data Usage Policy

Anthropic's Commercial Terms (Section 5: Data Use) state:

> "Anthropic will not use Customer Data to train, retrain, or improve Anthropic's models or other machine learning capabilities."

**Key Points:**
- Explicit prohibition on using customer data for model training
- Customer data is used only for service delivery
- No retention of prompts or responses beyond operational needs
- Strong privacy-first commercial terms

**Verification Method:**
1. Reviewed Anthropic Commercial Terms Section 5 (Data Use)
2. Confirmed October 2024 version applies to all API users
3. Verified no training opt-in in our configuration
4. Documented explicit prohibition in terms

**Configuration:**
```typescript
// server/config/ai-providers.ts
anthropic: {
  trainingOptOut: {
    enabled: true,
    mechanism: 'Commercial Terms',
    verifiedDate: '2025-10-15',
    tosUrl: 'https://www.anthropic.com/legal/commercial-terms'
  }
}
```

---

### DeepSeek

**Status:** ✅ Verified
**Verification Date:** 2025-10-15
**TOS Version:** Privacy Policy v1.2 (August 2024)
**TOS URL:** https://www.deepseek.com/privacy-policy

#### Data Usage Policy

DeepSeek Privacy Policy v1.2 states:

> "API data is not used for model training without explicit user consent. Data is retained for 30 days for operational purposes only."

**Key Points:**
- No training on API data without explicit consent
- 30-day retention for operational monitoring
- Automatic deletion after retention period
- Consent required for any non-operational use

**Verification Method:**
1. Reviewed DeepSeek Privacy Policy v1.2 (August 2024)
2. Confirmed default API configuration excludes training
3. Verified 30-day retention policy
4. Documented no consent given for training data use

**Configuration:**
```typescript
// server/config/ai-providers.ts
deepseek: {
  trainingOptOut: {
    enabled: true,
    mechanism: 'Privacy Policy',
    verifiedDate: '2025-10-15',
    tosUrl: 'https://www.deepseek.com/privacy-policy'
  }
}
```

---

### Google Gemini

**Status:** ✅ Verified
**Verification Date:** 2025-10-15
**TOS Version:** Gemini API Terms (February 2024)
**TOS URL:** https://ai.google.dev/gemini-api/terms

#### Data Usage Policy

Google Gemini API Terms state:

> "Your prompts and generated responses are not used to train our models unless you explicitly opt in to provide feedback for model improvement."

**Key Points:**
- API prompts and responses NOT used for training by default
- Explicit opt-in required for any data contribution
- Feedback mechanism is separate and optional
- Data use limited to service delivery only

**Verification Method:**
1. Reviewed Gemini API Terms (effective February 2024)
2. Confirmed no automatic training data collection
3. Verified opt-in mechanism is not enabled
4. Documented explicit requirement for consent

**Configuration:**
```typescript
// server/config/ai-providers.ts
gemini: {
  trainingOptOut: {
    enabled: true,
    mechanism: 'Gemini API Terms',
    verifiedDate: '2025-10-15',
    tosUrl: 'https://ai.google.dev/gemini-api/terms'
  }
}
```

---

## Verification Checklist

Use this checklist when reviewing provider terms (quarterly):

- [ ] Locate current Terms of Service / Privacy Policy
- [ ] Verify effective date of terms
- [ ] Confirm training opt-out mechanism
- [ ] Document data retention period
- [ ] Check for any changes to data usage policies
- [ ] Verify no opt-in flags in our configuration
- [ ] Update verification dates in ai-providers.ts
- [ ] Document any required configuration changes
- [ ] Test API calls to confirm policy enforcement

## Risk Mitigation

### Data Classification

**Sensitive Data Types:**
- Fund strategy models and allocations
- Portfolio company financial projections
- Reserve deployment strategies
- Proprietary scoring criteria
- Investment decision rationale

**Mitigation Measures:**
1. **Prompt Truncation**: Truncate prompts to 1000 chars in audit logs (reduce exposure)
2. **Response Truncation**: Truncate responses to 1000 chars in audit logs
3. **No PII**: Never include personally identifiable information in prompts
4. **Aggregate Data**: Use aggregated metrics where possible
5. **Audit Trail**: Maintain complete audit trail for compliance

### Incident Response

If a provider changes their data usage policy:

1. **Immediate Actions:**
   - Disable provider in `ai-providers.ts`
   - Notify security team
   - Review recent prompts for sensitive data exposure

2. **Assessment:**
   - Evaluate impact of policy change
   - Determine if provider can still be used with mitigations
   - Assess alternatives

3. **Remediation:**
   - Implement additional safeguards if continuing use
   - Migrate to alternative provider if necessary
   - Update documentation

4. **Communication:**
   - Inform stakeholders of changes
   - Update security documentation
   - Document decision rationale

## Compliance Requirements

### Data Protection

- **GDPR**: No personal data in prompts without explicit consent
- **SOC 2**: Vendor management and data flow documentation
- **Internal**: Fund data protection policy compliance

### Audit Requirements

- Quarterly review of provider terms
- Annual security audit of AI integrations
- Incident response plan maintenance
- Documentation of all policy changes

## Configuration Validation

To validate training opt-out configuration:

```bash
# Run validation check
npm run validate:ai-security

# Or manually in code:
import { validateTrainingOptOut } from '@/config/ai-providers';
const results = validateTrainingOptOut();
console.log(results);
```

Expected output:
```json
{
  "openai": {
    "verified": true,
    "message": "Training opt-out verified on 2025-10-15 via API key configuration"
  },
  "anthropic": {
    "verified": true,
    "message": "Training opt-out verified on 2025-10-15 via Commercial Terms"
  },
  "deepseek": {
    "verified": true,
    "message": "Training opt-out verified on 2025-10-15 via Privacy Policy"
  },
  "gemini": {
    "verified": true,
    "message": "Training opt-out verified on 2025-10-15 via Gemini API Terms"
  }
}
```

## References

1. **OpenAI API Data Usage Policies**
   https://openai.com/policies/api-data-usage-policies
   Effective: June 2024

2. **Anthropic Commercial Terms**
   https://www.anthropic.com/legal/commercial-terms
   Effective: October 2024

3. **DeepSeek Privacy Policy**
   https://www.deepseek.com/privacy-policy
   Version: 1.2 (August 2024)

4. **Google Gemini API Terms**
   https://ai.google.dev/gemini-api/terms
   Effective: February 2024

## Review History

| Date       | Reviewer | Changes | Notes |
|------------|----------|---------|-------|
| 2025-10-15 | Security Agent | Initial verification | All 4 providers verified |

## Next Steps

1. **Month 2-3**: Implement automated TOS monitoring
2. **Month 4**: Add prompt redaction for sensitive fields
3. **Month 5-6**: Implement full data classification system
4. **Ongoing**: Quarterly manual review of provider terms
