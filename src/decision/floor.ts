import {
  defaultChecksForRisk,
  maxDepth,
  maxRisk,
  type ReasonCode,
  type RecommendedCheck,
  type ReviewDepth,
  type RiskLevel,
} from '../schemas/enums.js';
import type { PrEvidence } from '../schemas/profiler.js';

export interface DeterministicFloor {
  risk: RiskLevel;
  review_depth: ReviewDepth;
  recommended_checks: RecommendedCheck[];
  reason_codes: ReasonCode[];
}

type MutableFloor = {
  risk: RiskLevel;
  review_depth: ReviewDepth;
  reasons: ReasonCode[];
  checks: Set<RecommendedCheck>;
};

/**
 * Pure deterministic floor from evidence. Jev may raise severity, never lower below this floor.
 */
export function computeDeterministicFloor(evidence: PrEvidence): DeterministicFloor {
  const state: MutableFloor = {
    risk: 'LOW',
    review_depth: 'LIGHT',
    reasons: [],
    checks: new Set<RecommendedCheck>(),
  };

  const { diff, metadata, security, coverage, incidents } = evidence;
  const churn = diff.additions + diff.deletions;
  const labels = metadata.labels.map(l => l.toLowerCase());

  // Docs-only: ignore doc churn volume. Only evidence overlays may raise severity.
  if (diff.touch_docs_only && diff.file_count > 0) {
    state.reasons.push('DOCS_ONLY', 'LOW_COMPLEXITY');
    state.checks.add('docs_review');
    applyEvidenceOverlays(state, { labels, security, coverage, incidents });
    return finalizeFloor(state);
  }

  if (diff.file_count === 0 && churn === 0) {
    state.reasons.push('SMALL_DIFF', 'LOW_COMPLEXITY');
    state.checks.add('unit_tests');
  } else if (churn < 80 && diff.file_count <= 5) {
    state.reasons.push('SMALL_DIFF', 'LOW_COMPLEXITY');
    state.risk = maxRisk(state.risk, 'LOW');
    state.review_depth = maxDepth(state.review_depth, 'LIGHT');
    state.checks.add('unit_tests');
  } else if (churn < 400 && diff.file_count <= 20) {
    state.reasons.push('LOW_COMPLEXITY');
    state.risk = maxRisk(state.risk, 'MEDIUM');
    state.review_depth = maxDepth(state.review_depth, 'STANDARD');
    for (const c of defaultChecksForRisk('MEDIUM')) state.checks.add(c);
  } else if (churn < 1_500 && diff.file_count <= 50) {
    state.reasons.push('LARGE_DIFF', 'HIGH_COMPLEXITY');
    state.risk = maxRisk(state.risk, 'HIGH');
    state.review_depth = maxDepth(state.review_depth, 'THOROUGH');
    for (const c of defaultChecksForRisk('HIGH')) state.checks.add(c);
  } else {
    state.reasons.push('LARGE_DIFF', 'MANY_FILES', 'HIGH_COMPLEXITY');
    state.risk = maxRisk(state.risk, 'CRITICAL');
    state.review_depth = maxDepth(state.review_depth, 'EXPERT');
    for (const c of defaultChecksForRisk('CRITICAL')) state.checks.add(c);
  }

  if (diff.file_count >= 25) {
    state.reasons.push('MANY_FILES');
    state.risk = maxRisk(state.risk, 'HIGH');
    state.review_depth = maxDepth(state.review_depth, 'THOROUGH');
  }

  if (diff.sensitive_paths.length > 0) {
    state.reasons.push('SENSITIVE_PATHS');
    state.risk = maxRisk(state.risk, 'HIGH');
    state.review_depth = maxDepth(state.review_depth, 'THOROUGH');
    state.checks.add('security_scan');
    state.checks.add('secrets_scan');
    state.checks.add('codeowners_review');
  }

  if (diff.touch_auth) {
    state.reasons.push('AUTH_SECURITY_TOUCH');
    state.risk = maxRisk(state.risk, 'HIGH');
    state.review_depth = maxDepth(state.review_depth, 'EXPERT');
    state.checks.add('security_scan');
    state.checks.add('privacy_review');
  }

  if (diff.touch_infra) {
    state.reasons.push('INFRA_TOUCH');
    state.risk = maxRisk(state.risk, 'HIGH');
    state.review_depth = maxDepth(state.review_depth, 'THOROUGH');
    state.checks.add('iac_scan');
  }

  if (diff.touch_migrations) {
    state.checks.add('migration_review');
    state.risk = maxRisk(state.risk, 'HIGH');
    state.review_depth = maxDepth(state.review_depth, 'THOROUGH');
  }

  const areas = new Set(diff.areas.map(area => area.area));
  if (areas.has('auth')) state.reasons.push('AREA_AUTH');
  if (areas.has('api')) {
    state.reasons.push('AREA_API');
    state.risk = maxRisk(state.risk, 'MEDIUM');
    state.review_depth = maxDepth(state.review_depth, 'STANDARD');
    state.checks.add('architecture_review');
  }
  if (areas.has('infra')) state.reasons.push('AREA_INFRA');
  if (areas.has('ui')) {
    state.reasons.push('AREA_UI');
    state.checks.add('accessibility_review');
  }
  if (areas.size >= 2) {
    state.reasons.push('CROSS_AREA');
    state.review_depth = maxDepth(state.review_depth, 'THOROUGH');
  }

  if (diff.touch_tests) {
    state.reasons.push('TESTS_INCLUDED');
  } else if (diff.file_count > 0) {
    state.reasons.push('TESTS_MISSING');
    state.checks.add('unit_tests');
    state.review_depth = maxDepth(state.review_depth, 'STANDARD');
  }

  if (diff.languages.length >= 4 && areas.size < 2) {
    state.reasons.push('CROSS_AREA');
    state.review_depth = maxDepth(state.review_depth, 'THOROUGH');
  }

  applyEvidenceOverlays(state, { labels, security, coverage, incidents });

  if (state.checks.size === 0) {
    for (const c of defaultChecksForRisk(state.risk)) state.checks.add(c);
  }

  return finalizeFloor(state);
}

function finalizeFloor(state: MutableFloor): DeterministicFloor {
  return {
    risk: state.risk,
    review_depth: state.review_depth,
    recommended_checks: [...state.checks].slice(0, 16),
    reason_codes: [...new Set(state.reasons)].slice(0, 24) as ReasonCode[],
  };
}

function applyEvidenceOverlays(
  state: MutableFloor,
  input: {
    labels: string[];
    security: PrEvidence['security'];
    coverage: PrEvidence['coverage'];
    incidents: PrEvidence['incidents'];
  },
): void {
  const { labels, security, coverage, incidents } = input;

  if (labels.some(l => l.includes('breaking') || l.includes('major'))) {
    state.reasons.push('LABELS_BREAKING');
    state.risk = maxRisk(state.risk, 'HIGH');
    state.review_depth = maxDepth(state.review_depth, 'EXPERT');
    state.checks.add('architecture_review');
  }

  if (labels.some(l => l.includes('hotfix') || l.includes('urgent') || l.includes('sev'))) {
    state.reasons.push('LABELS_HOTFIX');
    state.risk = maxRisk(state.risk, 'HIGH');
    state.review_depth = maxDepth(state.review_depth, 'THOROUGH');
  }

  if (security && (security.critical > 0 || security.high > 0)) {
    state.reasons.push('SECURITY_FINDINGS');
    state.risk = maxRisk(state.risk, security.critical > 0 ? 'CRITICAL' : 'HIGH');
    state.review_depth = maxDepth(
      state.review_depth,
      security.critical > 0 ? 'EXPERT' : 'THOROUGH',
    );
    state.checks.add('security_scan');
    state.checks.add('dependency_scan');
  }

  if (coverage && typeof coverage.delta_lines_pct === 'number' && coverage.delta_lines_pct <= -2) {
    state.reasons.push('COVERAGE_DROP');
    state.risk = maxRisk(state.risk, 'MEDIUM');
    state.review_depth = maxDepth(state.review_depth, 'STANDARD');
    state.checks.add('unit_tests');
    state.checks.add('integration_tests');
  }

  if (incidents && incidents.recent_count > 0) {
    state.reasons.push('INCIDENT_HISTORY');
    if (incidents.severity_max === 'critical' || incidents.severity_max === 'high') {
      state.risk = maxRisk(state.risk, 'CRITICAL');
      state.review_depth = maxDepth(state.review_depth, 'EXPERT');
    } else {
      state.risk = maxRisk(state.risk, 'HIGH');
      state.review_depth = maxDepth(state.review_depth, 'THOROUGH');
    }
    state.checks.add('e2e_tests');
    state.checks.add('architecture_review');
  }
}
