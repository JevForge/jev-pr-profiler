import { describe, expect, it } from 'vitest';
import { summarizeDiffFiles } from '../../src/collectors/diff-signals.js';
import { computeDeterministicFloor } from '../../src/decision/floor.js';
import { buildEvidence } from '../../src/collectors/evidence.js';
import { PrMetadataSchema } from '../../src/schemas/profiler.js';

function meta(labels: string[] = []) {
  return PrMetadataSchema.parse({
    number: 1,
    title: 'Test PR',
    body_excerpt: 'body',
    author: 'alice',
    labels,
    draft: false,
    base_ref: 'main',
    head_ref: 'feature',
    changed_requested_reviewers: 0,
    commits: 1,
  });
}

describe('computeDeterministicFloor', () => {
  it('keeps docs-only changes low even with large doc churn', () => {
    const files = Array.from({ length: 40 }, (_, i) => ({
      filename: `docs/page-${i}.md`,
      status: 'added',
      additions: 200,
      deletions: 0,
    }));
    const diff = summarizeDiffFiles(files);
    expect(diff.touch_docs_only).toBe(true);
    const floor = computeDeterministicFloor(buildEvidence({ metadata: meta(), diff }));
    expect(floor.risk).toBe('LOW');
    expect(floor.review_depth).toBe('LIGHT');
    expect(floor.reason_codes).toContain('DOCS_ONLY');
    expect(floor.reason_codes).not.toContain('MANY_FILES');
    expect(floor.recommended_checks).toContain('docs_review');
  });

  it('keeps docs-only low', () => {
    const diff = summarizeDiffFiles([
      { filename: 'README.md', status: 'modified', additions: 10, deletions: 2 },
      { filename: 'docs/guide.md', status: 'added', additions: 40, deletions: 0 },
    ]);
    const floor = computeDeterministicFloor(buildEvidence({ metadata: meta(), diff }));
    expect(floor.risk).toBe('LOW');
    expect(floor.reason_codes).toContain('DOCS_ONLY');
    expect(floor.recommended_checks).toContain('docs_review');
  });

  it('raises floor for auth and sensitive paths', () => {
    const diff = summarizeDiffFiles([
      { filename: 'src/auth/login.ts', status: 'modified', additions: 120, deletions: 40 },
      { filename: '.github/workflows/ci.yml', status: 'modified', additions: 5, deletions: 1 },
    ]);
    const floor = computeDeterministicFloor(buildEvidence({ metadata: meta(), diff }));
    expect(floor.risk).toBe('HIGH');
    expect(floor.review_depth).toBe('EXPERT');
    expect(floor.reason_codes).toContain('AUTH_SECURITY_TOUCH');
    expect(floor.recommended_checks).toContain('security_scan');
  });

  it('raises for security findings and incidents', () => {
    const diff = summarizeDiffFiles([
      { filename: 'src/api.ts', status: 'modified', additions: 50, deletions: 10 },
    ]);
    const floor = computeDeterministicFloor(
      buildEvidence({
        metadata: meta(['breaking-change']),
        diff,
        security: {
          total: 3,
          critical: 1,
          high: 1,
          medium: 1,
          low: 0,
          categories: ['sca'],
          in_change: 2,
        },
        incidents: {
          recent_count: 2,
          severity_max: 'high',
          related_components: ['api'],
          days_lookback: 90,
        },
      }),
    );
    expect(floor.risk).toBe('CRITICAL');
    expect(floor.reason_codes).toContain('SECURITY_FINDINGS');
    expect(floor.reason_codes).toContain('INCIDENT_HISTORY');
    expect(floor.reason_codes).toContain('LABELS_BREAKING');
  });

  it('flags coverage drops', () => {
    const diff = summarizeDiffFiles([
      { filename: 'src/x.ts', status: 'modified', additions: 30, deletions: 5 },
    ]);
    const floor = computeDeterministicFloor(
      buildEvidence({
        metadata: meta(),
        diff,
        coverage: {
          lines_pct: 70,
          branches_pct: 60,
          delta_lines_pct: -5,
          uncovered_paths: ['src/x.ts'],
        },
      }),
    );
    expect(floor.reason_codes).toContain('COVERAGE_DROP');
    expect(floor.recommended_checks).toContain('integration_tests');
  });
});
