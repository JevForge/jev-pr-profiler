import { describe, expect, it } from 'vitest';
import { applyRiskGate } from '../../src/decision/policy.js';
import { ProfilerDecisionSchema } from '../../src/schemas/profiler.js';

const decision = ProfilerDecisionSchema.parse({
  decision: 'PROFILE', risk_level: 'HIGH', review_depth: 'THOROUGH',
  recommended_checks: ['unit_tests'], confidence: 0.9,
  reason_codes: ['LARGE_DIFF'], explanation: '', provisional: false,
  jev_status: 'evaluated', policy_floor_risk: 'HIGH',
});

describe('fail_on_risk', () => {
  it('fails at the configured threshold and preserves the decision outputs', () => {
    const outcome = applyRiskGate({ status: 'ok', decision }, 'HIGH');
    expect(outcome.status).toBe('fail');
    expect(outcome.decision.risk_level).toBe('HIGH');
    expect(outcome.decision.reason_codes).toContain('FAIL_ON_RISK');
  });

  it('does not fail when the threshold is not reached', () => {
    const outcome = applyRiskGate({ status: 'ok', decision }, 'CRITICAL');
    expect(outcome.status).toBe('ok');
  });
});
