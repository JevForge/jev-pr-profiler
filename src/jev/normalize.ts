import {
  RECOMMENDED_CHECKS,
  type ReasonCode,
  type RecommendedCheck,
} from '../schemas/enums.js';
import {
  ProfilerDecisionSchema,
  type PrEvidence,
  type ProfilerDecision,
} from '../schemas/profiler.js';
import { assertDepth, assertRisk, filterAllowlistedChecks } from '../decision/policy.js';
import { defaultChecksForRisk } from '../schemas/enums.js';

export interface RawJevProfile {
  riskLevel: string | null;
  reviewDepth: string | null;
  /** Up to three allowlisted check ids from typed Jev choices. */
  recommendedChecks?: Array<string | null>;
  /** @deprecated Prefer recommendedChecks */
  recommendedCheck?: string | null;
  confidence: number;
  abstainProbability?: number;
  requestReviewProbability?: number;
  provisional?: boolean;
  explanation?: string;
  jevStatus?: ProfilerDecision['jev_status'];
}

function pickReasonCodes(evidence: PrEvidence, decision: ProfilerDecision['decision']): ReasonCode[] {
  const codes: ReasonCode[] = [];
  const { diff } = evidence;
  if (diff.touch_docs_only) codes.push('DOCS_ONLY');
  if (diff.additions + diff.deletions < 80 && diff.file_count <= 5) codes.push('SMALL_DIFF');
  if (diff.additions + diff.deletions >= 400 || diff.file_count >= 25) codes.push('LARGE_DIFF');
  if (diff.file_count >= 25) codes.push('MANY_FILES');
  if (diff.sensitive_paths.length) codes.push('SENSITIVE_PATHS');
  if (diff.touch_auth) codes.push('AUTH_SECURITY_TOUCH');
  if (diff.touch_infra) codes.push('INFRA_TOUCH');
  if (diff.touch_tests) codes.push('TESTS_INCLUDED');
  else if (!diff.touch_docs_only && diff.file_count > 0) codes.push('TESTS_MISSING');
  if (evidence.security && evidence.security.high + evidence.security.critical > 0) {
    codes.push('SECURITY_FINDINGS');
  }
  if (
    evidence.coverage &&
    typeof evidence.coverage.delta_lines_pct === 'number' &&
    evidence.coverage.delta_lines_pct <= -2
  ) {
    codes.push('COVERAGE_DROP');
  }
  if (evidence.incidents && evidence.incidents.recent_count > 0) {
    codes.push('INCIDENT_HISTORY');
  }
  if (decision === 'ABSTAIN') codes.push('POLICY_ABSTAIN');
  if (decision === 'REQUEST_REVIEW') codes.push('POLICY_REQUEST_REVIEW');
  return (codes.length ? codes : (['LOW_COMPLEXITY'] as ReasonCode[])).slice(0, 24);
}

function collectRecommendedChecks(raw: RawJevProfile): RecommendedCheck[] {
  const candidates = [
    ...(raw.recommendedChecks ?? []),
    raw.recommendedCheck ?? null,
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  return filterAllowlistedChecks(candidates, RECOMMENDED_CHECKS);
}

export function normalizeProfile(
  raw: RawJevProfile,
  evidence: PrEvidence,
): ProfilerDecision {
  let decision: ProfilerDecision['decision'] = 'PROFILE';

  if ((raw.abstainProbability ?? 0) >= 0.55) {
    decision = 'ABSTAIN';
  } else if ((raw.requestReviewProbability ?? 0) >= 0.55 && raw.confidence < 0.85) {
    decision = 'REQUEST_REVIEW';
  }

  if (decision === 'ABSTAIN') {
    return ProfilerDecisionSchema.parse({
      decision: 'ABSTAIN',
      risk_level: null,
      review_depth: null,
      recommended_checks: [],
      confidence: raw.confidence,
      reason_codes: pickReasonCodes(evidence, 'ABSTAIN'),
      explanation: raw.explanation ?? 'Jev abstained from profiling',
      provisional: raw.provisional ?? false,
      jev_status: raw.jevStatus ?? 'evaluated',
      policy_floor_risk: null,
    });
  }

  if (!raw.riskLevel || !raw.reviewDepth) {
    throw new Error('SCHEMA_REJECTED: missing risk_level or review_depth');
  }

  const risk_level = assertRisk(raw.riskLevel);
  const review_depth = assertDepth(raw.reviewDepth);
  const fromJev = collectRecommendedChecks(raw);
  const recommended_checks: RecommendedCheck[] =
    fromJev.length > 0
      ? [...new Set([...fromJev, ...defaultChecksForRisk(risk_level)])].slice(0, 16)
      : defaultChecksForRisk(risk_level);

  return ProfilerDecisionSchema.parse({
    decision: decision === 'REQUEST_REVIEW' ? 'REQUEST_REVIEW' : 'PROFILE',
    risk_level,
    review_depth,
    recommended_checks,
    confidence: raw.confidence,
    reason_codes: pickReasonCodes(evidence, decision),
    explanation: raw.explanation ?? '',
    provisional: raw.provisional ?? false,
    jev_status: raw.jevStatus ?? 'evaluated',
    policy_floor_risk: null,
  });
}

export function unavailableDecision(message: string): ProfilerDecision {
  return ProfilerDecisionSchema.parse({
    decision: 'ABSTAIN',
    risk_level: null,
    review_depth: null,
    recommended_checks: [],
    confidence: 0,
    reason_codes: ['JEV_UNAVAILABLE'],
    explanation: message,
    provisional: true,
    jev_status: 'unavailable',
    policy_floor_risk: null,
  });
}

export function choiceFromAnswers(
  answers: Record<string, { type?: string; choice?: string }> | undefined,
  key: string,
): string | null {
  const value = answers?.[key];
  if (value?.type === 'choice' && typeof value.choice === 'string') return value.choice;
  return null;
}
