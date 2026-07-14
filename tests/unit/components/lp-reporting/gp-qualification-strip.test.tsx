/**
 * GP qualification strip (Plan 9 Wave 9B1, D-F.3).
 *
 * Pins the qualification derivation: an unqualified package is NEVER
 * presented as export-ready, and 'actionable' requires locked run +
 * assembled package + zero blockers + a proven deterministic export.
 */

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  GpQualificationStrip,
  deriveQualificationStrip,
  type QualificationSnapshot,
} from '@/components/lp-reporting/GpQualificationStrip';

function snapshot(overrides: Partial<QualificationSnapshot> = {}): QualificationSnapshot {
  return {
    metricRun: {
      metricRunId: 7,
      status: 'locked',
      asOfDate: '2026-06-30',
      evidenceCount: 2,
    },
    reportPackage: { status: 'assembled', asOfDate: '2026-06-30' },
    exportBlockers: [],
    exportProven: false,
    gateErrorReason: null,
    lastStoredExportAt: null,
    ...overrides,
  };
}

describe('deriveQualificationStrip', () => {
  it('discloses no metric run as not export-ready', () => {
    const model = deriveQualificationStrip(null);

    expect(model.state).toBe('not_actionable');
    expect(model.label).toBe('Not export-ready');
    expect(model.asOfDate).toBeNull();
    expect(model.metricRunLabel).toBe('No metric run disclosed');
    expect(model.packageLabel).toBe('No report package assembled');
  });

  it('keeps a draft run without evidence blocked with the evidence reason', () => {
    const model = deriveQualificationStrip(
      snapshot({
        metricRun: { metricRunId: 3, status: 'draft', asOfDate: '2026-06-30', evidenceCount: 0 },
        reportPackage: null,
      })
    );

    expect(model.state).toBe('not_actionable');
    expect(model.reason).toMatch(/no evidence records/i);
  });

  it('keeps an approved run not export-ready until locked', () => {
    const model = deriveQualificationStrip(
      snapshot({
        metricRun: { metricRunId: 3, status: 'approved', asOfDate: '2026-06-30', evidenceCount: 1 },
        reportPackage: null,
      })
    );

    expect(model.state).toBe('not_actionable');
    expect(model.reason).toMatch(/lock it/i);
  });

  it('keeps a locked run without a package not export-ready', () => {
    const model = deriveQualificationStrip(snapshot({ reportPackage: null }));

    expect(model.state).toBe('not_actionable');
    expect(model.reason).toMatch(/assemble the report package/i);
  });

  it('presents disclosed export blockers as export blocked, never ready', () => {
    const model = deriveQualificationStrip(
      snapshot({
        exportBlockers: [{ code: 'REDACTION_REQUIRED', message: 'Evidence requires redaction' }],
        exportProven: true,
      })
    );

    expect(model.state).toBe('not_actionable');
    expect(model.label).toBe('Export blocked');
    expect(model.blockers).toHaveLength(1);
  });

  it('never presents an assembled package as export-ready before an export is proven', () => {
    const model = deriveQualificationStrip(snapshot({ exportProven: false }));

    expect(model.state).toBe('indicative');
    expect(model.label).toBe('Qualified pending export gates');
  });

  it('grants export-ready only for locked + assembled + unblocked + proven export', () => {
    const model = deriveQualificationStrip(snapshot({ exportProven: true }));

    expect(model.state).toBe('actionable');
    expect(model.label).toBe('Export-ready');
  });

  // -- Review fixes (P1-1): fail-closed presentation --

  it('never presents a historical stored export as readiness (fail-closed)', () => {
    const model = deriveQualificationStrip(
      snapshot({ lastStoredExportAt: '2026-06-29T10:00:00.000Z', exportProven: false })
    );

    expect(model.state).toBe('indicative');
    expect(model.label).toBe('Qualified pending export gates');
    expect(model.lastStoredExportAt).toBe('2026-06-29T10:00:00.000Z');
  });

  it('fails closed as qualification unverified on a gate error without structured blockers', () => {
    const model = deriveQualificationStrip(
      snapshot({ gateErrorReason: 'Stored export does not match the current artifact.' })
    );

    expect(model.state).toBe('not_actionable');
    expect(model.label).toBe('Qualification unverified');
    expect(model.reason).toContain('Stored export does not match');
  });

  it('keeps a failing current gate blocked even with a historical record and prior proof', () => {
    const model = deriveQualificationStrip(
      snapshot({
        lastStoredExportAt: '2026-06-29T10:00:00.000Z',
        exportProven: true,
        gateErrorReason: 'H9 fingerprint changed since assembly.',
      })
    );

    expect(model.state).toBe('not_actionable');
    expect(model.label).toBe('Qualification unverified');
    expect(model.label).not.toBe('Export-ready');
  });
});

describe('GpQualificationStrip', () => {
  afterEach(() => cleanup());

  it('renders the empty disclosure with badge, as-of placeholder, and pipeline fields', () => {
    render(<GpQualificationStrip snapshot={null} />);

    expect(screen.getByRole('heading', { name: 'Report qualification' })).toBeInTheDocument();
    expect(screen.getByText('Not export-ready')).toBeInTheDocument();
    expect(screen.getByTestId('gp-qualification-metric-run')).toHaveTextContent(
      'No metric run disclosed'
    );
    expect(screen.getByTestId('gp-qualification-package')).toHaveTextContent(
      'No report package assembled'
    );
    expect(screen.queryByTestId('gp-qualification-blockers')).not.toBeInTheDocument();
  });

  it('lists disclosed export blockers inline, not tooltip-only', () => {
    render(
      <GpQualificationStrip
        snapshot={snapshot({
          exportBlockers: [
            { code: 'REDACTION_REQUIRED', message: 'Evidence requires redaction' },
            { code: 'CONFIDENTIALITY', message: 'Restricted evidence attached' },
          ],
        })}
      />
    );

    const blockers = screen.getByTestId('gp-qualification-blockers');
    expect(blockers).toHaveTextContent('Evidence requires redaction');
    expect(blockers).toHaveTextContent('Restricted evidence attached');
    expect(screen.getByText('Export blocked')).toBeInTheDocument();
  });

  it('renders the stored-export history line without upgrading the badge', () => {
    render(
      <GpQualificationStrip
        snapshot={snapshot({ lastStoredExportAt: '2026-06-29T10:00:00.000Z' })}
      />
    );

    expect(screen.getByText('Last stored export')).toBeInTheDocument();
    expect(screen.getByTestId('gp-qualification-last-export')).toHaveTextContent(
      '2026-06-29T10:00:00.000Z'
    );
    expect(screen.queryByText('Export-ready')).not.toBeInTheDocument();
    expect(screen.getByText('Qualified pending export gates')).toBeInTheDocument();
  });

  it('shows the as-of date with tabular numerals when a run is disclosed', () => {
    render(<GpQualificationStrip snapshot={snapshot()} />);

    const asOf = screen.getByText('2026-06-30');
    expect(asOf.className).toContain('tabular-nums');
    expect(screen.getByTestId('gp-qualification-metric-run')).toHaveTextContent(
      'Metric run #7 — locked'
    );
  });
});
