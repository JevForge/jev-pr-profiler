import { describe, expect, it } from 'vitest';
import { buildReviewChecklist } from '../../src/decision/checklist.js';
import { ProfilerDecisionSchema, PrMetadataSchema } from '../../src/schemas/profiler.js';
import { buildEvidence } from '../../src/collectors/evidence.js';
import { summarizeDiffFiles } from '../../src/collectors/diff-signals.js';

describe('review checklist', () => {
  it('derives only allowlisted checklist items from evidence and decision', () => {
    const evidence = buildEvidence({
      metadata: PrMetadataSchema.parse({
        number: 1, title: 'api', body_excerpt: '', author: 'a', labels: [], draft: false,
        base_ref: 'main', head_ref: 'x', changed_requested_reviewers: 0, commits: 1,
      }),
      diff: summarizeDiffFiles([{ filename: 'src/api/routes.ts', status: 'modified', additions: 3, deletions: 1 }]),
    });
    const decision = ProfilerDecisionSchema.parse({
      decision: 'PROFILE', risk_level: 'HIGH', review_depth: 'THOROUGH',
      recommended_checks: ['unit_tests', 'security_scan'], confidence: 0.9,
      reason_codes: ['SENSITIVE_PATHS'], explanation: '', provisional: false,
      jev_status: 'evaluated', policy_floor_risk: 'HIGH',
    });
    const checklist = buildReviewChecklist(evidence, decision);
    expect(checklist).toContain('run_tests');
    expect(checklist).toContain('review_api_compatibility');
    expect(checklist).not.toContain('run_arbitrary_command');
  });
});
