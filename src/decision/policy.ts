import {
  maxDepth,
  maxRisk,
  type LowConfidencePolicy,
  type ReasonCode,
  type RecommendedCheck,
  type ReviewDepth,
  type RiskLevel,
} from '../schemas/enums.js';
import {
  ProfilerDecisionSchema,
  type ProfilerDecision,
} from '../schemas/profiler.js';
import type { DeterministicFloor } from './floor.js';

function mergeReasons(current: ReasonCode[], ...extra: ReasonCode[]): ReasonCode[] {
  return [...new Set([...current, ...extra])].slice(0, 24) as ReasonCode[];
}

function mergeChecks(
  a: RecommendedCheck[],
  b: RecommendedCheck[],
): RecommendedCheck[] {
  return [...new Set([...a, ...b])].slice(0, 16);
}

export type PolicyOutcome =
  | { status: 'ok'; decision: ProfilerDecision }
  | { status: 'fail'; decision: ProfilerDecision; message: string }
  | { status: 'warn'; decision: ProfilerDecision; message: string }
  | { status: 'request-review'; decision: ProfilerDecision }
  | { status: 'no-op'; decision: ProfilerDecision; message: string };

/**
 * Raise Jev proposal to at least the deterministic floor. Never trusts free-form text as commands.
 */
export function applyFloor(
  decision: ProfilerDecision,
  floor: DeterministicFloor,
): ProfilerDecision {
  if (decision.decision !== 'PROFILE' || !decision.risk_level || !decision.review_depth) {
    return ProfilerDecisionSchema.parse({
      ...decision,
      policy_floor_risk: floor.risk,
      reason_codes: mergeReasons(decision.reason_codes, ...floor.reason_codes),
    });
  }

  const risk = maxRisk(decision.risk_level, floor.risk);
  const depth = maxDepth(decision.review_depth, floor.review_depth);
  const raised = risk !== decision.risk_level || depth !== decision.review_depth;

  return ProfilerDecisionSchema.parse({
    ...decision,
    risk_level: risk,
    review_depth: depth,
    recommended_checks: mergeChecks(decision.recommended_checks, floor.recommended_checks),
    reason_codes: mergeReasons(
      decision.reason_codes,
      ...floor.reason_codes,
      ...(raised ? (['POLICY_FLOOR_RAISED'] as ReasonCode[]) : []),
    ),
    policy_floor_risk: floor.risk,
  });
}

export function applyConfidencePolicy(
  decision: ProfilerDecision,
  minConfidence: number,
  policy: LowConfidencePolicy,
  floor: DeterministicFloor,
): PolicyOutcome {
  const floored = applyFloor(decision, floor);
  const validated = ProfilerDecisionSchema.parse(floored);

  if (
    validated.reason_codes.includes('JEV_UNAVAILABLE') ||
    validated.jev_status === 'unavailable'
  ) {
    const provisional = ProfilerDecisionSchema.parse({
      decision: 'REQUEST_REVIEW',
      risk_level: floor.risk,
      review_depth: floor.review_depth,
      recommended_checks: floor.recommended_checks,
      confidence: 0,
      reason_codes: mergeReasons(
        validated.reason_codes,
        'JEV_UNAVAILABLE',
        'POLICY_REQUEST_REVIEW',
      ),
      explanation: validated.explanation || 'Jev unavailable; using deterministic floor',
      provisional: true,
      jev_status: 'unavailable',
      policy_floor_risk: floor.risk,
    });

    if (policy === 'no-op') {
      return { status: 'no-op', decision: provisional, message: provisional.explanation };
    }
    if (policy === 'warn') {
      return { status: 'warn', decision: provisional, message: provisional.explanation };
    }
    if (policy === 'request-review') {
      return { status: 'request-review', decision: provisional };
    }
    return {
      status: 'fail',
      decision: provisional,
      message: provisional.explanation || 'JEV unavailable',
    };
  }

  if (validated.decision === 'ABSTAIN') {
    const provisional = ProfilerDecisionSchema.parse({
      ...validated,
      decision: 'REQUEST_REVIEW',
      risk_level: floor.risk,
      review_depth: floor.review_depth,
      recommended_checks: floor.recommended_checks,
      reason_codes: mergeReasons(
        validated.reason_codes,
        'POLICY_ABSTAIN',
        'POLICY_REQUEST_REVIEW',
      ),
      policy_floor_risk: floor.risk,
    });
    if (policy === 'no-op') {
      return { status: 'no-op', decision: provisional, message: 'Abstained' };
    }
    if (policy === 'warn') {
      return { status: 'warn', decision: provisional, message: 'Abstained' };
    }
    if (policy === 'request-review') {
      return { status: 'request-review', decision: provisional };
    }
    return { status: 'fail', decision: provisional, message: 'Profiler abstained' };
  }

  if (validated.decision === 'REQUEST_REVIEW') {
    return {
      status: 'request-review',
      decision: ProfilerDecisionSchema.parse({
        ...validated,
        risk_level: validated.risk_level ?? floor.risk,
        review_depth: validated.review_depth ?? floor.review_depth,
        recommended_checks:
          validated.recommended_checks.length > 0
            ? validated.recommended_checks
            : floor.recommended_checks,
        policy_floor_risk: floor.risk,
      }),
    };
  }

  if (validated.confidence < minConfidence) {
    const low = ProfilerDecisionSchema.parse({
      ...validated,
      decision: 'REQUEST_REVIEW',
      reason_codes: mergeReasons(
        validated.reason_codes,
        'LOW_CONFIDENCE',
        'POLICY_REQUEST_REVIEW',
      ),
      explanation: `Confidence ${validated.confidence} below min_confidence ${minConfidence}`,
      provisional: true,
      policy_floor_risk: floor.risk,
    });

    if (policy === 'fail') {
      return { status: 'fail', decision: low, message: low.explanation };
    }
    if (policy === 'warn') {
      return { status: 'warn', decision: validated, message: low.explanation };
    }
    if (policy === 'request-review') {
      return { status: 'request-review', decision: low };
    }
    return { status: 'no-op', decision: validated, message: low.explanation };
  }

  return { status: 'ok', decision: validated };
}

/** Keep only allowlisted checks from a Jev proposal. */
export function filterAllowlistedChecks(
  checks: string[],
  allowlist: readonly RecommendedCheck[],
): RecommendedCheck[] {
  const allow = new Set<string>(allowlist);
  return checks.filter((c): c is RecommendedCheck => allow.has(c)).slice(0, 16);
}

export function assertRisk(value: string): RiskLevel {
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL') {
    return value;
  }
  throw new Error(`SCHEMA_REJECTED: invalid risk_level ${value}`);
}

export function assertDepth(value: string): ReviewDepth {
  if (
    value === 'LIGHT' ||
    value === 'STANDARD' ||
    value === 'THOROUGH' ||
    value === 'EXPERT'
  ) {
    return value;
  }
  throw new Error(`SCHEMA_REJECTED: invalid review_depth ${value}`);
}
