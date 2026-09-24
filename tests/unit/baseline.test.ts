import { describe, expect, it } from 'vitest';
import { buildEvidence } from '../../src/collectors/evidence.js';
import { summarizeDiffFiles } from '../../src/collectors/diff-signals.js';
import {
  applyBaselineToFloor,
  matchBaseline,
  parseBaselineConfig,
} from '../../src/collectors/baseline.js';
import { computeDeterministicFloor } from '../../src/decision/floor.js';
import { PrMetadataSchema } from '../../src/schemas/profiler.js';

const metadata = PrMetadataSchema.parse({
  number: 1,
  title: 'baseline',
  body_excerpt: '',
  author: 'alice',
  labels: [],
  draft: false,
  base_ref: 'main',
  head_ref: 'feature',
  changed_requested_reviewers: 0,
  commits: 1,
});

describe('baseline policy', () => {
  it('raises a deterministic floor for matching path globs', () => {
    const config = parseBaselineConfig({
      version: 1,
      floors: [
        {
          paths: ['src/auth/**'],
          risk: 'HIGH',
          review_depth: 'EXPERT',
          recommended_checks: ['security_scan'],
        },
      ],
      overrides: [],
    });
    const diff = summarizeDiffFiles([
      { filename: 'src/auth/session.ts', status: 'modified', additions: 1, deletions: 0 },
    ]);
    const base = computeDeterministicFloor(buildEvidence({ metadata, diff }));
    const matched = matchBaseline(config, diff.top_paths);
    const floor = applyBaselineToFloor(base, matched);

    expect(matched.matched_rules).toEqual(['floors[0]']);
    expect(floor.risk).toBe('HIGH');
    expect(floor.review_depth).toBe('EXPERT');
    expect(floor.recommended_checks).toContain('security_scan');
    expect(floor.reason_codes).toContain('BASELINE_FLOOR');
  });

  it('supports an explicit deterministic rule that skips Jev', () => {
    const config = parseBaselineConfig({
      version: 1,
      floors: [],
      overrides: [{ paths: ['docs/**'], risk: 'LOW', review_depth: 'LIGHT', skip_jev: true }],
    });
    const matched = matchBaseline(config, ['docs/guide.md']);
    expect(matched.skip_jev).toBe(true);
    expect(matched.matched_rules).toEqual(['overrides[0]']);
  });

  it('rejects an invalid baseline rule instead of silently weakening policy', () => {
    expect(() => parseBaselineConfig({ version: 1, floors: [{ paths: ['src/**'], risk: 'NOPE' }] })).toThrow();
  });
});
