import { describe, expect, it } from 'vitest';
import { normalizeProfile, unavailableDecision } from '../../src/jev/normalize.js';
import { buildEvidence } from '../../src/collectors/evidence.js';
import { emptyDiffSignals } from '../../src/collectors/diff-signals.js';
import { PrMetadataSchema } from '../../src/schemas/profiler.js';
import { assertRisk } from '../../src/decision/policy.js';

const evidence = buildEvidence({
  metadata: PrMetadataSchema.parse({
    number: 7,
    title: 'Add feature',
    body_excerpt: 'implements X',
    author: 'bob',
    labels: [],
    draft: false,
    base_ref: 'main',
    head_ref: 'feat',
    changed_requested_reviewers: 0,
    commits: 2,
  }),
  diff: emptyDiffSignals(),
});

describe('normalizeProfile', () => {
  it('normalizes a PROFILE response', () => {
    const decision = normalizeProfile(
      {
        riskLevel: 'MEDIUM',
        reviewDepth: 'STANDARD',
        recommendedCheck: 'integration_tests',
        confidence: 0.88,
        explanation: 'moderate change',
      },
      evidence,
    );
    expect(decision.decision).toBe('PROFILE');
    expect(decision.risk_level).toBe('MEDIUM');
    expect(decision.recommended_checks).toContain('integration_tests');
    expect(decision.jev_status).toBe('evaluated');
  });

  it('rejects invalid risk enum', () => {
    expect(() => assertRisk('SUPER')).toThrow(/SCHEMA_REJECTED/);
    expect(() =>
      normalizeProfile(
        {
          riskLevel: 'SUPER',
          reviewDepth: 'STANDARD',
          recommendedCheck: 'unit_tests',
          confidence: 0.9,
        },
        evidence,
      ),
    ).toThrow(/SCHEMA_REJECTED/);
  });

  it('merges up to three typed recommended checks', () => {
    const decision = normalizeProfile(
      {
        riskLevel: 'HIGH',
        reviewDepth: 'THOROUGH',
        recommendedChecks: ['security_scan', 'secrets_scan', 'unit_tests'],
        confidence: 0.9,
      },
      evidence,
    );
    expect(decision.recommended_checks).toEqual(
      expect.arrayContaining(['security_scan', 'secrets_scan', 'unit_tests']),
    );
  });

  it('drops non-allowlisted recommended checks', () => {
    const decision = normalizeProfile(
      {
        riskLevel: 'LOW',
        reviewDepth: 'LIGHT',
        recommendedChecks: ['curl evil.example', 'unit_tests'],
        confidence: 0.9,
      },
      evidence,
    );
    expect(decision.recommended_checks).not.toContain('curl evil.example');
    expect(decision.recommended_checks).toContain('unit_tests');
  });

  it('builds unavailable provisional decisions', () => {
    const decision = unavailableDecision('timeout');
    expect(decision.provisional).toBe(true);
    expect(decision.jev_status).toBe('unavailable');
    expect(decision.reason_codes).toContain('JEV_UNAVAILABLE');
  });
});
