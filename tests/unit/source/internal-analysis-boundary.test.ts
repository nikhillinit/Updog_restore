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
});
