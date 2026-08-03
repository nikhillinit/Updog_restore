/**
 * Task 19 exit-gate guard: narratives and notes are INTERNAL reference artifacts,
 * never closes, restatements, or approved reports. This asserts the source carries
 * no recipient / send / approval / report-export surface, and that no client module
 * reaches into the server service.
 *
 * Assertions target CODE tokens (camelCase field names, route-path segments) rather
 * than bare words, because the Task 18/19 gate COMMENTS legitimately spell out
 * "recipient", "approval", "export" as things that deliberately do not exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

const CONTRACT = 'shared/contracts/internal-analysis/internal-narrative-draft-v1.contract.ts';
const SERVICE = 'server/services/internal-analysis/internal-narrative-draft-service.ts';
const ROUTES = 'server/routes/internal-analysis.ts';
const PANEL = 'client/src/components/fund-results/InternalNarrativePanel.tsx';
const HOOK = 'client/src/hooks/useInternalNarratives.ts';
const QUARTERLY_CONTRACT = 'shared/contracts/internal-analysis/quarterly-review-v1.contract.ts';
const QUARTERLY_SERVICE = 'server/services/internal-analysis/quarterly-review-service.ts';
const CHECKPOINT_SERVICE = 'server/services/internal-analysis/analysis-checkpoint-service.ts';
const QUARTERLY_PANEL = 'client/src/components/internal-analysis/QuarterlyReviewPanel.tsx';
const QUARTERLY_HOOK = 'client/src/hooks/useQuarterlyReview.ts';

/** Feature identifiers that would betray an out-of-scope lifecycle; none appear in prose. */
const FORBIDDEN_IDENTIFIERS =
  /\b(exportedAt|approvedAt|approvedBy|approvalState|recipients|recipientId|recipientEmail|sentAt|deliveredAt|emailTo|sendTo)\b/;

describe('internal-analysis Task 19 boundary', () => {
  it('adds no recipient, send, approval, or export field to the narrative source', () => {
    for (const file of [CONTRACT, SERVICE, ROUTES]) {
      expect(read(file)).not.toMatch(FORBIDDEN_IDENTIFIERS);
    }
  });

  it('exposes no approval-state field on the contract', () => {
    // A `status:`/`approvalState:` zod field would be an approval lifecycle; res.status(
    // in routes is a method call, not a field, and is not matched here.
    expect(read(CONTRACT)).not.toMatch(/\b(status|approvalState|approval):\s*z\./);
  });

  it('registers no export/send/approve/recipient route path', () => {
    const routeSource = read(ROUTES);
    const paths = [
      ...routeSource.matchAll(/router\.(?:get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g),
    ].map((match) => match[1] ?? '');
    expect(paths.length).toBeGreaterThan(0);
    for (const routePath of paths) {
      expect(routePath).not.toMatch(/\/(export|send|approve|recipients?|deliver|email)\b/i);
    }
  });

  it('keeps the client narrative modules off the server service', () => {
    for (const file of [PANEL, HOOK]) {
      const source = read(file);
      expect(source).not.toContain('internal-narrative-draft-service');
      expect(source).not.toMatch(/from\s+['"][^'"]*\bserver\//);
    }
  });

  it('the route policy declares the Task 19 surface non-exportable', () => {
    const registrySource = read('server/route-policy/api-route-policy-registry.ts');
    expect(registrySource).toContain('(Task 19 gate)');
    expect(registrySource).toContain('PLAN_61 Task 19.');
  });

  it('keeps quarterly review free of recipient, approval, send, and export state', () => {
    for (const file of [QUARTERLY_CONTRACT, QUARTERLY_SERVICE, ROUTES]) {
      expect(read(file)).not.toMatch(FORBIDDEN_IDENTIFIERS);
    }
  });

  it('keeps quarterly client modules off server implementation imports', () => {
    for (const file of [QUARTERLY_PANEL, QUARTERLY_HOOK]) {
      const source = read(file);
      expect(source).not.toContain('quarterly-review-service');
      expect(source).not.toContain('analysis-checkpoint-service');
      expect(source).not.toMatch(/from\s+['"][^'"]*\bserver\//);
    }
  });

  it('does not expose quarterly review through anonymous share surfaces', () => {
    for (const file of ['server/routes/shares.ts', 'server/services/share-snapshot-service.ts']) {
      const source = read(file);
      expect(source).not.toMatch(/quarterly[-_]?review/i);
      expect(source).not.toContain('QuarterlyReview');
    }

    for (const file of [QUARTERLY_CONTRACT, QUARTERLY_SERVICE, CHECKPOINT_SERVICE, ROUTES]) {
      const source = read(file);
      expect(source).not.toMatch(
        /from\s+['"][^'"]*(?:share-snapshot-service|public-share)[^'"]*['"]/i
      );
      expect(source).not.toContain('PublicShareSnapshot');
    }
  });

  it('does not introduce operating-decisions persistence or conflate tasks with change provenance', () => {
    for (const file of [QUARTERLY_CONTRACT, QUARTERLY_SERVICE, QUARTERLY_PANEL]) {
      expect(read(file)).not.toMatch(/operating_decisions|operatingDecisionId/);
    }
    expect(read(QUARTERLY_CONTRACT)).not.toMatch(/changeReference[^}]*taskId/s);
  });

  it('keeps draft creation and version transitions behind their dedicated primitives', () => {
    const serviceSource = read('server/services/internal-analysis/analysis-checkpoint-service.ts');
    const inserts = [...serviceSource.matchAll(/\.insert\(internalAnalysisDrafts\)/g)];
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.index).toBeGreaterThan(serviceSource.indexOf('async insertDraftWithRoster'));
    expect(inserts[0]!.index).toBeLessThan(
      serviceSource.indexOf('async mutateOpenDraftWithRoster')
    );

    const versionBumps = [
      ...serviceSource.matchAll(/version:\s*sql`\$\{internalAnalysisDrafts\.version\}\s*\+\s*1`/g),
    ];
    expect(versionBumps).toHaveLength(2);
    const mutationStart = serviceSource.indexOf('async mutateOpenDraftWithRoster');
    const nextPort = serviceSource.indexOf('async findQuarterlyReviewReceipt', mutationStart);
    for (const bump of versionBumps) {
      expect(bump.index).toBeGreaterThan(mutationStart);
      expect(bump.index).toBeLessThan(nextPort);
    }
  });

  it('logs quarterly integrity failures through the sanitized structured event', () => {
    const routeSource = read(ROUTES);
    expect(routeSource).toContain("event: 'quarterly-review.command-rejected'");
    expect(routeSource).toContain('fundId: context?.fundId');
    expect(routeSource).toContain("error.code === 'QUARTERLY_REVIEW_INCOMPLETE'");
    expect(routeSource).toContain("error.code === 'QUARTERLY_REVIEW_ROSTER_CORRUPT'");
    expect(routeSource).not.toMatch(
      /quarterly-review\.command-rejected[\s\S]{0,300}(companyName|note|waiverReason)/
    );
  });
});
