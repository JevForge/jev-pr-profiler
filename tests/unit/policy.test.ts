import { describe, expect, it } from 'vitest';
import { ProfilerDecisionSchema } from '../../src/schemas/profiler.js';
import { applyConfidencePolicy, applyFloor } from '../../src/decision/policy.js';
import type { DeterministicFloor } from '../../src/decision/floor.js';

const floor: DeterministicFloor = {
  risk: 'HIGH',
  review_depth: 'THOROUGH',
  recommended_checks: ['unit_tests', 'security_scan', 'codeowners_review'],
  reason_codes: ['SENSITIVE_PATHS'],
};

describe('policy + schema', () => {
  it('accepts a valid PROFILE decision', () => {
    const decision = ProfilerDecisionSchema.parse({
      decision: 'PROFILE',
      risk_level: 'MEDIUM',
      review_depth: 'STANDARD',
      recommended_checks: ['unit_tests'],
      confidence: 0.9,
      reason_codes: ['LOW_COMPLEXITY'],
      explanation: 'ok',
      provisional: false,
      jev_status: 'evaluated',
      policy_floor_risk: null,
    });
    const raised = applyFloor(decision, floor);
    expect(raised.risk_level).toBe('HIGH');
    expect(raised.review_depth).toBe('THOROUGH');
    expect(raised.reason_codes).toContain('POLICY_FLOOR_RAISED');
    expect(raised.recommended_checks).toContain('security_scan');
  });

  it('rejects PROFILE without risk_level', () => {
    expect(() =>
      ProfilerDecisionSchema.parse({
        decision: 'PROFILE',
        risk_level: null,
        review_depth: 'STANDARD',
        recommended_checks: ['unit_tests'],
        confidence: 0.9,
        reason_codes: ['LOW_COMPLEXITY'],
        explanation: '',
        provisional: false,
        jev_status: 'evaluated',
        policy_floor_risk: null,
      }),
    ).toThrow();
  });

  it('rejects unknown recommended checks', () => {
    expect(() =>
      ProfilerDecisionSchema.parse({
        decision: 'PROFILE',
        risk_level: 'LOW',
        review_depth: 'LIGHT',
        recommended_checks: ['rm -rf /'],
        confidence: 0.9,
        reason_codes: ['LOW_COMPLEXITY'],
        explanation: '',
        provisional: false,
        jev_status: 'evaluated',
        policy_floor_risk: null,
      }),
    ).toThrow();
  });

  it('applies fail policy when Jev is unavailable', () => {
    const unavailable = ProfilerDecisionSchema.parse({
      decision: 'ABSTAIN',
      risk_level: null,
      review_depth: null,
      recommended_checks: [],
      confidence: 0,
      reason_codes: ['JEV_UNAVAILABLE'],
      explanation: 'down',
      provisional: true,
      jev_status: 'unavailable',
      policy_floor_risk: null,
    });
    const outcome = applyConfidencePolicy(unavailable, 0.7, 'fail', floor);
    expect(outcome.status).toBe('fail');
    expect(outcome.decision.decision).toBe('REQUEST_REVIEW');
    expect(outcome.decision.risk_level).toBe('HIGH');
  });

  it('maps ABSTAIN to REQUEST_REVIEW with floor and FLOOR_AFTER_ABSTAIN', () => {
    const abstain = ProfilerDecisionSchema.parse({
      decision: 'ABSTAIN',
      risk_level: null,
      review_depth: null,
      recommended_checks: [],
      confidence: 0.4,
      reason_codes: ['POLICY_ABSTAIN'],
      explanation: 'unclear',
      provisional: false,
      jev_status: 'evaluated',
      policy_floor_risk: null,
    });
    const outcome = applyConfidencePolicy(abstain, 0.7, 'request-review', floor);
    expect(outcome.status).toBe('request-review');
    expect(outcome.decision.decision).toBe('REQUEST_REVIEW');
    expect(outcome.decision.risk_level).toBe('HIGH');
    expect(outcome.decision.provisional).toBe(true);
    expect(outcome.decision.reason_codes).toContain('FLOOR_AFTER_ABSTAIN');
  });

  it('uses request-review policy without failing the job', () => {
    const low = ProfilerDecisionSchema.parse({
      decision: 'PROFILE',
      risk_level: 'LOW',
      review_depth: 'LIGHT',
      recommended_checks: ['unit_tests'],
      confidence: 0.2,
      reason_codes: ['LOW_COMPLEXITY'],
      explanation: '',
      provisional: false,
      jev_status: 'evaluated',
      policy_floor_risk: null,
    });
    const outcome = applyConfidencePolicy(low, 0.7, 'request-review', floor);
    expect(outcome.status).toBe('request-review');
    expect(outcome.decision.decision).toBe('REQUEST_REVIEW');
    expect(outcome.decision.risk_level).toBe('HIGH');
  });
});
