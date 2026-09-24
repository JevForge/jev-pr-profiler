import { describe, expect, it } from 'vitest';
import { buildProfileQuestions, summarizeState } from '../../src/jev/questions.js';
import { RECOMMENDED_CHECKS, RISK_LEVELS, REVIEW_DEPTHS } from '../../src/schemas/enums.js';
import { buildEvidence } from '../../src/collectors/evidence.js';
import { emptyDiffSignals } from '../../src/collectors/diff-signals.js';
import { PrMetadataSchema } from '../../src/schemas/profiler.js';

describe('Jev question contract', () => {
  it('only offers allowlisted enums to Jev', () => {
    const questions = buildProfileQuestions();
    expect(Object.keys(questions.risk_level.criteria).sort()).toEqual([...RISK_LEVELS].sort());
    expect(Object.keys(questions.review_depth.criteria).sort()).toEqual([...REVIEW_DEPTHS].sort());
    expect(Object.keys(questions.recommended_check_primary.criteria).sort()).toEqual([
      ...RECOMMENDED_CHECKS,
    ].sort());
    expect(Object.keys(questions.recommended_check_secondary.criteria).sort()).toEqual([
      ...RECOMMENDED_CHECKS,
    ].sort());
    expect(Object.keys(questions.recommended_check_tertiary.criteria).sort()).toEqual([
      ...RECOMMENDED_CHECKS,
    ].sort());
    expect(Object.keys(questions.recommended_check.criteria).sort()).toEqual([
      ...RECOMMENDED_CHECKS,
    ].sort());
  });

  it('summarizes evidence without body dumps or patches', () => {
    const summary = summarizeState({
      evidence: buildEvidence({
        metadata: PrMetadataSchema.parse({
          number: 1,
          title: 't',
          body_excerpt: 'secret ghp_abcdefghijklmnopqrstuvwxyz012345',
          author: 'a',
          labels: ['bug'],
          draft: false,
          base_ref: 'main',
          head_ref: 'x',
          changed_requested_reviewers: 0,
          commits: 1,
        }),
        diff: emptyDiffSignals(),
      }),
      constraints: { min_confidence: 0.7 },
      note: 'note',
    });
    expect(summary).not.toHaveProperty('body_excerpt');
    expect(JSON.stringify(summary)).not.toContain('ghp_');
  });
});
